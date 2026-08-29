import { applyD1Migrations, env, type D1Migration } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runDailyRollup } from '../src/worker/scheduled/rollup';

describe('daily monitor rollups', () => {
	beforeAll(async () => {
		const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };
		await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
	});
	beforeEach(async () => {
		await env.DB.batch([
			env.DB.prepare('DELETE FROM maintenance_window_monitors'),
			env.DB.prepare('DELETE FROM maintenance_windows'),
			env.DB.prepare('DELETE FROM monitor_daily_stats'),
			env.DB.prepare('DELETE FROM checks'),
			env.DB.prepare('DELETE FROM incidents'),
			env.DB.prepare('DELETE FROM monitors'),
		]);
	});

	it('aggregates the previous UTC day and safely upserts on rerun', async () => {
		const now = new Date('2026-08-28T00:05:00.000Z');
		const createdAt = now.getTime();
		const insert = await env.DB.prepare(
			"INSERT INTO monitors (name, url, method, expected_status, interval_seconds, timeout_ms, enabled, alerts_enabled, created_at, updated_at) VALUES ('API', 'https://example.com', 'GET', 200, 300, 10000, 1, 1, ?, ?)",
		)
			.bind(createdAt, createdAt)
			.run();
		const id = Number(insert.meta.last_row_id);
		await env.DB.batch([
			env.DB.prepare('INSERT INTO checks (monitor_id, ok, status_code, latency_ms, checked_at) VALUES (?, 1, 200, 100, ?)').bind(
				id,
				Date.parse('2026-08-27T02:00:00Z'),
			),
			env.DB.prepare('INSERT INTO checks (monitor_id, ok, status_code, latency_ms, checked_at) VALUES (?, 1, 200, 200, ?)').bind(
				id,
				Date.parse('2026-08-27T12:00:00Z'),
			),
			env.DB.prepare('INSERT INTO checks (monitor_id, ok, status_code, latency_ms, checked_at) VALUES (?, 0, 500, 300, ?)').bind(
				id,
				Date.parse('2026-08-27T22:00:00Z'),
			),
			env.DB.prepare(
				'INSERT INTO checks (monitor_id, ok, status_code, latency_ms, checked_at, maintenance) VALUES (?, 0, 503, 900, ?, 1)',
			).bind(id, Date.parse('2026-08-27T23:00:00Z')),
		]);

		expect(await runDailyRollup(env, now)).toEqual({ day: '2026-08-27', monitors: 1 });
		await runDailyRollup(env, now);
		const rows = await env.DB.prepare(
			'SELECT day, total_checks, up_checks, avg_latency_ms, min_latency_ms, max_latency_ms FROM monitor_daily_stats WHERE monitor_id = ?',
		)
			.bind(id)
			.all();
		expect(rows.results).toHaveLength(1);
		expect(rows.results[0]).toEqual({
			day: Date.parse('2026-08-27T00:00:00Z'),
			total_checks: 3,
			up_checks: 2,
			avg_latency_ms: 200,
			min_latency_ms: 100,
			max_latency_ms: 300,
		});
	});
});
