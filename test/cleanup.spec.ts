import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AI_EVENT_RETENTION_MS, cleanupExpiredAuthRecords, cleanupStaleData } from '../src/worker/scheduled/cleanup';

const DAY_MS = 24 * 60 * 60 * 1000;

async function count(table: string): Promise<number> {
	return (await env.DB.prepare(`SELECT count(*) AS count FROM ${table}`).first<{ count: number }>())?.count ?? 0;
}

async function insertMonitor(): Promise<number> {
	const now = Date.now();
	const result = await env.DB.prepare(
		`INSERT INTO monitors (name, url, method, expected_status, interval_seconds, timeout_ms, enabled, alerts_enabled, created_at, updated_at)
		 VALUES ('Example', 'https://example.com', 'GET', 200, 300, 10000, 1, 1, ?, ?)`,
	)
		.bind(now, now)
		.run();
	return Number(result.meta.last_row_id);
}

describe('scheduled cleanup', () => {
	beforeAll(async () => {
		const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };
		await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
	});
	beforeEach(async () => {
		await env.DB.batch([
			env.DB.prepare('DELETE FROM ai_events'),
			env.DB.prepare('DELETE FROM notification_deliveries'),
			env.DB.prepare('DELETE FROM notification_channels'),
			env.DB.prepare('DELETE FROM monitor_daily_stats'),
			env.DB.prepare('DELETE FROM checks'),
			env.DB.prepare('DELETE FROM monitors'),
			env.DB.prepare('DELETE FROM sessions'),
			env.DB.prepare('DELETE FROM login_attempts'),
		]);
	});

	describe('cleanupExpiredAuthRecords', () => {
		it('removes expired sessions and stale login attempts but leaves fresh ones', async () => {
			const now = Date.now();
			await env.DB.batch([
				env.DB.prepare("INSERT INTO sessions (id, expires_at, created_at) VALUES ('expired', ?, ?)").bind(now - 1000, now - DAY_MS),
				env.DB.prepare("INSERT INTO sessions (id, expires_at, created_at) VALUES ('active', ?, ?)").bind(now + DAY_MS, now),
				env.DB.prepare('INSERT INTO login_attempts (ip_address, attempted_at) VALUES (?, ?)').bind('1.1.1.1', now - 2 * 60 * 60 * 1000),
				env.DB.prepare('INSERT INTO login_attempts (ip_address, attempted_at) VALUES (?, ?)').bind('2.2.2.2', now - 60 * 1000),
			]);

			await cleanupExpiredAuthRecords(env);

			expect(await count('sessions')).toBe(1);
			expect((await env.DB.prepare('SELECT id FROM sessions').first<{ id: string }>())?.id).toBe('active');
			expect(await count('login_attempts')).toBe(1);
		});

		it('does not touch high-volume retention tables', async () => {
			const monitorId = await insertMonitor();
			await env.DB.prepare('INSERT INTO checks (monitor_id, ok, latency_ms, checked_at) VALUES (?, 1, 100, ?)')
				.bind(monitorId, Date.now() - 30 * DAY_MS)
				.run();

			await cleanupExpiredAuthRecords(env);

			expect(await count('checks')).toBe(1);
		});
	});

	describe('cleanupStaleData', () => {
		it('prunes only rows past each retention window', async () => {
			const now = Date.now();
			const monitorId = await insertMonitor();
			const channel = await env.DB.prepare(
				"INSERT INTO notification_channels (name, type, config, enabled, created_at, updated_at) VALUES ('c', 'webhook', '{}', 1, ?, ?)",
			)
				.bind(now, now)
				.run();
			const channelId = Number(channel.meta.last_row_id);

			await env.DB.batch([
				// checks: 7-day retention
				env.DB.prepare('INSERT INTO checks (monitor_id, ok, latency_ms, checked_at) VALUES (?, 1, 100, ?)').bind(
					monitorId,
					now - 8 * DAY_MS,
				),
				env.DB.prepare('INSERT INTO checks (monitor_id, ok, latency_ms, checked_at) VALUES (?, 1, 100, ?)').bind(
					monitorId,
					now - 1 * DAY_MS,
				),
				// monitor_daily_stats: 400-day retention
				env.DB.prepare('INSERT INTO monitor_daily_stats (monitor_id, day, total_checks, up_checks) VALUES (?, ?, 1, 1)').bind(
					monitorId,
					now - 401 * DAY_MS,
				),
				env.DB.prepare('INSERT INTO monitor_daily_stats (monitor_id, day, total_checks, up_checks) VALUES (?, ?, 1, 1)').bind(
					monitorId,
					now - 10 * DAY_MS,
				),
				// notification_deliveries: 30-day retention
				env.DB.prepare(
					"INSERT INTO notification_deliveries (channel_id, event, ok, attempts, created_at) VALUES (?, 'down', 1, 1, ?)",
				).bind(channelId, now - 31 * DAY_MS),
				env.DB.prepare(
					"INSERT INTO notification_deliveries (channel_id, event, ok, attempts, created_at) VALUES (?, 'down', 1, 1, ?)",
				).bind(channelId, now - 5 * DAY_MS),
				// ai_events: 30-day retention
				env.DB.prepare("INSERT INTO ai_events (kind, outcome, created_at) VALUES ('settings_test', 'ok', ?)").bind(
					now - AI_EVENT_RETENTION_MS - 1,
				),
				env.DB.prepare("INSERT INTO ai_events (kind, outcome, created_at) VALUES ('settings_test', 'ok', ?)").bind(now - DAY_MS),
			]);

			await cleanupStaleData(env);

			expect(await count('checks')).toBe(1);
			expect(await count('monitor_daily_stats')).toBe(1);
			expect(await count('notification_deliveries')).toBe(1);
			expect(await count('ai_events')).toBe(1);
		});
	});
});
