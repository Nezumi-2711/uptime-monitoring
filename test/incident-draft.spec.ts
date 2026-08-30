import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env, exports as worker } from 'cloudflare:workers';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from '../src/worker/lib/password';

const PASSWORD = 'correct-horse-battery-staple';
async function reset() {
	await env.DB.batch([
		env.DB.prepare('DELETE FROM incident_updates'),
		env.DB.prepare('DELETE FROM incident_monitors'),
		env.DB.prepare('DELETE FROM incidents'),
		env.DB.prepare('DELETE FROM monitors'),
		env.DB.prepare('DELETE FROM ai_settings'),
		env.DB.prepare('DELETE FROM sessions'),
		env.DB.prepare('DELETE FROM admin_credentials'),
	]);
	const now = Date.now();
	await env.DB.prepare('INSERT INTO admin_credentials (id, password_hash, created_at, updated_at) VALUES (1, ?, ?, ?)')
		.bind(await hashPassword(PASSWORD), now, now)
		.run();
}
async function cookie() {
	const response = await worker.default.fetch('https://example.com/api/auth/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
		body: JSON.stringify({ password: PASSWORD }),
	});
	return response.headers.get('Set-Cookie')?.split(';', 1)[0] ?? '';
}
function post(path: string, auth: string, body: unknown) {
	return worker.default.fetch(`https://example.com${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Origin: 'https://example.com', ...(auth ? { Cookie: auth } : {}) },
		body: JSON.stringify(body),
	});
}
async function enableAi() {
	const now = Date.now();
	await env.DB.prepare(
		"INSERT INTO ai_settings (id, enabled, base_url, api_key, model, created_at, updated_at) VALUES (1, 1, 'https://api.example.com/v1', 'secret', 'small', ?, ?)",
	)
		.bind(now, now)
		.run();
}

describe('AI incident drafts', () => {
	beforeAll(async () => applyD1Migrations(env.DB, (env as Env & { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS));
	beforeEach(reset);
	afterEach(() => vi.unstubAllGlobals());
	it('requires authentication and returns 409 without configured AI', async () => {
		expect((await post('/api/incidents/draft', '', { note: 'down', status: 'investigating' })).status).toBe(401);
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		expect((await post('/api/incidents/draft', await cookie(), { note: 'down', status: 'investigating' })).status).toBe(409);
		expect(fetchMock).not.toHaveBeenCalled();
	});
	it('returns a clean draft without writing database rows', async () => {
		await enableAi();
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				Response.json({
					choices: [
						{
							message: {
								content:
									'TITLE: Delayed customer requests\nBODY: Some requests are taking longer than expected. We are working to restore normal performance.',
							},
						},
					],
				}),
			),
		);
		const response = await post('/api/incidents/draft', await cookie(), {
			note: 'redis full memory, scale RAM',
			status: 'identified',
			monitorIds: [],
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			title: 'Delayed customer requests',
			body: 'Some requests are taking longer than expected. We are working to restore normal performance.',
		});
		expect((await env.DB.prepare('SELECT count(*) AS count FROM incidents').first<{ count: number }>())?.count).toBe(0);
		expect((await env.DB.prepare('SELECT count(*) AS count FROM incident_updates').first<{ count: number }>())?.count).toBe(0);
	});
	it('rejects unsafe model output and varies guidance by lifecycle status', async () => {
		await enableAi();
		const calls: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_input, init) => {
				calls.push(String(init?.body));
				return Response.json({
					choices: [{ message: { content: 'TITLE: Service issue\nBODY: See https://internal.example.com HTTP 500.' } }],
				});
			}),
		);
		const auth = await cookie();
		expect((await post('/api/incidents/draft', auth, { note: 'same', status: 'identified', monitorIds: [] })).status).toBe(422);
		expect((await post('/api/incidents/draft', auth, { note: 'same', status: 'resolved', monitorIds: [] })).status).toBe(422);
		expect(calls[0]).toContain('cause has been identified');
		expect(calls[1]).toContain('operating normally again');
	});
});
