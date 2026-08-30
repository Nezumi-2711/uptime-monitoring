import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env, exports as worker } from 'cloudflare:workers';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from '../src/worker/lib/password';
import { resolveFavicon } from '../src/worker/routes/monitors';

const ADMIN_PASSWORD = 'correct-horse-battery-staple';
const VALID_MONITOR = {
	name: 'Example',
	url: 'https://example.com/health',
	method: 'GET',
	expectedStatus: 200,
	intervalSeconds: 300,
	timeoutMs: 10_000,
};

async function seedAdmin() {
	await env.DB.batch([
		env.DB.prepare('DELETE FROM checks'),
		env.DB.prepare('DELETE FROM incident_updates'),
		env.DB.prepare('DELETE FROM incident_monitors'),
		env.DB.prepare('DELETE FROM incidents'),
		env.DB.prepare('DELETE FROM monitor_daily_stats'),
		env.DB.prepare('DELETE FROM notification_deliveries'),
		env.DB.prepare('DELETE FROM notification_channel_monitors'),
		env.DB.prepare('DELETE FROM notification_channels'),
		env.DB.prepare('DELETE FROM monitors'),
		env.DB.prepare('DELETE FROM login_attempts'),
		env.DB.prepare('DELETE FROM sessions'),
		env.DB.prepare('DELETE FROM admin_credentials'),
	]);
	const now = Date.now();
	await env.DB.prepare('INSERT INTO admin_credentials (id, password_hash, created_at, updated_at) VALUES (1, ?, ?, ?)')
		.bind(await hashPassword(ADMIN_PASSWORD), now, now)
		.run();
}

async function authenticatedCookie() {
	const response = await worker.default.fetch('https://example.com/api/auth/login', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'CF-Connecting-IP': '198.51.100.20',
			Origin: 'https://example.com',
		},
		body: JSON.stringify({ password: ADMIN_PASSWORD }),
	});
	return response.headers.get('Set-Cookie')?.split(';', 1)[0] ?? '';
}

