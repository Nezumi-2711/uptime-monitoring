import { and, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { deterministicIncidentMessage } from '../ai/fallback-message';
import { getDb } from '../db/client';
import { checks, incidents, monitorDailyStats, monitors } from '../db/schema';
import { resolveFavicon } from './monitors';

const DAY_MS = 24 * 60 * 60 * 1000;
const FAVICON_CACHE_SECONDS = 86_400;

type ServiceStatus = 'up' | 'down' | 'unknown';
type OverallStatus = 'operational' | 'degraded' | 'down';

type HistoryEntry = {
	day: number;
	uptimePct: number | null;
};

type DailyAggregate = {
	monitorId: number;
	day: Date;
	totalChecks: number;
	upChecks: number;
};

type OpenIncident = {
	monitorId: number;
	aiMessage: string | null;
	startStatusCode: number | null;
};

type EdgeCache = {
	match(request: RequestInfo | URL): Promise<Response | undefined>;
	put(request: RequestInfo | URL, response: Response): Promise<void>;
};

function parseId(rawId: string) {
	const id = Number(rawId);
	return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function roundUptime(upChecks: number, totalChecks: number) {
	return totalChecks > 0 ? Math.round((upChecks / totalChecks) * 1_000) / 10 : null;
}

function serviceStatus(lastOk: boolean | null): ServiceStatus {
	if (lastOk === true) return 'up';
	if (lastOk === false) return 'down';
	return 'unknown';
}

function overallStatus(statuses: ServiceStatus[]): OverallStatus {
	let checked = 0;
	let down = 0;
	for (const status of statuses) {
		if (status === 'unknown') continue;
		checked += 1;
		if (status === 'down') down += 1;
	}
	if (down === 0) return 'operational';
	if (down === checked) return 'down';
	return 'degraded';
}

const statusRoutes = new Hono<{ Bindings: Env }>();

statusRoutes.get('/', async (context) => {
	const db = getDb(context.env);
	const monitorRows = await db
		.select({
			id: monitors.id,
			name: monitors.name,
			lastOk: monitors.lastOk,
			lastCheckedAt: monitors.lastCheckedAt,
		})
		.from(monitors)
		.where(eq(monitors.enabled, true))
		.orderBy(monitors.createdAt);

	const now = new Date();
	const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	const cutoff = today - 89 * DAY_MS;
	const monitorIds = monitorRows.map((monitor) => monitor.id);
	let historicalRows: DailyAggregate[] = [];
	let todayRows: DailyAggregate[] = [];
	let openIncidentRows: OpenIncident[] = [];

	if (monitorIds.length > 0) {
		[historicalRows, todayRows, openIncidentRows] = await Promise.all([
			db
				.select({
					monitorId: monitorDailyStats.monitorId,
					day: monitorDailyStats.day,
					totalChecks: monitorDailyStats.totalChecks,
					upChecks: monitorDailyStats.upChecks,
				})
				.from(monitorDailyStats)
				.where(
					and(
						inArray(monitorDailyStats.monitorId, monitorIds),
						gte(monitorDailyStats.day, new Date(cutoff)),
						lt(monitorDailyStats.day, new Date(today)),
					),
				)
				.orderBy(monitorDailyStats.day),
			db
				.select({
					monitorId: checks.monitorId,
					day: sql<Date>`cast(${today} as integer)`,
					totalChecks: sql<number>`count(*)`,
					upChecks: sql<number>`coalesce(sum(case when ${checks.ok} = 1 then 1 else 0 end), 0)`,
				})
				.from(checks)
				.where(and(inArray(checks.monitorId, monitorIds), gte(checks.checkedAt, new Date(today))))
				.groupBy(checks.monitorId),
			db
				.select({
					monitorId: incidents.monitorId,
					aiMessage: incidents.aiMessage,
					startStatusCode: incidents.startStatusCode,
				})
				.from(incidents)
				.where(and(inArray(incidents.monitorId, monitorIds), isNull(incidents.resolvedAt))),
		]);
	}

	const bucketsByMonitor = new Map<number, DailyAggregate[]>();
	for (const row of [...historicalRows, ...todayRows]) {
		const buckets = bucketsByMonitor.get(row.monitorId);
		if (buckets) buckets.push(row);
		else bucketsByMonitor.set(row.monitorId, [row]);
	}
	const openIncidentsByMonitor = new Map(openIncidentRows.map((incident) => [incident.monitorId, incident]));

	const services = monitorRows.map((monitor) => {
		const buckets = bucketsByMonitor.get(monitor.id) ?? [];
		let totalChecks = 0;
		let upChecks = 0;
		const history: HistoryEntry[] = buckets.map((bucket) => {
			totalChecks += bucket.totalChecks;
			upChecks += bucket.upChecks;
			return {
				day: bucket.day instanceof Date ? bucket.day.getTime() : Number(bucket.day),
				uptimePct: roundUptime(bucket.upChecks, bucket.totalChecks),
			};
		});

		const openIncident = openIncidentsByMonitor.get(monitor.id);
		return {
			id: monitor.id,
			name: monitor.name,
			status: serviceStatus(monitor.lastOk),
			message:
				monitor.lastOk === false ? (openIncident?.aiMessage ?? deterministicIncidentMessage(openIncident?.startStatusCode ?? null)) : null,
			lastCheckedAt: monitor.lastCheckedAt?.toISOString() ?? null,
			uptime90d: roundUptime(upChecks, totalChecks),
			history,
		};
	});

	return context.json({
		overall: overallStatus(services.map((service) => service.status)),
		updatedAt: Date.now(),
		services,
	});
});

statusRoutes.get('/:id/favicon', async (context) => {
	const id = parseId(context.req.param('id'));
	if (id === null) return context.json({ message: 'Service not found' }, 404);
	const [monitor] = await getDb(context.env)
		.select({ url: monitors.url })
		.from(monitors)
		.where(and(eq(monitors.id, id), eq(monitors.enabled, true)))
		.limit(1);
	if (!monitor) return context.json({ message: 'Service not found' }, 404);

	const cacheKey = new Request(`${new URL(context.req.url).origin}/api/status/${id}/favicon`);
	let cache: EdgeCache | null = null;
	try {
		const defaultCache = (caches as CacheStorage & { readonly default: EdgeCache }).default;
		const cached = await defaultCache.match(cacheKey);
		if (cached) return cached;
		cache = defaultCache;
	} catch {
		// Cache API availability is best-effort, particularly in local and preview environments.
	}

	const favicon = await resolveFavicon(monitor.url);
	if (!favicon) return context.json({ message: 'No favicon' }, 404);

	const response = new Response(favicon.body, {
		headers: {
			'Cache-Control': `public, max-age=${FAVICON_CACHE_SECONDS}`,
			'Content-Length': String(favicon.body.byteLength),
			'Content-Type': favicon.contentType,
			'X-Content-Type-Options': 'nosniff',
		},
	});
	if (cache) {
		context.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
	}
	return response;
});

export default statusRoutes;
