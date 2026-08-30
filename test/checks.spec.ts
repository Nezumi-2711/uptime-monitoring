import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_RETRY_ATTEMPTS_PER_RUN, runDueChecks } from '../src/worker/checks/run-due-checks';

async function clearMonitoringTables() {
	await env.DB.batch([
		env.DB.prepare('DELETE FROM maintenance_window_monitors'),
		env.DB.prepare('DELETE FROM maintenance_windows'),
		env.DB.prepare('DELETE FROM checks'),
		env.DB.prepare('DELETE FROM incident_updates'),
		env.DB.prepare('DELETE FROM incident_monitors'),
		env.DB.prepare('DELETE FROM incidents'),
		env.DB.prepare('DELETE FROM monitor_daily_stats'),
		env.DB.prepare('DELETE FROM ai_settings'),
		env.DB.prepare('DELETE FROM notification_deliveries'),
		env.DB.prepare('DELETE FROM notification_channel_monitors'),
		env.DB.prepare('DELETE FROM notification_channels'),
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
		expect_keyword: null,
		keyword_inverted: 0,
		request_headers: null,
		request_body: null,
		degraded_latency_ms: null,
		interval_seconds: 300,
		timeout_ms: 10_000,
		retry_count: 0,
		failure_threshold: 2,
		consecutive_failures: 0,
		consecutive_slow: 0,
		enabled: 1,
		last_degraded: 0,
		last_checked_at: null,
		created_at: now,
		updated_at: now,
		...overrides,
	};
	const result = await env.DB.prepare(
		`
		INSERT INTO monitors
		(name, url, method, expected_status, expect_keyword, keyword_inverted, request_headers, request_body,
		 degraded_latency_ms, interval_seconds, timeout_ms, retry_count, failure_threshold, consecutive_failures,
		 consecutive_slow, enabled, alerts_enabled, last_ok, last_degraded, last_checked_at, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
	`,
	)
		.bind(
			values.name,
			values.url,
			values.method,
			values.expected_status,
			values.expect_keyword,
			values.keyword_inverted,
			values.request_headers,
			values.request_body,
			values.degraded_latency_ms,
			values.interval_seconds,
			values.timeout_ms,
			values.retry_count,
			values.failure_threshold,
			values.consecutive_failures,
			values.consecutive_slow,
			values.enabled,
			overrides.last_ok ?? null,
			values.last_degraded,
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
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('records a successful check and updates the monitor snapshot', async () => {
		const id = await insertMonitor();
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 200 })),
		);

		const summary = await runDueChecks(env);
		expect(summary).toEqual({ checked: 1, up: 1, down: 0, pending: 0, opened: 0, retries: 0 });

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

	it('passes a case-insensitive keyword assertion and sends configured request data', async () => {
		await insertMonitor({
			method: 'POST',
			expect_keyword: 'healthy',
			request_headers: JSON.stringify({ Authorization: 'Bearer test' }),
			request_body: '{"probe":true}',
		});
		const fetchMock = vi.fn(async () => new Response('{"status":"HEALTHY"}', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const summary = await runDueChecks(env);
		expect(summary.up).toBe(1);
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect(init.method).toBe('POST');
		expect(init.body).toBe('{"probe":true}');
		expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test');
		expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
	});

	it('fails and opens an incident when the expected keyword is absent', async () => {
		const id = await insertMonitor({ last_ok: 1, expect_keyword: 'healthy' });
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('{"status":"error"}', { status: 200 })),
		);

		await runDueChecks(env);
		await env.DB.prepare('UPDATE monitors SET last_checked_at = NULL WHERE id = ?').bind(id).run();
		const summary = await runDueChecks(env);

		expect(summary.opened).toBe(1);
		const check = await env.DB.prepare('SELECT ok, error FROM checks WHERE monitor_id = ? ORDER BY id DESC LIMIT 1')
			.bind(id)
			.first<{ ok: number; error: string }>();
		expect(check).toEqual({ ok: 0, error: 'Response did not contain "healthy"' });
	});

	it('supports inverted keyword assertions and safely truncates large bodies', async () => {
		await insertMonitor({ expect_keyword: 'maintenance', keyword_inverted: 1 });
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(`${'a'.repeat(256 * 1024)}maintenance`, { status: 200 })),
		);

		const summary = await runDueChecks(env);
		expect(summary.up).toBe(1);
		expect((await env.DB.prepare('SELECT ok FROM checks').first<{ ok: number }>())?.ok).toBe(1);
	});

	it('confirms degraded latency, notifies, and recovers on a fast check', async () => {
		const id = await insertMonitor({ last_ok: 1, degraded_latency_ms: 1, failure_threshold: 2 });
		const now = Date.now();
		await env.DB.prepare(
			`INSERT INTO notification_channels (name, type, config, enabled, notify_manual, created_at, updated_at)
			 VALUES ('Webhook', 'webhook', '{"url":"https://hooks.example.test/events"}', 1, 1, ?, ?)`,
		)
			.bind(now, now)
			.run();
		const events: string[] = [];
		let slow = true;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				if (new URL(input.toString()).hostname === 'hooks.example.test') {
					events.push((JSON.parse(String(init?.body)) as { event: string }).event);
					return new Response(null, { status: 204 });
				}
				if (slow) await new Promise((resolve) => setTimeout(resolve, 5));
				return new Response(null, { status: 200 });
			}),
		);

		await runDueChecks(env);
		await env.DB.prepare('UPDATE monitors SET last_checked_at = NULL WHERE id = ?').bind(id).run();
		await runDueChecks(env);
		expect(events).toEqual(['degraded']);
		expect(
			await env.DB.prepare('SELECT last_degraded, consecutive_slow FROM monitors WHERE id = ?')
				.bind(id)
				.first<{ last_degraded: number; consecutive_slow: number }>(),
		).toEqual({ last_degraded: 1, consecutive_slow: 2 });
		expect((await env.DB.prepare('SELECT degraded FROM checks ORDER BY id DESC LIMIT 1').first<{ degraded: number }>())?.degraded).toBe(1);

		slow = false;
		await env.DB.prepare('UPDATE monitors SET last_checked_at = NULL, degraded_latency_ms = 30000 WHERE id = ?').bind(id).run();
		await runDueChecks(env);
		expect(events).toEqual(['degraded', 'recovered_degraded']);
		expect(
			(await env.DB.prepare('SELECT last_degraded FROM monitors WHERE id = ?').bind(id).first<{ last_degraded: number }>())?.last_degraded,
		).toBe(0);
	});

	it('records a first mismatched status as pending without opening an incident', async () => {
		const id = await insertMonitor({ last_ok: 1 });
		const fetchMock = vi.fn(async () => new Response(null, { status: 500 }));
		vi.stubGlobal('fetch', fetchMock);

		const summary = await runDueChecks(env);
		expect(summary).toEqual({ checked: 1, up: 0, down: 1, pending: 1, opened: 0, retries: 0 });

		const monitor = await env.DB.prepare('SELECT last_ok, consecutive_failures, last_status_code, last_error FROM monitors WHERE id = ?')
			.bind(id)
			.first<{ last_ok: number; consecutive_failures: number; last_status_code: number; last_error: string }>();
		expect(monitor).toEqual({
			last_ok: 1,
			consecutive_failures: 1,
			last_status_code: 500,
			last_error: 'Expected HTTP 200, received 500',
		});
		const incident = await env.DB.prepare('SELECT COUNT(*) AS count FROM incident_monitors WHERE monitor_id = ?')
			.bind(id)
			.first<{ count: number }>();
		expect(incident?.count).toBe(0);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('opens an incident once the failure threshold is reached', async () => {
		const id = await insertMonitor({ last_ok: 1 });
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 500 })),
		);

		await runDueChecks(env);
		await env.DB.prepare('UPDATE monitors SET last_checked_at = NULL WHERE id = ?').bind(id).run();
		const summary = await runDueChecks(env);

		expect(summary.opened).toBe(1);
		const monitor = await env.DB.prepare('SELECT last_ok, consecutive_failures FROM monitors WHERE id = ?')
			.bind(id)
			.first<{ last_ok: number; consecutive_failures: number }>();
		expect(monitor).toEqual({ last_ok: 0, consecutive_failures: 2 });
		const incident = await env.DB.prepare('SELECT COUNT(*) AS count FROM incident_monitors WHERE monitor_id = ?')
			.bind(id)
			.first<{ count: number }>();
		expect(incident?.count).toBe(1);
	});

	it('resets a pending failure when the next check succeeds', async () => {
		const id = await insertMonitor({ last_ok: 1, consecutive_failures: 1 });
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 200 })),
		);
		await runDueChecks(env);
		const monitor = await env.DB.prepare('SELECT last_ok, consecutive_failures FROM monitors WHERE id = ?')
			.bind(id)
			.first<{ last_ok: number; consecutive_failures: number }>();
		expect(monitor).toEqual({ last_ok: 1, consecutive_failures: 0 });
	});

	it('opens immediately when the threshold is one', async () => {
		const id = await insertMonitor({ last_ok: 1, failure_threshold: 1 });
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 503 })),
		);
		const summary = await runDueChecks(env);
		expect(summary.opened).toBe(1);
		const incident = await env.DB.prepare('SELECT COUNT(*) AS count FROM incident_monitors WHERE monitor_id = ?')
			.bind(id)
			.first<{ count: number }>();
		expect(incident?.count).toBe(1);
	});

	it('retries a failed attempt and persists only the recovered result', async () => {
		const id = await insertMonitor({ last_ok: 1, retry_count: 1 });
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 500 }))
			.mockResolvedValueOnce(new Response(null, { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		const summary = await runDueChecks(env);
		expect(summary).toMatchObject({ up: 1, retries: 1, pending: 0 });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const checks = await env.DB.prepare('SELECT ok FROM checks WHERE monitor_id = ?').bind(id).all<{ ok: number }>();
		expect(checks.results).toEqual([{ ok: 1 }]);
	});

	it('records one failed check after exhausting retries', async () => {
		const id = await insertMonitor({ last_ok: 1, retry_count: 2 });
		const fetchMock = vi.fn(async () => new Response(null, { status: 500 }));
		vi.stubGlobal('fetch', fetchMock);
		await runDueChecks(env);
		expect(fetchMock).toHaveBeenCalledTimes(3);
		const checks = await env.DB.prepare('SELECT ok FROM checks WHERE monitor_id = ?').bind(id).all<{ ok: number }>();
		expect(checks.results).toEqual([{ ok: 0 }]);
	});

	it('does not retry a monitor that is already confirmed down', async () => {
		await insertMonitor({ last_ok: 0, consecutive_failures: 2, retry_count: 3 });
		const fetchMock = vi.fn(async () => new Response(null, { status: 500 }));
		vi.stubGlobal('fetch', fetchMock);
		const summary = await runDueChecks(env);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(summary.retries).toBe(0);
	});

	it('caps retry attempts across a scheduled run', async () => {
		vi.useFakeTimers();
		for (let index = 0; index < 40; index += 1) {
			await insertMonitor({ name: `Monitor ${index}`, url: `https://monitor-${index}.example.com`, last_ok: 1, retry_count: 3 });
		}
		const fetchMock = vi.fn(async () => new Response(null, { status: 500 }));
		vi.stubGlobal('fetch', fetchMock);

		const run = runDueChecks(env);
		await vi.runAllTimersAsync();
		const summary = await run;

		expect(summary.retries).toBe(MAX_RETRY_ATTEMPTS_PER_RUN);
		expect(fetchMock).toHaveBeenCalledTimes(40 + MAX_RETRY_ATTEMPTS_PER_RUN);
	});

	it('does not send a webhook or generate AI copy until a failure is confirmed', async () => {
		const id = await insertMonitor({ last_ok: 1, retry_count: 0 });
		const now = Date.now();
		await env.DB.batch([
			env.DB.prepare(
				`INSERT INTO notification_channels (name, type, config, enabled, notify_manual, created_at, updated_at)
				 VALUES ('Legacy webhook', 'webhook', '{"url":"https://hooks.example.test/events"}', 1, 1, ?, ?)`,
			).bind(now, now),
			env.DB.prepare(
				"INSERT INTO ai_settings (id, enabled, base_url, api_key, model, created_at, updated_at) VALUES (1, 1, 'https://ai.example.test/v1', 'secret', 'test-model', ?, ?)",
			).bind(now, now),
		]);
		const webhookBodies: Array<Record<string, unknown>> = [];
		let aiCalls = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = new URL(input.toString());
				if (url.hostname === 'hooks.example.test') {
					webhookBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
					return new Response(null, { status: 204 });
				}
				if (url.hostname === 'ai.example.test') {
					aiCalls += 1;
					return Response.json({
						choices: [
							{
								message: {
									content: 'Some visitors may be unable to use the service. The team has been alerted and restoration work is underway.',
								},
							},
						],
					});
				}
				return new Response(null, { status: 500 });
			}),
		);

		await runDueChecks(env);
		expect(webhookBodies).toEqual([]);
		expect(aiCalls).toBe(0);
		expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM incident_updates').first<{ count: number }>())?.count).toBe(0);

		await env.DB.prepare('UPDATE monitors SET last_checked_at = NULL WHERE id = ?').bind(id).run();
		await runDueChecks(env);
		expect(webhookBodies).toHaveLength(1);
		expect(webhookBodies[0]).toMatchObject({ event: 'down' });
		expect(aiCalls).toBe(1);
		expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM incident_updates').first<{ count: number }>())?.count).toBe(1);
	});

	it('does not open duplicate incidents while a monitor stays down', async () => {
		const id = await insertMonitor({ last_ok: 0, consecutive_failures: 2 });
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
		const firstId = await insertMonitor({
			name: 'First',
			url: 'https://first.example.com',
			last_ok: 1,
			failure_threshold: 1,
		});
		const secondId = await insertMonitor({
			name: 'Second',
			url: 'https://second.example.com',
			last_ok: 1,
			failure_threshold: 1,
		});
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
		const id = await insertMonitor({ last_ok: 0, consecutive_failures: 2 });
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
		const monitor = await env.DB.prepare('SELECT last_ok, consecutive_failures FROM monitors WHERE id = ?')
			.bind(id)
			.first<{ last_ok: number; consecutive_failures: number }>();
		expect(monitor).toEqual({ last_ok: 1, consecutive_failures: 0 });
	});

	it('skips disabled and not-yet-due monitors', async () => {
		await insertMonitor({ name: 'Disabled', enabled: 0 });
		await insertMonitor({ name: 'Recent', last_checked_at: Date.now() });
		const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const summary = await runDueChecks(env);
		expect(summary).toEqual({ checked: 0, up: 0, down: 0, pending: 0, opened: 0, retries: 0 });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
