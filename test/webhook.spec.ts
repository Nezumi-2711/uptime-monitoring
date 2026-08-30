import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendIncidentAlert } from '../src/worker/notifications/webhook';
import type { Monitor } from '../src/worker/checks/run-check';

describe('incident webhooks', () => {
	beforeAll(async () => {
		const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };
		await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
	});
	beforeEach(async () => {
		await env.DB.prepare('DELETE FROM notification_settings').run();
		const now = Date.now();
		await env.DB.prepare(
			"INSERT INTO notification_settings (id, webhook_url, webhook_enabled, created_at, updated_at) VALUES (1, 'https://hooks.example.test/events', 1, ?, ?)",
		)
			.bind(now, now)
			.run();
	});
	afterEach(() => vi.unstubAllGlobals());

	const monitor = {
		id: 7,
		name: 'API',
		url: 'https://api.example.com',
		method: 'GET',
		expectedStatus: 200,
		intervalSeconds: 300,
		timeoutMs: 10000,
		enabled: true,
		alertsEnabled: true,
		lastOk: true,
		lastStatusCode: 200,
		lastLatencyMs: 30,
		lastError: null,
		lastCheckedAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	} satisfies Monitor;

	it('sends the compact down payload', async () => {
		const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
		vi.stubGlobal('fetch', fetchMock);
		const at = new Date('2026-08-28T03:25:00Z');
		expect(
			await sendIncidentAlert(env, { monitor, kind: 'opened', result: { ok: false, statusCode: 500, latencyMs: 42, error: 'Down' }, at }),
		).toBe(true);
		const [, init] = fetchMock.mock.calls[0];
		expect(JSON.parse(String(init?.body))).toEqual({
			event: 'down',
			monitor: { id: 7, name: 'API', url: 'https://api.example.com' },
			statusCode: 500,
			error: 'Down',
			at: '2026-08-28T03:25:00.000Z',
		});
	});

	it('swallows webhook network failures', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('network unavailable');
			}),
		);
		await expect(
			sendIncidentAlert(env, {
				monitor,
				kind: 'resolved',
				result: { ok: true, statusCode: 200, latencyMs: 20, error: null },
				at: new Date(),
			}),
		).resolves.toBe(false);
	});
});
