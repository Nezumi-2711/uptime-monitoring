import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runDueChecks } from '../src/worker/checks/run-due-checks';
import type { MaintenanceWindowRow } from '../src/worker/maintenance/windows';
import { isWindowActive, localMinuteOfDay } from '../src/worker/maintenance/windows';

function windowRow(overrides: Partial<MaintenanceWindowRow> = {}): MaintenanceWindowRow {
	return {
		id: 1,
		name: 'Nightly backup',
		startMinute: 120,
		durationMinutes: 60,
		timezone: 'UTC',
		enabled: true,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		...overrides,
	};
}

async function resetDatabase() {
	await env.DB.batch([
		env.DB.prepare('DELETE FROM ai_events'),
		env.DB.prepare('DELETE FROM maintenance_window_monitors'),
		env.DB.prepare('DELETE FROM maintenance_windows'),
		env.DB.prepare('DELETE FROM checks'),
		env.DB.prepare('DELETE FROM incident_updates'),
		env.DB.prepare('DELETE FROM incident_monitors'),
		env.DB.prepare('DELETE FROM incidents'),
		env.DB.prepare('DELETE FROM monitor_daily_stats'),
		env.DB.prepare('DELETE FROM notification_deliveries'),
		env.DB.prepare('DELETE FROM notification_channel_monitors'),
		env.DB.prepare('DELETE FROM notification_channels'),
		env.DB.prepare('DELETE FROM monitors'),
	]);
}

async function insertMonitor(lastOk = 1) {
	const now = Date.now();
	const result = await env.DB.prepare(
		`INSERT INTO monitors
		 (name, url, method, expected_status, interval_seconds, timeout_ms, retry_count, failure_threshold,
		  consecutive_failures, enabled, alerts_enabled, last_ok, created_at, updated_at)
		 VALUES ('API', 'https://example.com', 'GET', 200, 300, 10000, 0, 1, 0, 1, 1, ?, ?, ?)`,
	)
		.bind(lastOk, now, now)
		.run();
	return Number(result.meta.last_row_id);
}

async function insertActiveWindow(monitorId: number, enabled = 1) {
	const now = new Date();
	const startMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
	const result = await env.DB.prepare(
		"INSERT INTO maintenance_windows (name, start_minute, duration_minutes, timezone, enabled, created_at, updated_at) VALUES ('Nightly backup', ?, 60, 'UTC', ?, ?, ?)",
	)
		.bind(startMinute, enabled, now.getTime(), now.getTime())
		.run();
	await env.DB.prepare('INSERT INTO maintenance_window_monitors (window_id, monitor_id) VALUES (?, ?)')
		.bind(Number(result.meta.last_row_id), monitorId)
		.run();
}

describe('maintenance windows', () => {
	beforeAll(async () => {
		const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };
		await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
	});
	beforeEach(resetDatabase);
	afterEach(() => vi.unstubAllGlobals());

	it('calculates ordinary, overnight, and IANA-timezone windows', () => {
		expect(isWindowActive(windowRow(), new Date('2026-08-29T02:30:00Z'))).toBe(true);
		expect(isWindowActive(windowRow(), new Date('2026-08-29T03:00:00Z'))).toBe(false);
		expect(isWindowActive(windowRow({ startMinute: 23 * 60 + 30 }), new Date('2026-08-29T23:45:00Z'))).toBe(true);
		expect(isWindowActive(windowRow({ startMinute: 23 * 60 + 30 }), new Date('2026-08-30T00:15:00Z'))).toBe(true);
		expect(isWindowActive(windowRow({ timezone: 'Asia/Ho_Chi_Minh' }), new Date('2026-08-28T19:30:00Z'))).toBe(true);
	});

	it('returns minute zero at local midnight', () => {
		expect(localMinuteOfDay(new Date('2026-08-29T00:00:00Z'), 'UTC')).toBe(0);
	});

	it('records failed probes as maintenance without incidents or monitor state changes', async () => {
		const id = await insertMonitor(1);
		await env.DB.prepare(
			'UPDATE monitors SET retry_count = 3, consecutive_failures = 1, consecutive_slow = 2, last_degraded = 1 WHERE id = ?',
		)
			.bind(id)
			.run();
		await insertActiveWindow(id);
		const fetchMock = vi.fn(async () => new Response(null, { status: 503 }));
		vi.stubGlobal('fetch', fetchMock);

		await runDueChecks(env);
		const check = await env.DB.prepare('SELECT maintenance, ok FROM checks WHERE monitor_id = ?').bind(id).first();
		const monitor = await env.DB.prepare(
			'SELECT last_ok, consecutive_failures, consecutive_slow, last_degraded, last_status_code FROM monitors WHERE id = ?',
		)
			.bind(id)
			.first();
		const incident = await env.DB.prepare('SELECT COUNT(*) AS count FROM incident_monitors WHERE monitor_id = ?')
			.bind(id)
			.first<{ count: number }>();
		expect(check).toMatchObject({ maintenance: 1, ok: 0 });
		expect(monitor).toMatchObject({
			last_ok: 1,
			consecutive_failures: 1,
			consecutive_slow: 2,
			last_degraded: 1,
			last_status_code: 503,
		});
		expect(incident?.count).toBe(0);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('opens an incident when the matching window is disabled', async () => {
		const id = await insertMonitor(1);
		await insertActiveWindow(id, 0);
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 503 })),
		);

		await runDueChecks(env);
		const check = await env.DB.prepare('SELECT maintenance FROM checks WHERE monitor_id = ?').bind(id).first();
		const incident = await env.DB.prepare('SELECT COUNT(*) AS count FROM incident_monitors WHERE monitor_id = ?')
			.bind(id)
			.first<{ count: number }>();
		expect(check).toMatchObject({ maintenance: 0 });
		expect(incident?.count).toBe(1);
	});
});
