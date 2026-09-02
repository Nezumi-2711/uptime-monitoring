import { and, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { DEGRADED_MESSAGE, deterministicIncidentMessage } from '../ai/fallback-message';
import { getDb } from '../db/client';
import { checks, incidentMonitors, incidents, incidentUpdates, monitorDailyStats, monitors } from '../db/schema';
import { resolveStatusCacheSeconds } from '../lib/runtime-config';
import { loadActiveMaintenance, type ActiveMaintenance } from '../maintenance/windows';
import { resolveFavicon } from './monitors';

const DAY_MS = 24 * 60 * 60 * 1000;
const FAVICON_CACHE_SECONDS = 86_400;
type ServiceStatus = 'up' | 'degraded' | 'down' | 'unknown' | 'maintenance';
type OverallStatus = 'operational' | 'degraded' | 'down';
type DailyAggregate = { monitorId: number; day: Date; totalChecks: number; upChecks: number };
type EdgeCache = {
	match(request: RequestInfo | URL): Promise<Response | undefined>;
	put(request: RequestInfo | URL, response: Response): Promise<void>;
};

type PublicUpdate = { body: string; status: string; createdAt: Date };
type PublicIncident = {
	id: number;
	title: string | null;
	status: string;
	impact: string;
	source: string;
	kind: string;
	startedAt: Date;
	resolvedAt: Date | null;
	durationMs: number | null;
	startStatusCode: number | null;
};

function parseId(rawId: string) {
	const id = Number(rawId);
	return Number.isSafeInteger(id) && id > 0 ? id : null;
}
function parseLimit(raw: string | undefined, fallback: number, maximum: number) {
	if (!raw) return fallback;
	const value = Number(raw);
	return Number.isSafeInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
}
function roundUptime(upChecks: number, totalChecks: number) {
	return totalChecks > 0 ? Math.round((upChecks / totalChecks) * 1_000) / 10 : null;
}
function serviceStatus(lastOk: boolean | null, lastDegraded: boolean): ServiceStatus {
	if (lastOk === true) return lastDegraded ? 'degraded' : 'up';
	if (lastOk === false) return 'down';
	return 'unknown';
}
function overallStatus(statuses: ServiceStatus[], manualImpacts: string[]): OverallStatus {
	let checked = 0;
	let down = 0;
	for (const status of statuses) {
		if (status === 'unknown' || status === 'maintenance') continue;
		checked += 1;
		if (status === 'down') down += 1;
	}
	let severity = down === 0 ? 0 : down === checked ? 2 : 1;
	if (statuses.includes('degraded')) severity = Math.max(severity, 1);
	for (const impact of manualImpacts)
		severity = Math.max(severity, impact === 'critical' ? 2 : impact === 'minor' || impact === 'major' ? 1 : 0);
	return severity === 2 ? 'down' : severity === 1 ? 'degraded' : 'operational';
}
function publicIncidentTitle(incident: Pick<PublicIncident, 'title' | 'source'>) {
	return incident.title ?? (incident.source === 'auto' ? 'Service disruption' : 'Incident update');
}

async function loadServices(db: ReturnType<typeof getDb>, incidentIds: number[]) {
	if (incidentIds.length === 0) return new Map<number, Array<{ id: number; name: string }>>();
	const rows = await db
		.select({ incidentId: incidentMonitors.incidentId, id: monitors.id, name: monitors.name })
		.from(incidentMonitors)
		.innerJoin(monitors, eq(monitors.id, incidentMonitors.monitorId))
		.where(inArray(incidentMonitors.incidentId, incidentIds));
	const grouped = new Map<number, Array<{ id: number; name: string }>>();
	for (const row of rows) {
		const services = grouped.get(row.incidentId);
		if (services) services.push({ id: row.id, name: row.name });
		else grouped.set(row.incidentId, [{ id: row.id, name: row.name }]);
	}
	return grouped;
}

async function loadLatestUpdates(db: ReturnType<typeof getDb>, incidentIds: number[]) {
	if (incidentIds.length === 0) return new Map<number, PublicUpdate>();
	const rows = await db
		.select({
			incidentId: incidentUpdates.incidentId,
			body: incidentUpdates.body,
			status: incidentUpdates.status,
			createdAt: incidentUpdates.createdAt,
		})
		.from(incidentUpdates)
		.where(inArray(incidentUpdates.incidentId, incidentIds))
		.orderBy(desc(incidentUpdates.createdAt), desc(incidentUpdates.id));
	const latest = new Map<number, PublicUpdate>();
	for (const row of rows) if (!latest.has(row.incidentId)) latest.set(row.incidentId, row);
	return latest;
}

const incidentSelection = {
	id: incidents.id,
	title: incidents.title,
	status: incidents.status,
	impact: incidents.impact,
	source: incidents.source,
	kind: incidents.kind,
	startedAt: incidents.startedAt,
	resolvedAt: incidents.resolvedAt,
	durationMs: incidents.durationMs,
	startStatusCode: incidents.startStatusCode,
};

function edgeCache(): EdgeCache | null {
	try {
		return (caches as CacheStorage & { readonly default: EdgeCache }).default;
	} catch {
		return null;
	}
}

// Key on origin + path only. These responses do not vary by query string, so ignoring it also
// stops `?x=1`, `?x=2`, … spray from bypassing the cache and hammering D1 on every request.
function statusCacheKey(context: Context<{ Bindings: Env }>): Request {
	const url = new URL(context.req.url);
	return new Request(`${url.origin}${url.pathname}`);
}

/**
 * The public status endpoints are polled by every open status-page tab every 60s. Serving them
 * from the edge cache collapses that traffic to one origin computation per window and keeps the
 * `checks` / `monitor_daily_stats` scans they run off D1's free-tier read budget. Set the
 * STATUS_CACHE_SECONDS env var to 0 to disable.
 */
async function cachedStatusResponse(context: Context<{ Bindings: Env }>): Promise<Response | undefined> {
	if (resolveStatusCacheSeconds(context.env) <= 0) return undefined;
	const cache = edgeCache();
	if (!cache) return undefined;
	try {
		return await cache.match(statusCacheKey(context));
	} catch {
		return undefined;
	}
}

function jsonWithEdgeCache(context: Context<{ Bindings: Env }>, body: unknown): Response {
	const seconds = resolveStatusCacheSeconds(context.env);
	if (seconds <= 0) return Response.json(body);
	const response = Response.json(body, { headers: { 'Cache-Control': `public, max-age=${seconds}` } });
	const cache = edgeCache();
	if (cache) {
		try {
			context.executionCtx.waitUntil(cache.put(statusCacheKey(context), response.clone()).catch(() => undefined));
		} catch {
			// No ExecutionContext available (e.g. unit tests): serve without populating the edge cache.
		}
	}
	return response;
}

const statusRoutes = new Hono<{ Bindings: Env }>();

statusRoutes.get('/', async (context) => {
	const cached = await cachedStatusResponse(context);
	if (cached) return cached;
	const db = getDb(context.env);
	const monitorRows = await db
		.select({
			id: monitors.id,
			name: monitors.name,
			lastOk: monitors.lastOk,
			lastDegraded: monitors.lastDegraded,
			lastStatusCode: monitors.lastStatusCode,
			lastCheckedAt: monitors.lastCheckedAt,
		})
		.from(monitors)
		.where(eq(monitors.enabled, true))
		.orderBy(monitors.createdAt);
	const activeIncidentRows = await db
		.select(incidentSelection)
		.from(incidents)
		.where(isNull(incidents.resolvedAt))
		.orderBy(desc(incidents.startedAt));
	const incidentIds = activeIncidentRows.map((incident) => incident.id);
	const [incidentServices, latestUpdates] = await Promise.all([loadServices(db, incidentIds), loadLatestUpdates(db, incidentIds)]);

	const now = new Date();
	const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	const cutoff = today - 89 * DAY_MS;
	const monitorIds = monitorRows.map((monitor) => monitor.id);
	let historicalRows: DailyAggregate[] = [];
	let todayRows: DailyAggregate[] = [];
	let activeMaintenance = new Map<number, ActiveMaintenance>();
	if (monitorIds.length > 0) {
		[historicalRows, todayRows, activeMaintenance] = await Promise.all([
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
				.where(and(inArray(checks.monitorId, monitorIds), eq(checks.maintenance, false), gte(checks.checkedAt, new Date(today))))
				.groupBy(checks.monitorId),
			loadActiveMaintenance(db, now),
		]);
	}
	const bucketsByMonitor = new Map<number, DailyAggregate[]>();
	for (const row of [...historicalRows, ...todayRows]) {
		const buckets = bucketsByMonitor.get(row.monitorId);
		if (buckets) buckets.push(row);
		else bucketsByMonitor.set(row.monitorId, [row]);
	}
	const downIncidentByMonitor = new Map<number, PublicIncident>();
	const degradedIncidentByMonitor = new Map<number, PublicIncident>();
	for (const incident of activeIncidentRows) {
		const target = incident.kind === 'degraded' ? degradedIncidentByMonitor : downIncidentByMonitor;
		for (const service of incidentServices.get(incident.id) ?? []) if (!target.has(service.id)) target.set(service.id, incident);
	}
	const services = monitorRows.map((monitor) => {
		const buckets = bucketsByMonitor.get(monitor.id) ?? [];
		let totalChecks = 0;
		let upChecks = 0;
		const history = buckets.map((bucket) => {
			totalChecks += bucket.totalChecks;
			upChecks += bucket.upChecks;
			return {
				day: bucket.day instanceof Date ? bucket.day.getTime() : Number(bucket.day),
				uptimePct: roundUptime(bucket.upChecks, bucket.totalChecks),
			};
		});
		const downIncident = downIncidentByMonitor.get(monitor.id);
		const degradedIncident = degradedIncidentByMonitor.get(monitor.id);
		const maintenance = activeMaintenance.get(monitor.id);
		return {
			id: monitor.id,
			name: monitor.name,
			status: maintenance ? ('maintenance' as const) : serviceStatus(monitor.lastOk, monitor.lastDegraded),
			message:
				!maintenance && monitor.lastOk === false
					? downIncident
						? (latestUpdates.get(downIncident.id)?.body ?? deterministicIncidentMessage(downIncident.startStatusCode))
						: deterministicIncidentMessage(monitor.lastStatusCode)
					: !maintenance && monitor.lastOk === true && monitor.lastDegraded
						? degradedIncident
							? (latestUpdates.get(degradedIncident.id)?.body ?? DEGRADED_MESSAGE)
							: DEGRADED_MESSAGE
						: null,
			maintenance: maintenance ? { name: maintenance.name, endsAt: maintenance.endsAt.toISOString() } : null,
			lastCheckedAt: monitor.lastCheckedAt?.toISOString() ?? null,
			uptime90d: roundUptime(upChecks, totalChecks),
			history,
		};
	});
	const activeIncidents = activeIncidentRows.map((incident) => ({
		id: incident.id,
		title: publicIncidentTitle(incident),
		status: incident.status,
		impact: incident.impact,
		source: incident.source,
		startedAt: incident.startedAt.toISOString(),
		latestUpdate: latestUpdates.get(incident.id) ?? null,
		services: incidentServices.get(incident.id) ?? [],
	}));
	return jsonWithEdgeCache(context, {
		overall: overallStatus(
			services.map((service) => service.status),
			activeIncidentRows.filter((incident) => incident.source === 'manual').map((incident) => incident.impact),
		),
		updatedAt: Date.now(),
		services,
		activeIncidents,
	});
});

statusRoutes.get('/incidents', async (context) => {
	const cached = await cachedStatusResponse(context);
	if (cached) return cached;
	const db = getDb(context.env);
	const limit = parseLimit(context.req.query('limit'), 20, 20);
	const rows = await db
		.select(incidentSelection)
		.from(incidents)
		.where(and(eq(incidents.status, 'resolved'), gte(incidents.resolvedAt, new Date(Date.now() - 30 * DAY_MS))))
		.orderBy(desc(incidents.resolvedAt))
		.limit(limit);
	const incidentIds = rows.map((row) => row.id);
	const [services, latestUpdates] = await Promise.all([loadServices(db, incidentIds), loadLatestUpdates(db, incidentIds)]);
	return jsonWithEdgeCache(context, {
		incidents: rows.map((incident) => ({
			id: incident.id,
			title: publicIncidentTitle(incident),
			status: incident.status,
			impact: incident.impact,
			source: incident.source,
			startedAt: incident.startedAt.toISOString(),
			resolvedAt: incident.resolvedAt?.toISOString() ?? null,
			durationMs: incident.durationMs,
			latestUpdate: latestUpdates.get(incident.id) ?? null,
			services: services.get(incident.id) ?? [],
		})),
	});
});

statusRoutes.get('/incidents/:id', async (context) => {
	const cached = await cachedStatusResponse(context);
	if (cached) return cached;
	const id = parseId(context.req.param('id'));
	if (id === null) return context.json({ message: 'Incident not found' }, 404);
	const db = getDb(context.env);
	const [incident] = await db.select(incidentSelection).from(incidents).where(eq(incidents.id, id)).limit(1);
	if (!incident) return context.json({ message: 'Incident not found' }, 404);
	const [services, updates] = await Promise.all([
		loadServices(db, [id]),
		db
			.select({ status: incidentUpdates.status, body: incidentUpdates.body, createdAt: incidentUpdates.createdAt })
			.from(incidentUpdates)
			.where(eq(incidentUpdates.incidentId, id))
			.orderBy(incidentUpdates.createdAt, incidentUpdates.id),
	]);
	const timeline =
		updates.length > 0
			? updates
			: [{ status: incident.status, body: deterministicIncidentMessage(incident.startStatusCode), createdAt: incident.startedAt }];
	return jsonWithEdgeCache(context, {
		incident: {
			id: incident.id,
			title: publicIncidentTitle(incident),
			status: incident.status,
			impact: incident.impact,
			source: incident.source,
			startedAt: incident.startedAt.toISOString(),
			resolvedAt: incident.resolvedAt?.toISOString() ?? null,
			durationMs: incident.durationMs,
			services: services.get(id) ?? [],
			updates: timeline,
		},
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
		// Cache API availability is best-effort.
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
	if (cache) context.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
	return response;
});

export default statusRoutes;
