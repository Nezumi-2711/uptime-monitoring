import { and, desc, eq, gte, isNull, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { generateIncidentMessage } from '../ai/incident-message';
import { buildResultStatements } from '../checks/persist-result';
import { runCheck } from '../checks/run-check';
import { getDb } from '../db/client';
import { checks, incidentMonitors, incidents, maintenanceWindowMonitors, monitors } from '../db/schema';
import { requireAuth, type AuthVariables } from '../lib/require-auth';
import { loadActiveMaintenance } from '../maintenance/windows';
import { isSafeRemoteUrl } from '../lib/safe-url';
import { sendIncidentAlert } from '../notifications/webhook';

type MonitorMethod = 'GET' | 'HEAD' | 'POST';

type ParsedMonitorInput = {
	name?: string;
	url?: string;
	method?: MonitorMethod;
	expectedStatus?: number;
	intervalSeconds?: number;
	timeoutMs?: number;
	enabled?: boolean;
	alertsEnabled?: boolean;
};

type ParseResult = { ok: true; value: ParsedMonitorInput } | { ok: false; message: string };

const METHODS = new Set<MonitorMethod>(['GET', 'HEAD', 'POST']);
const FAVICON_CACHE_SECONDS = 86_400;
const FAVICON_FETCH_TIMEOUT_MS = 5_000;
const MAX_FAVICON_BYTES = 1024 * 1024;
const MAX_HEAD_BYTES = 128 * 1024;
const MAX_REDIRECTS = 3;

type FaviconResult = {
	body: ArrayBuffer;
	contentType: string;
};

type EdgeCache = {
	match(request: RequestInfo | URL): Promise<Response | undefined>;
	put(request: RequestInfo | URL, response: Response): Promise<void>;
};

async function readBodyLimited(response: Response, maximum: number, truncate: boolean) {
	if (!response.body) return null;
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	let exceeded = false;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			const remaining = maximum - total;
			if (value.byteLength > remaining) {
				if (truncate && remaining > 0) {
					chunks.push(value.subarray(0, remaining));
					total += remaining;
				}
				exceeded = true;
				await reader.cancel();
				break;
			}
			chunks.push(value);
			total += value.byteLength;
		}
	} catch {
		return null;
	}

	if (exceeded && !truncate) return null;
	const body = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return body.buffer;
}

async function fetchRemote(url: URL, maximumBytes: number, truncate = false) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), FAVICON_FETCH_TIMEOUT_MS);
	let currentUrl = url;

	try {
		for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
			if (!isSafeRemoteUrl(currentUrl)) return null;
			const response = await fetch(currentUrl, {
				headers: {
					Accept: 'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,text/html;q=0.5,*/*;q=0.1',
					'User-Agent': 'Upwatch Favicon Proxy/1.0',
				},
				redirect: 'manual',
				signal: controller.signal,
			});

			if ([301, 302, 303, 307, 308].includes(response.status)) {
				if (response.body) await response.body.cancel().catch(() => undefined);
				const location = response.headers.get('Location');
				if (!location || redirects === MAX_REDIRECTS) return null;
				try {
					currentUrl = new URL(location, currentUrl);
				} catch {
					return null;
				}
				continue;
			}

			if (!response.ok) {
				if (response.body) await response.body.cancel().catch(() => undefined);
				return null;
			}

			const declaredLength = Number(response.headers.get('Content-Length'));
			if (!truncate && Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
				if (response.body) await response.body.cancel().catch(() => undefined);
				return null;
			}

			const body = await readBodyLimited(response, maximumBytes, truncate);
			if (!body) return null;
			return { body, headers: response.headers, url: currentUrl };
		}
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}

	return null;
}

function imageContentType(headers: Headers) {
	const contentType = headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase();
	if (!contentType || contentType === 'application/octet-stream') return 'image/x-icon';
	if (!contentType.startsWith('image/')) {
		return null;
	}
	return contentType;
}

