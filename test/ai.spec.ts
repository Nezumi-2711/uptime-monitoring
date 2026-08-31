import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env, exports as worker } from 'cloudflare:workers';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deterministicIncidentMessage } from '../src/worker/ai/fallback-message';
import { generateIncidentMessage } from '../src/worker/ai/incident-message';
import type { Monitor } from '../src/worker/checks/run-check';
import { hashPassword } from '../src/worker/lib/password';

const ADMIN_PASSWORD = 'correct-horse-battery-staple';

const monitor = {
	id: 1,
	name: 'Public API',
	url: 'https://api.example.com/health',
	method: 'GET',
	expectedStatus: 200,
	intervalSeconds: 300,
	timeoutMs: 10_000,
	enabled: true,
	alertsEnabled: true,
	lastOk: false,
	lastStatusCode: 503,
	lastLatencyMs: 250,
	lastError: 'Expected HTTP 200, received 503',
	lastCheckedAt: new Date(),
	createdAt: new Date(),
	updatedAt: new Date(),
} satisfies Monitor;

const failedResult = {
	ok: false,
	statusCode: 503,
	latencyMs: 250,
	error: 'Expected HTTP 200, received 503',
};

async function resetDatabase() {
	await env.DB.batch([
		env.DB.prepare('DELETE FROM ai_events'),
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
		env.DB.prepare('DELETE FROM login_attempts'),
		env.DB.prepare('DELETE FROM sessions'),
		env.DB.prepare('DELETE FROM admin_credentials'),
	]);
}

async function seedMonitorAndIncident(aiMessage: string | null = null) {
	const now = Date.now();
	await env.DB.prepare(
		`INSERT INTO monitors (
			id, name, url, method, expected_status, interval_seconds, timeout_ms,
			enabled, alerts_enabled, last_ok, last_status_code, last_latency_ms,
			last_error, last_checked_at, created_at, updated_at
		) VALUES (1, ?, ?, 'GET', 200, 300, 10000, 1, 1, 0, 503, 250, ?, ?, ?, ?)`,
	)
		.bind(monitor.name, monitor.url, monitor.lastError, now, now, now)
		.run();
	await env.DB.prepare(
		"INSERT INTO incidents (id, status, impact, source, started_at, resolved_at, start_status_code, start_error, duration_ms, created_at, updated_at) VALUES (1, 'investigating', 'major', 'auto', ?, NULL, 503, ?, NULL, ?, ?)",
	)
		.bind(now, monitor.lastError, now, now)
		.run();
	await env.DB.prepare('INSERT INTO incident_monitors (incident_id, monitor_id) VALUES (1, 1)').run();
	if (aiMessage) {
		await env.DB.prepare(
			"INSERT INTO incident_updates (incident_id, status, body, source, created_at) VALUES (1, 'investigating', ?, 'ai', ?)",
		)
			.bind(aiMessage, now)
			.run();
	}
}

async function seedAiSettings(enabled = true) {
	const now = Date.now();
	await env.DB.prepare(
		"INSERT INTO ai_settings (id, enabled, base_url, api_key, model, created_at, updated_at) VALUES (1, ?, 'https://api.openai.com/v1', 'sk-secret-4f2a', 'gpt-4o-mini', ?, ?)",
	)
		.bind(enabled ? 1 : 0, now, now)
		.run();
}

async function authenticatedCookie() {
	const now = Date.now();
	await env.DB.prepare('INSERT INTO admin_credentials (id, password_hash, created_at, updated_at) VALUES (1, ?, ?, ?)')
		.bind(await hashPassword(ADMIN_PASSWORD), now, now)
		.run();
	const response = await worker.default.fetch('https://example.com/api/auth/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
		body: JSON.stringify({ password: ADMIN_PASSWORD }),
	});
	return response.headers.get('Set-Cookie')?.split(';', 1)[0] ?? '';
}

async function settingsRequest(path: string, cookie: string, init?: RequestInit) {
	return worker.default.fetch(`https://example.com/api/settings${path}`, {
		...init,
		headers: {
			'Content-Type': 'application/json',
			Origin: 'https://example.com',
			Cookie: cookie,
			...init?.headers,
		},
	});
}

