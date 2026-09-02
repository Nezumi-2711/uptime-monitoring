import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchNotification, dispatchRunNotifications } from '../src/worker/notifications/dispatch';
import { discordProvider, slackProvider, telegramProvider, webhookProvider } from '../src/worker/notifications/providers';
import { parseChannelInput } from '../src/worker/routes/channels';

const event = {
	kind: 'down' as const,
	monitor: { id: 7, name: 'API <prod>', url: 'https://api.example.com' },
	incidentId: null,
	title: 'API is down',
	body: 'Requests are failing.',
	statusCode: 500,
	error: 'Expected <200>',
	at: new Date('2026-08-28T03:25:00Z'),
};

async function insertChannel(name: string, config: string, overrides = '') {
	const now = Date.now();
	const result = await env.DB.prepare(
		`INSERT INTO notification_channels (name, type, config, enabled, notify_manual, created_at, updated_at)
		 VALUES (?, 'webhook', ?, 1, 1, ?, ?) ${overrides}`,
	)
		.bind(name, config, now, now)
		.run();
	return Number(result.meta.last_row_id);
}

describe('notification channels', () => {
	beforeAll(async () => {
		const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };
		await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
	});
	beforeEach(async () => {
		await env.DB.batch([
			env.DB.prepare('DELETE FROM ai_events'),
			env.DB.prepare('DELETE FROM notification_deliveries'),
			env.DB.prepare('DELETE FROM notification_channel_monitors'),
			env.DB.prepare('DELETE FROM notification_channels'),
			env.DB.prepare('DELETE FROM incident_monitors'),
			env.DB.prepare('DELETE FROM incidents'),
			env.DB.prepare('DELETE FROM monitors'),
		]);
		const now = Date.now();
		await env.DB.prepare(
			`INSERT INTO monitors (id, name, url, method, expected_status, interval_seconds, timeout_ms, enabled, alerts_enabled,
			 retry_count, failure_threshold, consecutive_failures, last_ok, created_at, updated_at)
			 VALUES (7, 'API', 'https://api.example.com', 'GET', 200, 300, 10000, 1, 1, 0, 1, 0, 1, ?, ?)`,
		)
			.bind(now, now)
			.run();
	});
	afterEach(() => vi.unstubAllGlobals());

	it('formats provider-specific payloads and preserves the raw webhook payload', () => {
		const webhook = webhookProvider.format({ url: 'https://hooks.example.com' }, event);
		expect(JSON.parse(webhook.body)).toEqual({
			event: 'down',
			monitor: event.monitor,
			statusCode: 500,
			error: 'Expected <200>',
			at: '2026-08-28T03:25:00.000Z',
		});
		const testWebhook = webhookProvider.format(
			{ url: 'https://hooks.example.com' },
			{ ...event, kind: 'test', monitor: null, incidentId: null, title: 'Upwatch test', body: null, statusCode: 200, error: null },
		);
		expect(JSON.parse(testWebhook.body).monitor).toEqual({ id: 0, name: 'Upwatch test', url: 'https://example.com/health' });
		expect(JSON.parse(slackProvider.format({ url: 'https://hooks.slack.com/test' }, event).body).attachments[0].color).toBe('#dc2626');
		expect(JSON.parse(discordProvider.format({ url: 'https://discord.com/api/webhooks/test' }, event).body).embeds[0]).toMatchObject({
			color: 14427686,
			timestamp: '2026-08-28T03:25:00.000Z',
		});
		const telegram = telegramProvider.format({ botToken: '123:abc', chatId: '-10' }, event);
		expect(telegram.url).toBe('https://api.telegram.org/bot123:abc/sendMessage');
		expect(JSON.parse(telegram.body).text).toContain('API &lt;prod&gt;');
	});

	it('rejects private channel URLs and unknown providers', () => {
		expect(
			parseChannelInput({
				name: 'Local',
				type: 'webhook',
				config: { url: 'http://127.0.0.1/x' },
				enabled: true,
				notifyManual: true,
				monitorIds: [],
			}),
		).toMatchObject({ ok: false });
		expect(
			parseChannelInput({ name: 'Unknown', type: 'email', config: {}, enabled: true, notifyManual: true, monitorIds: [] }),
		).toMatchObject({ ok: false });
	});

	it('fans out, records delivery, and retries a server failure once', async () => {
		await insertChannel('All services', '{"url":"https://hooks.example.test/events"}');
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 500 }))
			.mockResolvedValueOnce(new Response(null, { status: 204 }));
		vi.stubGlobal('fetch', fetchMock);
		await dispatchNotification(env, event);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const delivery = await env.DB.prepare('SELECT ok, status_code, attempts FROM notification_deliveries').first<{
			ok: number;
			status_code: number;
			attempts: number;
		}>();
		expect(delivery).toEqual({ ok: 1, status_code: 204, attempts: 2 });
	});

	it('routes a scheduled event batch and writes all delivery rows together', async () => {
		await insertChannel('All services', '{"url":"https://hooks.example.test/events"}');
		const assignedChannel = await insertChannel('API only', '{"url":"https://hooks.example.test/api"}');
		await env.DB.prepare('INSERT INTO notification_channel_monitors (channel_id, monitor_id) VALUES (?, 7)').bind(assignedChannel).run();
		const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
		vi.stubGlobal('fetch', fetchMock);

		await dispatchRunNotifications(
			env,
			[
				{ event, monitorAlertsEnabled: true },
				{ event: { ...event, kind: 'recovered', title: 'API recovered' }, monitorAlertsEnabled: true },
			],
			{ remaining: 3 },
		);

		expect(fetchMock).toHaveBeenCalledTimes(3);
		const deliveries = await env.DB.prepare('SELECT event, ok FROM notification_deliveries ORDER BY id').all<{
			event: string;
			ok: number;
		}>();
		expect(deliveries.results).toEqual([
			{ event: 'down', ok: 1 },
			{ event: 'down', ok: 1 },
			{ event: 'recovered', ok: 1 },
			{ event: 'recovered', ok: 0 },
		]);
	});

	it('does not retry a 400 response', async () => {
		await insertChannel('All services', '{"url":"https://hooks.example.test/events"}');
		const fetchMock = vi.fn(async () => new Response(null, { status: 400 }));
		vi.stubGlobal('fetch', fetchMock);
		await dispatchNotification(env, event);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const delivery = await env.DB.prepare('SELECT ok, error, attempts FROM notification_deliveries').first();
		expect(delivery).toEqual({ ok: 0, error: 'HTTP 400', attempts: 1 });
	});

	it('honors monitor assignments and alertsEnabled', async () => {
		const channelId = await insertChannel('Other service', '{"url":"https://hooks.example.test/events"}');
		const now = Date.now();
		await env.DB.prepare(
			`INSERT INTO monitors (id, name, url, method, expected_status, interval_seconds, timeout_ms, enabled, alerts_enabled,
			 retry_count, failure_threshold, consecutive_failures, created_at, updated_at)
			 VALUES (8, 'Web', 'https://web.example.com', 'GET', 200, 300, 10000, 1, 1, 0, 1, 0, ?, ?)`,
		)
			.bind(now, now)
			.run();
		await env.DB.prepare('INSERT INTO notification_channel_monitors (channel_id, monitor_id) VALUES (?, 8)').bind(channelId).run();
		const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
		vi.stubGlobal('fetch', fetchMock);
		await dispatchNotification(env, event);
		expect(fetchMock).not.toHaveBeenCalled();
		await env.DB.prepare('UPDATE monitors SET alerts_enabled = 0 WHERE id = 7').run();
		await env.DB.prepare('DELETE FROM notification_channel_monitors').run();
		await dispatchNotification(env, event);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