function readTagAttribute(tag: string, name: string) {
	const attributes = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
	for (const match of tag.matchAll(attributes)) {
		if (match[1].toLowerCase() === name) return match[2] ?? match[3] ?? match[4] ?? '';
	}
	return null;
}

function findFaviconUrl(html: string, pageUrl: URL) {
	const closingHead = html.search(/<\/head\s*>/i);
	const head = closingHead >= 0 ? html.slice(0, closingHead) : html;
	let baseUrl = pageUrl;
	const baseTag = head.match(/<base\b[^>]*>/i)?.[0];
	const baseHref = baseTag ? readTagAttribute(baseTag, 'href') : null;
	if (baseHref) {
		try {
			const candidate = new URL(baseHref, pageUrl);
			if (isSafeRemoteUrl(candidate)) baseUrl = candidate;
		} catch {
			// Keep the page URL as the base when the document declares an invalid URL.
		}
	}

	for (const match of head.matchAll(/<link\b[^>]*>/gi)) {
		const rel = readTagAttribute(match[0], 'rel')?.toLowerCase().split(/\s+/) ?? [];
		if (!rel.includes('icon') && !rel.includes('apple-touch-icon')) continue;
		const href = readTagAttribute(match[0], 'href');
		if (!href) continue;
		try {
			const faviconUrl = new URL(href, baseUrl);
			if (isSafeRemoteUrl(faviconUrl)) return faviconUrl;
		} catch {
			// Try the next icon declaration.
		}
	}
	return null;
}

export async function resolveFavicon(siteUrl: string): Promise<FaviconResult | null> {
	let site: URL;
	try {
		site = new URL(siteUrl);
	} catch {
		return null;
	}
	if (!isSafeRemoteUrl(site)) return null;

	const origin = new URL(site.origin);
	const defaultIcon = await fetchRemote(new URL('/favicon.ico', origin), MAX_FAVICON_BYTES);
	if (defaultIcon && defaultIcon.body.byteLength > 0) {
		const contentType = imageContentType(defaultIcon.headers);
		if (contentType) return { body: defaultIcon.body, contentType };
	}

	const page = await fetchRemote(origin, MAX_HEAD_BYTES, true);
	if (!page || page.body.byteLength === 0) return null;
	const pageContentType = page.headers.get('Content-Type')?.toLowerCase();
	if (pageContentType && !pageContentType.includes('text/html') && !pageContentType.includes('application/xhtml+xml')) {
		return null;
	}
	const faviconUrl = findFaviconUrl(new TextDecoder().decode(page.body), page.url);
	if (!faviconUrl) return null;

	const icon = await fetchRemote(faviconUrl, MAX_FAVICON_BYTES);
	if (!icon || icon.body.byteLength === 0) return null;
	const contentType = imageContentType(icon.headers);
	return contentType ? { body: icon.body, contentType } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseInteger(
	value: unknown,
	name: string,
	minimum: number,
	maximum: number,
): { ok: true; value: number } | { ok: false; message: string } {
	if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
		return {
			ok: false,
			message: `${name} must be an integer between ${minimum} and ${maximum}`,
		};
	}
	return { ok: true, value: value as number };
}