function apiFetch(path: string, method = 'GET', cookie = '', body?: unknown) {
	return worker.default.fetch(`https://example.com${path}`, {
		method,
		headers: {
			...(cookie ? { Cookie: cookie } : {}),
			...(method !== 'GET' ? { Origin: 'https://example.com' } : {}),
			...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

async function createMonitor(cookie: string, overrides: Record<string, unknown> = {}) {
	return apiFetch('/api/monitors', 'POST', cookie, { ...VALID_MONITOR, ...overrides });
}

describe('monitor API', () => {
	beforeAll(async () => {
		const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };
		await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
	});
	beforeEach(seedAdmin);
	afterEach(() => vi.unstubAllGlobals());

	it('protects every monitor endpoint, including the collection path without a trailing slash', async () => {
		const requests = [
			apiFetch('/api/monitors'),
			apiFetch('/api/monitors/1/favicon'),
			apiFetch('/api/monitors', 'POST', '', VALID_MONITOR),
			apiFetch('/api/monitors/1', 'PATCH', '', { name: 'Changed' }),
			apiFetch('/api/monitors/1', 'DELETE'),
			apiFetch('/api/monitors/1/check', 'POST'),
		];
		const responses = await Promise.all(requests);
		for (const response of responses) {
			expect(response.status).toBe(401);
			expect(await response.json()).toEqual({ message: 'Authentication required' });
		}
	});

	it('proxies and caches a monitor favicon response', async () => {
		const cookie = await authenticatedCookie();
		const created = await (
			await createMonitor(cookie, { url: 'https://favicon-route.example.test/health' })
		).json<{ monitor: { id: number } }>();
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url = new URL(input.toString());
				expect(url.href).toBe('https://favicon-route.example.test/favicon.ico');
				return new Response(new Uint8Array([0, 0, 1, 0]), {
					headers: { 'Content-Type': 'image/x-icon' },
				});
			}),
		);

		const response = await apiFetch(`/api/monitors/${created.monitor.id}/favicon`, 'GET', cookie);
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('image/x-icon');
		expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400');
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0, 0, 1, 0]));
	});

	it('discovers a favicon declared in the website head', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(input.toString());
			if (url.pathname === '/favicon.ico') return new Response(null, { status: 404 });
			if (url.pathname === '/') {
				return new Response('<html><head><link rel="apple-touch-icon" href="/assets/icon.png"></head></html>', {
					headers: { 'Content-Type': 'text/html; charset=utf-8' },
				});
			}
			return new Response(new Uint8Array([137, 80, 78, 71]), {
				headers: { 'Content-Type': 'image/png' },
			});
		});
		vi.stubGlobal('fetch', fetchMock);

		const favicon = await resolveFavicon('https://favicon-head.example.test/status');
		expect(favicon?.contentType).toBe('image/png');
		expect(new Uint8Array(favicon?.body ?? new ArrayBuffer(0))).toEqual(new Uint8Array([137, 80, 78, 71]));
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it('does not fetch favicons from private network hosts', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		await expect(resolveFavicon('http://127.0.0.1/admin')).resolves.toBeNull();
		await expect(resolveFavicon('http://[::1]/admin')).resolves.toBeNull();
		await expect(resolveFavicon('http://10.0.0.1/admin')).resolves.toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('creates a valid monitor and returns it in the list', async () => {
		const cookie = await authenticatedCookie();
		const response = await createMonitor(cookie);
		const created = await response.json<{
			monitor: {
				id: number;
				name: string;
				enabled: boolean;
				alertsEnabled: boolean;
				retryCount: number;
				failureThreshold: number;
			};
		}>();

		expect(response.status).toBe(200);
		expect(created.monitor).toMatchObject({
			name: 'Example',
			enabled: true,
			alertsEnabled: true,
			retryCount: 1,
			failureThreshold: 2,
		});

		const listResponse = await apiFetch('/api/monitors', 'GET', cookie);
		const list = await listResponse.json<{ monitors: Array<{ id: number; url: string }> }>();
		expect(list.monitors).toHaveLength(1);
		expect(list.monitors[0]).toMatchObject({ id: created.monitor.id, url: 'https://example.com/health' });
	});

	it.each([
		[{ url: 'file:///etc/passwd' }, 'Enter a valid http or https URL'],
		[{ intervalSeconds: 60 }, 'intervalSeconds must be an integer between 300 and 86400'],
		[{ expectedStatus: 99 }, 'expectedStatus must be an integer between 100 and 599'],
		[{ retryCount: -1 }, 'retryCount must be an integer between 0 and 3'],
		[{ retryCount: 4 }, 'retryCount must be an integer between 0 and 3'],
		[{ failureThreshold: 0 }, 'failureThreshold must be an integer between 1 and 10'],
		[{ failureThreshold: 11 }, 'failureThreshold must be an integer between 1 and 10'],
		[{ requestHeaders: { Authorization: 'Bearer ok\r\nX-Evil: true' } }, 'Invalid value for header: Authorization'],
		[{ requestHeaders: { Host: 'example.test' } }, 'Header is not allowed: Host'],
		[
			{ requestHeaders: Object.fromEntries(Array.from({ length: 11 }, (_, index) => [`X-${index}`, 'value'])) },
			'requestHeaders cannot contain more than 10 headers',
		],
		[{ requestBody: '{}' }, 'requestBody can only be used with POST monitors'],
		[{ degradedLatencyMs: 0 }, 'degradedLatencyMs must be an integer between 1 and 30000'],
		[{ degradedLatencyMs: 30_001 }, 'degradedLatencyMs must be an integer between 1 and 30000'],
	] as const)('rejects invalid monitor input %o', async (overrides, message) => {
		const response = await createMonitor(await authenticatedCookie(), overrides);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ message });
	});

	it('patches only the requested fields', async () => {
		const cookie = await authenticatedCookie();
		const created = await (await createMonitor(cookie)).json<{ monitor: { id: number } }>();
		const response = await apiFetch(`/api/monitors/${created.monitor.id}`, 'PATCH', cookie, {
			name: 'Renamed endpoint',
			enabled: false,
			retryCount: 3,
			failureThreshold: 4,
		});
		const body = await response.json<{
			monitor: { name: string; url: string; enabled: boolean; retryCount: number; failureThreshold: number };
		}>();

		expect(response.status).toBe(200);
		expect(body.monitor).toMatchObject({
			name: 'Renamed endpoint',
			url: 'https://example.com/health',
			enabled: false,
			retryCount: 3,
			failureThreshold: 4,
		});
	});

	it('stores advanced settings and allows nullable fields to be cleared', async () => {
		const cookie = await authenticatedCookie();
		const created = await (
			await createMonitor(cookie, {
				method: 'POST',
				expectKeyword: 'healthy',
				keywordInverted: true,
				requestHeaders: { Authorization: 'Bearer test' },
				requestBody: '{"probe":true}',
				degradedLatencyMs: 1500,
			})
		).json<{ monitor: { id: number; requestHeaders: string } }>();
		expect(JSON.parse(created.monitor.requestHeaders)).toEqual({ Authorization: 'Bearer test' });

		const response = await apiFetch(`/api/monitors/${created.monitor.id}`, 'PATCH', cookie, {
			expectKeyword: null,
			requestHeaders: null,
			requestBody: null,
			degradedLatencyMs: null,
		});
		const body = await response.json<{
			monitor: { expectKeyword: null; requestHeaders: null; requestBody: null; degradedLatencyMs: null };
		}>();
		expect(body.monitor).toMatchObject({ expectKeyword: null, requestHeaders: null, requestBody: null, degradedLatencyMs: null });
	});

	it('does not allow clients to set the internal failure counter', async () => {
		const cookie = await authenticatedCookie();
		const created = await (await createMonitor(cookie)).json<{ monitor: { id: number } }>();
		const response = await apiFetch(`/api/monitors/${created.monitor.id}`, 'PATCH', cookie, { consecutiveFailures: 99 });
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ message: 'Provide at least one field to update' });
	});

	it('returns a pending transition without opening an incident on the first manual failure', async () => {
		const cookie = await authenticatedCookie();
		const created = await (await createMonitor(cookie, { retryCount: 0 })).json<{ monitor: { id: number } }>();
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 500 })),
		);

		const response = await apiFetch(`/api/monitors/${created.monitor.id}/check`, 'POST', cookie);
		const body = await response.json<{
			transition: string;
			result: { attempts: number };
			monitor: { lastOk: boolean | null; consecutiveFailures: number };
		}>();
		expect(body).toMatchObject({
			transition: 'pending',
			result: { attempts: 1 },
			monitor: { lastOk: null, consecutiveFailures: 1 },
		});
		const incident = await env.DB.prepare('SELECT COUNT(*) AS count FROM incidents').first<{ count: number }>();
		expect(incident?.count).toBe(0);
	});

	it('opens an incident when a manual check reaches the confirmation threshold', async () => {
		const cookie = await authenticatedCookie();
		const created = await (
			await createMonitor(cookie, { retryCount: 0, failureThreshold: 2 })
		).json<{
			monitor: { id: number };
		}>();
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 500 })),
		);

		const first = await apiFetch(`/api/monitors/${created.monitor.id}/check`, 'POST', cookie);
		const second = await apiFetch(`/api/monitors/${created.monitor.id}/check`, 'POST', cookie);

		expect((await first.json<{ transition: string }>()).transition).toBe('pending');
		expect((await second.json<{ transition: string }>()).transition).toBe('opened');
		const incident = await env.DB.prepare('SELECT COUNT(*) AS count FROM incident_monitors WHERE monitor_id = ?')
			.bind(created.monitor.id)
			.first<{ count: number }>();
		expect(incident?.count).toBe(1);
	});

	it('retries a manual check and returns the attempt count', async () => {
		const cookie = await authenticatedCookie();
		const created = await (await createMonitor(cookie, { retryCount: 1 })).json<{ monitor: { id: number } }>();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 500 }))
			.mockResolvedValueOnce(new Response(null, { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const response = await apiFetch(`/api/monitors/${created.monitor.id}/check`, 'POST', cookie);
		const body = await response.json<{ transition: null; result: { ok: boolean; attempts: number } }>();
		expect(body).toMatchObject({ transition: null, result: { ok: true, attempts: 2 } });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('returns detail, checks, incidents, and raw stats', async () => {
		const cookie = await authenticatedCookie();
		const created = await (await createMonitor(cookie)).json<{ monitor: { id: number } }>();
		const id = created.monitor.id;
		const now = Date.now();
		await env.DB.batch([
			env.DB.prepare('INSERT INTO checks (monitor_id, ok, status_code, latency_ms, checked_at) VALUES (?, 1, 200, 100, ?)').bind(
				id,
				now - 2000,
			),
			env.DB.prepare('INSERT INTO checks (monitor_id, ok, status_code, latency_ms, checked_at) VALUES (?, 0, 500, 300, ?)').bind(
				id,
				now - 1000,
			),
			env.DB.prepare(
				"INSERT INTO incidents (id, status, impact, source, started_at, start_status_code, start_error, created_at, updated_at) VALUES (100, 'investigating', 'major', 'auto', ?, 500, 'Down', ?, ?)",
			).bind(now - 1000, now - 1000, now - 1000),
			env.DB.prepare('INSERT INTO incident_monitors (incident_id, monitor_id) VALUES (100, ?)').bind(id),
		]);

		const [detail, checksResponse, incidentsResponse, statsResponse] = await Promise.all([
			apiFetch(`/api/monitors/${id}`, 'GET', cookie),
			apiFetch(`/api/monitors/${id}/checks`, 'GET', cookie),
			apiFetch(`/api/monitors/${id}/incidents`, 'GET', cookie),
			apiFetch(`/api/monitors/${id}/stats`, 'GET', cookie),
		]);
		expect((await detail.json<{ monitor: { id: number } }>()).monitor.id).toBe(id);
		expect((await checksResponse.json<{ checks: unknown[] }>()).checks).toHaveLength(2);
		expect((await incidentsResponse.json<{ incidents: unknown[] }>()).incidents).toHaveLength(1);
		const stats = await statsResponse.json<{
			windows: { '24h': { uptimePct: number; totalChecks: number; upChecks: number; avgLatencyMs: number; incidentCount: number } };
		}>();
		expect(stats.windows['24h']).toEqual({ uptimePct: 50, totalChecks: 2, upChecks: 1, avgLatencyMs: 200, incidentCount: 1 });
	});

	it('combines daily rollups with the current partial day for long-range stats', async () => {
		const cookie = await authenticatedCookie();
		const created = await (await createMonitor(cookie)).json<{ monitor: { id: number } }>();
		const id = created.monitor.id;
		const now = new Date();
		const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
		await env.DB.batch([
			env.DB.prepare(
				'INSERT INTO monitor_daily_stats (monitor_id, day, total_checks, up_checks, avg_latency_ms, min_latency_ms, max_latency_ms) VALUES (?, ?, 8, 6, 100, 50, 150)',
			).bind(id, today - 24 * 60 * 60 * 1000),
			env.DB.prepare('INSERT INTO checks (monitor_id, ok, status_code, latency_ms, checked_at) VALUES (?, 1, 200, 200, ?)').bind(
				id,
				today + 1000,
			),
			env.DB.prepare('INSERT INTO checks (monitor_id, ok, status_code, latency_ms, checked_at) VALUES (?, 1, 200, 200, ?)').bind(
				id,
				today + 2000,
			),
		]);

		const response = await apiFetch(`/api/monitors/${id}/stats`, 'GET', cookie);
		const stats = await response.json<{
			windows: { '30d': { uptimePct: number; totalChecks: number; upChecks: number; avgLatencyMs: number } };
		}>();
		expect(stats.windows['30d']).toMatchObject({
			uptimePct: 80,
			totalChecks: 10,
			upChecks: 8,
			avgLatencyMs: 120,
		});
	});

	it('deletes the monitor and its check records explicitly', async () => {
		const cookie = await authenticatedCookie();
		const created = await (await createMonitor(cookie)).json<{ monitor: { id: number } }>();
		await env.DB.prepare('INSERT INTO checks (monitor_id, ok, status_code, latency_ms, checked_at) VALUES (?, 1, 200, 12, ?)')
			.bind(created.monitor.id, Date.now())
			.run();

		const response = await apiFetch(`/api/monitors/${created.monitor.id}`, 'DELETE', cookie);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });

		const monitorCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM monitors').first<{ count: number }>();
		const checkCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM checks').first<{ count: number }>();
		expect(monitorCount?.count).toBe(0);
		expect(checkCount?.count).toBe(0);
	});
});