describe('AI incident messages', () => {
	beforeAll(async () => {
		const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };
		await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
	});
	beforeEach(resetDatabase);
	afterEach(() => vi.unstubAllGlobals());

	it('stores an API key but only returns its masked state', async () => {
		const cookie = await authenticatedCookie();
		const response = await settingsRequest('/ai', cookie, {
			method: 'PUT',
			body: JSON.stringify({
				enabled: true,
				baseUrl: 'https://api.openai.com/v1/',
				model: 'gpt-4o-mini',
				apiKey: 'sk-secret-4f2a',
			}),
		});
		const body = await response.json<{
			settings: { baseUrl: string; apiKeySet: boolean; apiKeyPreview: string };
		}>();

		expect(response.status).toBe(200);
		expect(body.settings).toMatchObject({
			baseUrl: 'https://api.openai.com/v1',
			apiKeySet: true,
			apiKeyPreview: '••••••4f2a',
		});
		expect(JSON.stringify(body)).not.toContain('sk-secret');

		const getResponse = await settingsRequest('/ai', cookie);
		const getText = await getResponse.text();
		expect(getText).not.toContain('sk-secret');
		expect(JSON.parse(getText).settings.apiKeySet).toBe(true);
		const stored = await env.DB.prepare('SELECT api_key AS apiKey FROM ai_settings WHERE id = 1').first<{ apiKey: string }>();
		expect(stored?.apiKey).toBe('sk-secret-4f2a');
	});

	it('preserves an omitted key and clears an empty key', async () => {
		await seedAiSettings(false);
		const cookie = await authenticatedCookie();
		const input = { enabled: false, baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' };

		expect((await settingsRequest('/ai', cookie, { method: 'PUT', body: JSON.stringify(input) })).status).toBe(200);
		let stored = await env.DB.prepare('SELECT api_key AS apiKey FROM ai_settings').first<{ apiKey: string | null }>();
		expect(stored?.apiKey).toBe('sk-secret-4f2a');

		expect((await settingsRequest('/ai', cookie, { method: 'PUT', body: JSON.stringify({ ...input, apiKey: '' }) })).status).toBe(200);
		stored = await env.DB.prepare('SELECT api_key AS apiKey FROM ai_settings').first<{ apiKey: string | null }>();
		expect(stored?.apiKey).toBeNull();
	});

	it.each([
		['non-https URL', { enabled: false, baseUrl: 'http://api.example.com/v1', model: 'model' }],
		['private URL', { enabled: false, baseUrl: 'https://127.0.0.1/v1', model: 'model' }],
		['missing enabled key', { enabled: true, baseUrl: 'https://api.example.com/v1', model: 'model' }],
	])('rejects %s', async (_label, input) => {
		const cookie = await authenticatedCookie();
		const response = await settingsRequest('/ai', cookie, { method: 'PUT', body: JSON.stringify(input) });
		expect(response.status).toBe(400);
	});

	it('collapses a two-sentence completion and writes it to the open incident', async () => {
		await seedMonitorAndIncident();
		await seedAiSettings();
		const now = Date.now();
		await env.DB.batch([
			env.DB.prepare('INSERT INTO checks (monitor_id, ok, status_code, latency_ms, checked_at) VALUES (1, 1, 200, 180, ?)').bind(
				now - 20 * 60_000,
			),
			env.DB.prepare('INSERT INTO checks (monitor_id, ok, status_code, latency_ms, error, checked_at) VALUES (1, 0, 503, 250, ?, ?)').bind(
				'Expected HTTP 200, received 503',
				now - 60_000,
			),
		]);
		const completion =
			'Some visitors may see errors or slow responses when using the service.\n' +
			'We detected this automatically and are already working to restore it as soon as possible.';
		const expected =
			'Some visitors may see errors or slow responses when using the service. ' +
			'We detected this automatically and are already working to restore it as soon as possible.';
		const fetchMock = vi.fn(async () => Response.json({ choices: [{ message: { content: completion } }] }));
		vi.stubGlobal('fetch', fetchMock);

		await expect(generateIncidentMessage(env, { monitor, result: failedResult })).resolves.toBe(expected);
		const incident = await env.DB.prepare("SELECT body AS aiMessage FROM incident_updates WHERE source = 'ai'").first<{
			aiMessage: string | null;
		}>();
		expect(incident?.aiMessage).toBe(expected);

		const promptText = String(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).messages[1].content);
		expect(promptText).not.toContain(monitor.url);
		expect(promptText).toContain('Detected problem:');
		expect(promptText).toContain('Typical response time when healthy: about 180 ms');
	});

	it('does not fetch when AI settings are disabled', async () => {
		await seedMonitorAndIncident();
		await seedAiSettings(false);
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		await expect(generateIncidentMessage(env, { monitor, result: failedResult })).resolves.toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		['network failure', async () => Promise.reject(new Error('offline'))],
		['error response', async () => new Response(null, { status: 500 })],
		['malformed JSON', async () => new Response('not json', { status: 200 })],
	])('swallows a %s and leaves the incident unchanged', async (_label, implementation) => {
		await seedMonitorAndIncident();
		await seedAiSettings();
		vi.stubGlobal('fetch', vi.fn(implementation));

		await expect(generateIncidentMessage(env, { monitor, result: failedResult })).resolves.toBeNull();
		const incident = await env.DB.prepare("SELECT body AS aiMessage FROM incident_updates WHERE source = 'ai'").first<{
			aiMessage: string | null;
		}>();
		expect(incident).toBeNull();
	});

	it('rejects generated content containing a URL', async () => {
		await seedMonitorAndIncident();
		await seedAiSettings();
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ choices: [{ message: { content: 'Service failed at https://internal.example.com.' } }] })),
		);

		await expect(generateIncidentMessage(env, { monitor, result: failedResult })).resolves.toBeNull();
		const incident = await env.DB.prepare("SELECT body AS aiMessage FROM incident_updates WHERE source = 'ai'").first<{
			aiMessage: string | null;
		}>();
		expect(incident).toBeNull();
	});

	it('returns stored AI copy and deterministic fallback copy on public status', async () => {
		await seedMonitorAndIncident('Customers may see delayed API responses.');
		let body = await (
			await worker.default.fetch('https://example.com/api/status')
		).json<{
			services: Array<{ message: string | null }>;
		}>();
		expect(body.services[0].message).toBe('Customers may see delayed API responses.');

		await env.DB.prepare('DELETE FROM incident_updates').run();
		body = await (
			await worker.default.fetch('https://example.com/api/status')
		).json<{
			services: Array<{ message: string | null }>;
		}>();
		expect(body.services[0].message).toBe(deterministicIncidentMessage(503));
	});
});