export function parseMonitorInput(body: unknown, partial = false): ParseResult {
	if (!isRecord(body)) return { ok: false, message: 'Invalid request body' };

	const value: ParsedMonitorInput = {};
	if (!partial || 'name' in body) {
		if (typeof body.name !== 'string' || body.name.trim().length < 1 || body.name.trim().length > 100) {
			return { ok: false, message: 'Name must be between 1 and 100 characters' };
		}
		value.name = body.name.trim();
	}

	if (!partial || 'url' in body) {
		if (typeof body.url !== 'string') {
			return { ok: false, message: 'Enter a valid http or https URL' };
		}
		try {
			const url = new URL(body.url);
			if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Invalid protocol');
			value.url = url.toString();
		} catch {
			return { ok: false, message: 'Enter a valid http or https URL' };
		}
	}

	if (!partial || 'method' in body) {
		if (typeof body.method !== 'string' || !METHODS.has(body.method as MonitorMethod)) {
			return { ok: false, message: 'Method must be GET, HEAD, or POST' };
		}
		value.method = body.method as MonitorMethod;
	}

	for (const [key, label, minimum, maximum] of [
		['expectedStatus', 'expectedStatus', 100, 599],
		['intervalSeconds', 'intervalSeconds', 300, 86_400],
		['timeoutMs', 'timeoutMs', 1_000, 30_000],
	] as const) {
		if (!partial || key in body) {
			const parsed = parseInteger(body[key], label, minimum, maximum);
			if (!parsed.ok) return parsed;
			value[key] = parsed.value;
		}
	}

	if ('enabled' in body) {
		if (typeof body.enabled !== 'boolean') {
			return { ok: false, message: 'enabled must be a boolean' };
		}
		value.enabled = body.enabled;
	}
	if ('alertsEnabled' in body) {
		if (typeof body.alertsEnabled !== 'boolean') {
			return { ok: false, message: 'alertsEnabled must be a boolean' };
		}
		value.alertsEnabled = body.alertsEnabled;
	}

	return { ok: true, value };
}

