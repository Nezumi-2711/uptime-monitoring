import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env, exports as worker } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEGRADED_MESSAGE } from '../src/worker/ai/fallback-message';

const DAY_MS = 24 * 60 * 60 * 1000;

type PublicStatusResponse = {
	overall: 'operational' | 'degraded' | 'down';
	updatedAt: number;
	services: Array<{
		id: number;
		name: string;
		status: 'up' | 'degraded' | 'down' | 'unknown' | 'maintenance';
		message: string | null;
		maintenance: { name: string; endsAt: string } | null;
		lastCheckedAt: string | null;
		uptime90d: number | null;
		history: Array<{ day: number; uptimePct: number | null }>;
	}>;
};

type IncidentHistoryResponse = {
	incidents: Array<{
		id: number;
		title: string;
		status: string;
		impact: string;
		source: string;
		startedAt: string;
		resolvedAt: string | null;
		durationMs: number | null;
		latestUpdate: { status: string; body: string; createdAt: string } | null;
		services: Array<{ id: number; name: string }>;
	}>;
};

async function resetDatabase() {
	await env.DB.batch([
		env.DB.prepare('DELETE FROM ai_events'),
		env.DB.prepare('DELETE FROM maintenance_window_monitors'),
		env.DB.prepare('DELETE FROM maintenance_windows'),
		env.DB.prepare('DELETE FROM checks'),
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
}

async function insertMonitor(input: {
	name: string;
	url?: string;
	enabled?: boolean;
	lastOk?: boolean | null;
	lastStatusCode?: number | null;
	lastLatencyMs?: number | null;
	lastError?: string | null;
	consecutiveFailures?: number;
	failureThreshold?: number;
	lastDegraded?: boolean;
}) {
	const now = Date.now();
	const result = await env.DB.prepare(
		`
		INSERT INTO monitors (
			name, url, method, expected_status, interval_seconds, timeout_ms,
			enabled, alerts_enabled, failure_threshold, consecutive_failures, last_ok, last_degraded, last_status_code, last_latency_ms,
			last_error, last_checked_at, created_at, updated_at
		) VALUES (?, ?, 'GET', 200, 300, 10000, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
	)
		.bind(
			input.name,
			input.url ?? `https://${input.name.toLowerCase()}.example.com/health`,
			input.enabled === false ? 0 : 1,
			input.failureThreshold ?? 2,
			input.consecutiveFailures ?? 0,
			input.lastOk === null || input.lastOk === undefined ? null : input.lastOk ? 1 : 0,
			input.lastDegraded ? 1 : 0,
			input.lastStatusCode ?? null,
			input.lastLatencyMs ?? null,
			input.lastError ?? null,
			now,
			now,
			now,
		)
		.run();
	return Number(result.meta.last_row_id);
}

function statusFetch(path = '/api/status') {
	return worker.default.fetch(`https://example.com${path}`);
}

describe('public status API', () => {
	beforeAll(async () => {
		const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };
		await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
	});
	beforeEach(resetDatabase);

	it('returns public status without authentication and omits sensitive monitor fields', async () => {
		await insertMonitor({
			name: 'Public API',
			lastOk: true,
			lastStatusCode: 200,
			lastLatencyMs: 42,
			lastError: 'sensitive diagnostic',
		});

		const response = await statusFetch();
		const body = await response.json<PublicStatusResponse>();

		expect(response.status).toBe(200);
		expect(body.overall).toBe('operational');
		expect(body.updatedAt).toEqual(expect.any(Number));
		expect(body.services).toHaveLength(1);
		expect(body.services[0]).toMatchObject({
			name: 'Public API',
			status: 'up',
			message: null,
			uptime90d: null,
			history: [],
		});
		for (const privateField of [
			'url',
			'lastError',
			'lastStatusCode',
			'lastLatencyMs',
			'method',
			'timeoutMs',
			'retryCount',
			'failureThreshold',
			'consecutiveFailures',
		]) {
			expect(body.services[0]).not.toHaveProperty(privateField);
		}
	});

	it('keeps a service operational while failures are unconfirmed', async () => {
		await insertMonitor({
			name: 'Flaky API',
			lastOk: true,
			consecutiveFailures: 1,
			failureThreshold: 2,
			lastStatusCode: 500,
			lastError: 'Expected HTTP 200, received 500',
		});

		const body = await (await statusFetch()).json<PublicStatusResponse>();
		expect(body.overall).toBe('operational');
		expect(body.services[0]).toMatchObject({ status: 'up', message: null });
	});

	it('reports a confirmed degraded monitor and public latency message', async () => {
		await insertMonitor({ name: 'Slow API', lastOk: true, lastDegraded: true, lastLatencyMs: 2200 });

		const body = await (await statusFetch()).json<PublicStatusResponse>();
		expect(body.overall).toBe('degraded');
		expect(body.services[0]).toMatchObject({ status: 'degraded', message: DEGRADED_MESSAGE });
	});

	it('uses an open degraded incident update as the public latency message', async () => {
		const monitorId = await insertMonitor({ name: 'Slow API', lastOk: true, lastDegraded: true, lastLatencyMs: 2200 });
		const now = Date.now();
		const inserted = await env.DB.prepare(
			"INSERT INTO incidents (status, impact, source, kind, started_at, created_at, updated_at) VALUES ('investigating', 'minor', 'auto', 'degraded', ?, ?, ?)",
		)
			.bind(now, now, now)
			.run();
		const incidentId = Number(inserted.meta.last_row_id);
		await env.DB.batch([
			env.DB.prepare('INSERT INTO incident_monitors (incident_id, monitor_id) VALUES (?, ?)').bind(incidentId, monitorId),
			env.DB.prepare(
				"INSERT INTO incident_updates (incident_id, status, body, source, created_at) VALUES (?, 'investigating', 'Performance remains slower than usual.', 'ai', ?)",
			).bind(incidentId, now),
		]);
		const body = await (await statusFetch()).json<PublicStatusResponse>();
		expect(body.services[0].message).toBe('Performance remains slower than usual.');
	});

	it('never shadows a down incident message with a degraded incident', async () => {
		const monitorId = await insertMonitor({ name: 'API', lastOk: false, lastDegraded: false, lastStatusCode: 503 });
		const now = Date.now();
		const degraded = await env.DB.prepare(
			"INSERT INTO incidents (status, impact, source, kind, started_at, created_at, updated_at) VALUES ('investigating', 'minor', 'auto', 'degraded', ?, ?, ?)",
		)
			.bind(now + 1, now + 1, now + 1)
			.run();
		const down = await env.DB.prepare(
			"INSERT INTO incidents (status, impact, source, kind, started_at, start_status_code, created_at, updated_at) VALUES ('investigating', 'major', 'auto', 'down', ?, 503, ?, ?)",
		)
			.bind(now, now, now)
			.run();
		await env.DB.batch([
			env.DB.prepare('INSERT INTO incident_monitors (incident_id, monitor_id) VALUES (?, ?)').bind(degraded.meta.last_row_id, monitorId),
			env.DB.prepare('INSERT INTO incident_monitors (incident_id, monitor_id) VALUES (?, ?)').bind(down.meta.last_row_id, monitorId),
			env.DB.prepare(
				"INSERT INTO incident_updates (incident_id, status, body, source, created_at) VALUES (?, 'investigating', 'Degraded copy.', 'ai', ?)",
			).bind(degraded.meta.last_row_id, now),
			env.DB.prepare(
				"INSERT INTO incident_updates (incident_id, status, body, source, created_at) VALUES (?, 'investigating', 'Down copy.', 'ai', ?)",
			).bind(down.meta.last_row_id, now),
		]);
		const body = await (await statusFetch()).json<PublicStatusResponse>();
		expect(body.services[0]).toMatchObject({ status: 'down', message: 'Down copy.' });
	});

	it('excludes disabled monitors and reports degraded health for a partial outage', async () => {
		await insertMonitor({ name: 'Healthy', lastOk: true });
		await insertMonitor({ name: 'Unavailable', lastOk: false });
		await insertMonitor({ name: 'Disabled secret', enabled: false, lastOk: false });
		await insertMonitor({ name: 'New service', lastOk: null });

		const response = await statusFetch();
		const body = await response.json<PublicStatusResponse>();

		expect(response.status).toBe(200);
		expect(body.overall).toBe('degraded');
		expect(body.services.map((service) => service.name)).toEqual(['Healthy', 'Unavailable', 'New service']);
		expect(body.services.map((service) => service.status)).toEqual(['up', 'down', 'unknown']);
	});

	it('reports a total outage when every checked service is down', async () => {
		await insertMonitor({ name: 'Website', lastOk: false });
		await insertMonitor({ name: 'API', lastOk: false });
		await insertMonitor({ name: 'Not checked', lastOk: null });

		const body = await (await statusFetch()).json<PublicStatusResponse>();
		expect(body.overall).toBe('down');
	});

	it('shows active maintenance without degrading overall status', async () => {
		const id = await insertMonitor({ name: 'Database', lastOk: false });
		const now = new Date();
		const startMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
		const result = await env.DB.prepare(
			"INSERT INTO maintenance_windows (name, start_minute, duration_minutes, timezone, enabled, created_at, updated_at) VALUES ('Nightly backup', ?, 60, 'UTC', 1, ?, ?)",
		)
			.bind(startMinute, now.getTime(), now.getTime())
			.run();
		await env.DB.prepare('INSERT INTO maintenance_window_monitors (window_id, monitor_id) VALUES (?, ?)')
			.bind(Number(result.meta.last_row_id), id)
			.run();

		const body = await (await statusFetch()).json<PublicStatusResponse>();
		expect(body.overall).toBe('operational');
		expect(body.services[0]).toMatchObject({
			status: 'maintenance',
			message: null,
			maintenance: { name: 'Nightly backup' },
		});
	});

	it("combines historical daily rollups and today's checks into 90-day uptime", async () => {
		const id = await insertMonitor({ name: 'Aggregated', lastOk: true });
		const now = new Date();
		const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
		await env.DB.batch([
			env.DB.prepare(
				'INSERT INTO monitor_daily_stats (monitor_id, day, total_checks, up_checks, avg_latency_ms, min_latency_ms, max_latency_ms) VALUES (?, ?, 8, 6, 100, 50, 150)',
			).bind(id, today - DAY_MS),
			env.DB.prepare('INSERT INTO checks (monitor_id, ok, status_code, latency_ms, checked_at) VALUES (?, 1, 200, 90, ?)').bind(
				id,
				today + 1_000,
			),
			env.DB.prepare('INSERT INTO checks (monitor_id, ok, status_code, latency_ms, checked_at) VALUES (?, 1, 200, 110, ?)').bind(
				id,
				today + 2_000,
			),
		]);

		const body = await (await statusFetch()).json<PublicStatusResponse>();
		const service = body.services[0];

		expect(service.uptime90d).toBe(80);
		expect(service.history).toEqual([
			{ day: today - DAY_MS, uptimePct: 75 },
			{ day: today, uptimePct: 100 },
		]);
	});

	it('keeps the administrative monitor collection protected', async () => {
		const response = await worker.default.fetch('https://example.com/api/monitors');
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ message: 'Authentication required' });
	});

	it('does not expose a favicon for a disabled service', async () => {
		const id = await insertMonitor({ name: 'Private', enabled: false });
		const response = await statusFetch(`/api/status/${id}/favicon`);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ message: 'Service not found' });
	});

	describe('incident history', () => {
		it('returns recent resolved incident details and excludes incidents older than 30 days', async () => {
			const monitorId = await insertMonitor({ name: 'Payments API', lastOk: true });
			const now = Date.now();
			const startedAt = now - 2 * 60 * 60 * 1_000;
			const resolvedAt = now - 60 * 60 * 1_000;
			const incidentResult = await env.DB.prepare(
				`INSERT INTO incidents (
					title, status, impact, source, started_at, resolved_at, duration_ms, created_at, updated_at
				) VALUES ('Payment processing disruption', 'resolved', 'critical', 'manual', ?, ?, ?, ?, ?)`,
			)
				.bind(startedAt, resolvedAt, resolvedAt - startedAt, startedAt, resolvedAt)
				.run();
			const incidentId = Number(incidentResult.meta.last_row_id);
			await env.DB.batch([
				env.DB.prepare('INSERT INTO incident_monitors (incident_id, monitor_id) VALUES (?, ?)').bind(incidentId, monitorId),
				env.DB.prepare(
					"INSERT INTO incident_updates (incident_id, status, body, source, created_at) VALUES (?, 'monitoring', 'Recovery is in progress.', 'manual', ?)",
				).bind(incidentId, startedAt + 15 * 60 * 1_000),
				env.DB.prepare(
					"INSERT INTO incident_updates (incident_id, status, body, source, created_at) VALUES (?, 'resolved', 'Payment processing has fully recovered.', 'manual', ?)",
				).bind(incidentId, resolvedAt),
				env.DB.prepare(
					`INSERT INTO incidents (
						title, status, impact, source, started_at, resolved_at, duration_ms, created_at, updated_at
					) VALUES ('Old disruption', 'resolved', 'minor', 'manual', ?, ?, ?, ?, ?)`,
				).bind(now - 32 * DAY_MS, now - 31 * DAY_MS, DAY_MS, now - 32 * DAY_MS, now - 31 * DAY_MS),
			]);

			const response = await statusFetch('/api/status/incidents');
			const body = await response.json<IncidentHistoryResponse>();

			expect(response.status).toBe(200);
			expect(body.incidents).toHaveLength(1);
			expect(body.incidents[0]).toMatchObject({
				id: incidentId,
				title: 'Payment processing disruption',
				status: 'resolved',
				impact: 'critical',
				source: 'manual',
				durationMs: resolvedAt - startedAt,
				services: [{ id: monitorId, name: 'Payments API' }],
				latestUpdate: {
					status: 'resolved',
					body: 'Payment processing has fully recovered.',
				},
			});
			expect(body.incidents[0].startedAt).toBe(new Date(startedAt).toISOString());
			expect(body.incidents[0].resolvedAt).toBe(new Date(resolvedAt).toISOString());
		});
	});
});
