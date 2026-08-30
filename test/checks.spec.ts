import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runDueChecks } from '../src/worker/checks/run-due-checks';

async function clearMonitoringTables() {
	await env.DB.batch([
		env.DB.prepare('DELETE FROM maintenance_window_monitors'),
		env.DB.prepare('DELETE FROM maintenance_windows'),
		env.DB.prepare('DELETE FROM checks'),
		env.DB.prepare('DELETE FROM incident_updates'),
		env.DB.prepare('DELETE FROM incident_monitors'),
		env.DB.prepare('DELETE FROM incidents'),
		env.DB.prepare('DELETE FROM monitor_daily_stats'),
		env.DB.prepare('DELETE FROM notification_settings'),
		env.DB.prepare('DELETE FROM monitors'),
	]);
}

async function insertMonitor(overrides: Record<string, unknown> = {}) {
	const now = Date.now();
	const values = {
		name: 'Example',
		url: 'https://example.com/health',
		method: 'GET',
		expected_status: 200,
		interval_seconds: 300,
		timeout_ms: 10_000,
		enabled: 1,
		last_checked_at: null,
		created_at: now,
		updated_at: now,
		...overrides,
	};
	const result = await env.DB.prepare(
		`
		INSERT INTO monitors
		(name, url, method, expected_status, interval_seconds, timeout_ms, enabled, alerts_enabled, last_ok, last_checked_at, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
	`,
	)
		.bind(
			values.name,
			values.url,
			values.method,
			values.expected_status,
			values.interval_seconds,
			values.timeout_ms,
			values.enabled,
			overrides.last_ok ?? null,
			values.last_checked_at,
			values.created_at,
			values.updated_at,
		)
		.run();
	return Number(result.meta.last_row_id);
}

describe('scheduled monitor checks', () => {
	beforeAll(async () => {
		const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };
		await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
	});
	beforeEach(clearMonitoringTables);
	afterEach(() => vi.unstubAllGlobals());

	it('records a successful check and updates the monitor snapshot', async () => {
		const id = await insertMonitor();
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 200 })),
		);

		const summary = await runDueChecks(env);
		expect(summary).toEqual({ checked: 1, up: 1, down: 0 });

		const monitor = await env.DB.prepare('SELECT last_ok, last_status_code, last_latency_ms, last_checked_at FROM monitors WHERE id = ?')
			.bind(id)
			.first<{ last_ok: number; last_status_code: number; last_latency_ms: number; last_checked_at: number }>();
		expect(monitor).toMatchObject({ last_ok: 1, last_status_code: 200 });
		expect(monitor?.last_latency_ms).toEqual(expect.any(Number));
		expect(monitor?.last_checked_at).toEqual(expect.any(Number));

		const checkCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM checks WHERE monitor_id = ?')
			.bind(id)
			.first<{ count: number }>();
		expect(checkCount?.count).toBe(1);
	});

	it('records a mismatched status as down with a useful error', async () => {
		const id = await insertMonitor();
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 500 })),
		);

		const summary = await runDueChecks(env);
		expect(summary).toEqual({ checked: 1, up: 0, down: 1 });

		const monitor = await env.DB.prepare('SELECT last_ok, last_status_code, last_error FROM monitors WHERE id = ?')
			.bind(id)
			.first<{ last_ok: number; last_status_code: number; last_error: string }>();
		expect(monitor).toEqual({
			last_ok: 0,
			last_status_code: 500,
			last_error: 'Expected HTTP 200, received 500',
		});
		const incident = await env.DB.prepare(
			'SELECT im.monitor_id, i.resolved_at, i.start_status_code, i.start_error FROM incidents i JOIN incident_monitors im ON im.incident_id = i.id WHERE im.monitor_id = ?',
		)
			.bind(id)
			.first<{ monitor_id: number; resolved_at: number | null; start_status_code: number; start_error: string }>();
		expect(incident).toEqual({
			monitor_id: id,
			resolved_at: null,
			start_status_code: 500,
			start_error: 'Expected HTTP 200, received 500',
		});
	});

	it('does not open duplicate incidents while a monitor stays down', async () => {
		const id = await insertMonitor({ last_ok: 0 });
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 503 })),
		);
		await runDueChecks(env);
		const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM incident_monitors WHERE monitor_id = ?')
			.bind(id)
			.first<{ count: number }>();
		expect(count?.count).toBe(0);
	});

	it('links each auto incident to the correct monitor in one scheduled batch', async () => {
		const firstId = await insertMonitor({ name: 'First', url: 'https://first.example.com' });
		const secondId = await insertMonitor({ name: 'Second', url: 'https://second.example.com' });
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 503 })),
		);

		await runDueChecks(env);
		const assignments = await env.DB.prepare('SELECT incident_id, monitor_id FROM incident_monitors ORDER BY incident_id').all<{
			incident_id: number;
			monitor_id: number;
		}>();
		expect(assignments.results.map((row) => row.monitor_id)).toEqual([firstId, secondId]);
		expect(new Set(assignments.results.map((row) => row.incident_id)).size).toBe(2);
	});

	it('resolves the open incident on recovery', async () => {
		const id = await insertMonitor({ last_ok: 0 });
		const startedAt = Date.now() - 60_000;
		const inserted = await env.DB.prepare(
			"INSERT INTO incidents (status, impact, source, started_at, start_status_code, start_error, created_at, updated_at) VALUES ('investigating', 'major', 'auto', ?, 500, 'Down', ?, ?)",
		)
			.bind(startedAt, startedAt, startedAt)
			.run();
		await env.DB.prepare('INSERT INTO incident_monitors (incident_id, monitor_id) VALUES (?, ?)').bind(inserted.meta.last_row_id, id).run();
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 200 })),
		);

		await runDueChecks(env);
		const incident = await env.DB.prepare('SELECT resolved_at, duration_ms FROM incidents WHERE id = ?')
			.bind(inserted.meta.last_row_id)
			.first<{ resolved_at: number | null; duration_ms: number | null }>();
		expect(incident?.resolved_at).toEqual(expect.any(Number));
		expect(incident?.duration_ms).toBeGreaterThanOrEqual(60_000);
	});

	it('skips disabled and not-yet-due monitors', async () => {
		await insertMonitor({ name: 'Disabled', enabled: 0 });
		await insertMonitor({ name: 'Recent', last_checked_at: Date.now() });
		const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const summary = await runDueChecks(env);
		expect(summary).toEqual({ checked: 0, up: 0, down: 0 });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