function parseId(rawId: string) {
	const id = Number(rawId);
	return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseLimit(raw: string | undefined, fallback: number, maximum: number) {
	if (!raw) return fallback;
	const value = Number(raw);
	return Number.isSafeInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
}

type StatsWindow = {
	uptimePct: number | null;
	totalChecks: number;
	upChecks: number;
	avgLatencyMs: number | null;
	incidentCount: number;
};

function asStatsWindow(row: { totalChecks: number; upChecks: number; avgLatencyMs: number | null }, incidentCount: number): StatsWindow {
	return {
		uptimePct: row.totalChecks > 0 ? Math.round((row.upChecks / row.totalChecks) * 100_000) / 1_000 : null,
		totalChecks: row.totalChecks,
		upChecks: row.upChecks,
		avgLatencyMs: row.avgLatencyMs,
		incidentCount,
	};
}

const monitorRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

monitorRoutes.use('*', requireAuth);

monitorRoutes.get('/', async (context) => {
	const rows = await getDb(context.env).select().from(monitors).orderBy(monitors.createdAt);
	return context.json({ monitors: rows });
});

monitorRoutes.get('/:id', async (context) => {
	const id = parseId(context.req.param('id'));
	if (id === null) return context.json({ message: 'Monitor not found' }, 404);
	const [monitor] = await getDb(context.env).select().from(monitors).where(eq(monitors.id, id)).limit(1);
	if (!monitor) return context.json({ message: 'Monitor not found' }, 404);
	return context.json({ monitor });
});

monitorRoutes.get('/:id/checks', async (context) => {
	const id = parseId(context.req.param('id'));
	if (id === null) return context.json({ message: 'Monitor not found' }, 404);
	const limit = parseLimit(context.req.query('limit'), 100, 500);
	const rows = await getDb(context.env).select().from(checks).where(eq(checks.monitorId, id)).orderBy(desc(checks.checkedAt)).limit(limit);
	return context.json({ checks: rows });
});

monitorRoutes.get('/:id/incidents', async (context) => {
	const id = parseId(context.req.param('id'));
	if (id === null) return context.json({ message: 'Monitor not found' }, 404);
	const limit = parseLimit(context.req.query('limit'), 50, 200);
	const db = getDb(context.env);
	const rows = await db
		.select({
			id: incidents.id,
			title: incidents.title,
			status: incidents.status,
			impact: incidents.impact,
			source: incidents.source,
			startedAt: incidents.startedAt,
			resolvedAt: incidents.resolvedAt,
			startStatusCode: incidents.startStatusCode,
			startError: incidents.startError,
			durationMs: incidents.durationMs,
			createdAt: incidents.createdAt,
			updatedAt: incidents.updatedAt,
			latestUpdate: sql<{ body: string; status: string; createdAt: number } | null>`(
				select json_object('body', body, 'status', status, 'createdAt', created_at)
				from incident_updates where incident_id = ${incidents.id}
				order by created_at desc, id desc limit 1
			)`,
		})
		.from(incidents)
		.innerJoin(incidentMonitors, eq(incidentMonitors.incidentId, incidents.id))
		.where(eq(incidentMonitors.monitorId, id))
		.orderBy(desc(incidents.startedAt))
		.limit(limit);
	return context.json({
		incidents: rows.map((row) => ({
			...row,
			latestUpdate: typeof row.latestUpdate === 'string' ? JSON.parse(row.latestUpdate) : row.latestUpdate,
		})),
	});
});

monitorRoutes.get('/:id/stats', async (context) => {
	const id = parseId(context.req.param('id'));
	if (id === null) return context.json({ message: 'Monitor not found' }, 404);
	const db = getDb(context.env);
	const [monitor] = await db.select({ id: monitors.id }).from(monitors).where(eq(monitors.id, id)).limit(1);
	if (!monitor) return context.json({ message: 'Monitor not found' }, 404);

	const now = Date.now();
	const currentDayMs = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
	const windows = [
		{ key: '24h', start: now - 24 * 60 * 60 * 1000, raw: true },
		{ key: '7d', start: now - 7 * 24 * 60 * 60 * 1000, raw: true },
		{ key: '30d', start: currentDayMs - 29 * 24 * 60 * 60 * 1000, raw: false },
		{ key: '90d', start: currentDayMs - 89 * 24 * 60 * 60 * 1000, raw: false },
	] as const;

	const results = await Promise.all(
		windows.map(async (window) => {
			const [aggregate] = window.raw
				? await db
						.select({
							totalChecks: sql<number>`count(*)`,
							upChecks: sql<number>`coalesce(sum(case when ${checks.ok} = 1 then 1 else 0 end), 0)`,
							avgLatencyMs: sql<number | null>`round(avg(${checks.latencyMs}))`,
						})
						.from(checks)
						.where(and(eq(checks.monitorId, id), eq(checks.maintenance, false), gte(checks.checkedAt, new Date(window.start))))
				: await db.select({
						totalChecks: sql<number>`coalesce(sum(total_checks), 0)`,
						upChecks: sql<number>`coalesce(sum(up_checks), 0)`,
						avgLatencyMs: sql<number | null>`round(sum(avg_latency_ms * total_checks) / nullif(sum(total_checks), 0))`,
					}).from(sql`(
				select total_checks, up_checks, avg_latency_ms
				from monitor_daily_stats
				where monitor_id = ${id} and day >= ${window.start} and day < ${currentDayMs}
				union all
				select count(*), coalesce(sum(case when ok = 1 then 1 else 0 end), 0), round(avg(latency_ms))
				from checks
				where monitor_id = ${id} and checked_at >= ${currentDayMs} and maintenance = 0
			)`);
			const [incidentAggregate] = await db
				.select({ count: sql<number>`count(*)` })
				.from(incidents)
				.innerJoin(incidentMonitors, eq(incidentMonitors.incidentId, incidents.id))
				.where(
					and(
						eq(incidentMonitors.monitorId, id),
						gte(incidents.startedAt, new Date(window.start)),
						or(isNull(incidents.resolvedAt), gte(incidents.resolvedAt, new Date(window.start))),
					),
				);
			return [window.key, asStatsWindow(aggregate, incidentAggregate.count)] as const;
		}),
	);

	return context.json({ windows: Object.fromEntries(results) as Record<(typeof windows)[number]['key'], StatsWindow> });
});

monitorRoutes.get('/:id/favicon', async (context) => {
	const id = parseId(context.req.param('id'));
	if (id === null) return context.json({ message: 'Monitor not found' }, 404);
	const [monitor] = await getDb(context.env).select({ url: monitors.url }).from(monitors).where(eq(monitors.id, id)).limit(1);
	if (!monitor) return context.json({ message: 'Monitor not found' }, 404);

	const cacheKey = new Request(`${new URL(context.req.url).origin}/api/monitors/${id}/favicon`);
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

monitorRoutes.post('/', async (context) => {
	let body: unknown;
	try {
		body = await context.req.json();
	} catch {
		return context.json({ message: 'Invalid request body' }, 400);
	}

	const parsed = parseMonitorInput(body);
	if (!parsed.ok) return context.json({ message: parsed.message }, 400);

	const now = new Date();
	const [monitor] = await getDb(context.env)
		.insert(monitors)
		.values({
			name: parsed.value.name!,
			url: parsed.value.url!,
			method: parsed.value.method!,
			expectedStatus: parsed.value.expectedStatus!,
			intervalSeconds: parsed.value.intervalSeconds!,
			timeoutMs: parsed.value.timeoutMs!,
			enabled: parsed.value.enabled ?? true,
			alertsEnabled: parsed.value.alertsEnabled ?? true,
			createdAt: now,
			updatedAt: now,
		})
		.returning();

	return context.json({ monitor });
});

monitorRoutes.patch('/:id', async (context) => {
	const id = parseId(context.req.param('id'));
	if (id === null) return context.json({ message: 'Monitor not found' }, 404);

	let body: unknown;
	try {
		body = await context.req.json();
	} catch {
		return context.json({ message: 'Invalid request body' }, 400);
	}

	const parsed = parseMonitorInput(body, true);
	if (!parsed.ok) return context.json({ message: parsed.message }, 400);
	if (Object.keys(parsed.value).length === 0) {
		return context.json({ message: 'Provide at least one field to update' }, 400);
	}

	const [monitor] = await getDb(context.env)
		.update(monitors)
		.set({ ...parsed.value, updatedAt: new Date() })
		.where(eq(monitors.id, id))
		.returning();
	if (!monitor) return context.json({ message: 'Monitor not found' }, 404);

	return context.json({ monitor });
});

monitorRoutes.delete('/:id', async (context) => {
	const id = parseId(context.req.param('id'));
	if (id === null) return context.json({ message: 'Monitor not found' }, 404);

	const db = getDb(context.env);
	const [monitor] = await db.select({ id: monitors.id }).from(monitors).where(eq(monitors.id, id)).limit(1);
	if (!monitor) return context.json({ message: 'Monitor not found' }, 404);

	await db.batch([
		db.delete(maintenanceWindowMonitors).where(eq(maintenanceWindowMonitors.monitorId, id)),
		db.delete(incidentMonitors).where(eq(incidentMonitors.monitorId, id)),
		db.delete(checks).where(eq(checks.monitorId, id)),
		db.delete(monitors).where(eq(monitors.id, id)),
	]);
	return context.json({ ok: true });
});

monitorRoutes.post('/:id/check', async (context) => {
	const id = parseId(context.req.param('id'));
	if (id === null) return context.json({ message: 'Monitor not found' }, 404);

	const db = getDb(context.env);
	const [monitor] = await db.select().from(monitors).where(eq(monitors.id, id)).limit(1);
	if (!monitor) return context.json({ message: 'Monitor not found' }, 404);

	const result = await runCheck(monitor);
	const checkedAt = new Date();
	const activeMaintenance = await loadActiveMaintenance(db, checkedAt);
	const { statements, transition } = buildResultStatements(db, monitor, result, checkedAt, activeMaintenance.has(monitor.id));
	await db.batch(statements as [(typeof statements)[number], ...typeof statements]);
	if (transition) {
		await sendIncidentAlert(context.env, { monitor, kind: transition, result, at: checkedAt });
		if (transition === 'opened') {
			await generateIncidentMessage(context.env, { monitor, result });
		}
	}
	const [updated] = await db.select().from(monitors).where(eq(monitors.id, monitor.id)).limit(1);

	return context.json({ result, monitor: updated });
});

export default monitorRoutes;
