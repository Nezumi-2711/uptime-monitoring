import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env, exports as worker } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/worker/lib/password';

const PASSWORD = 'correct-horse-battery-staple';
async function reset() {
	await env.DB.batch([
		env.DB.prepare('DELETE FROM notification_deliveries'),
		env.DB.prepare('DELETE FROM notification_channel_monitors'),
		env.DB.prepare('DELETE FROM notification_channels'),
		env.DB.prepare('DELETE FROM incident_updates'),
		env.DB.prepare('DELETE FROM incident_monitors'),
		env.DB.prepare('DELETE FROM incidents'),
		env.DB.prepare('DELETE FROM checks'),
		env.DB.prepare('DELETE FROM monitors'),
		env.DB.prepare('DELETE FROM sessions'),
		env.DB.prepare('DELETE FROM admin_credentials'),
		env.DB.prepare('DELETE FROM ai_settings'),
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
function request(path: string, method = 'GET', auth = '', body?: unknown) {
	return worker.default.fetch(`https://example.com${path}`, {
		method,
		headers: {
			...(auth ? { Cookie: auth } : {}),
			...(method !== 'GET' ? { Origin: 'https://example.com' } : {}),
			...(body ? { 'Content-Type': 'application/json' } : {}),
		},
		body: body ? JSON.stringify(body) : undefined,
	});
}
async function monitor(name: string) {
	const now = Date.now();
	const result = await env.DB.prepare(
		"INSERT INTO monitors (name, url, method, expected_status, interval_seconds, timeout_ms, enabled, alerts_enabled, last_ok, created_at, updated_at) VALUES (?, 'https://example.com', 'GET', 200, 300, 10000, 1, 1, 1, ?, ?)",
	)
		.bind(name, now, now)
		.run();
	return Number(result.meta.last_row_id);
}

describe('incident lifecycle API', () => {
	beforeAll(async () => applyD1Migrations(env.DB, (env as Env & { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS));
	beforeEach(reset);
	it('protects admin incident routes', async () => {
		for (const [path, method] of [
			['/api/incidents', 'GET'],
			['/api/incidents', 'POST'],
			['/api/incidents/draft', 'POST'],
			['/api/incidents/1', 'GET'],
			['/api/incidents/1/updates', 'POST'],
		] as const)
			expect((await request(path, method)).status).toBe(401);
	});
	it('creates a multi-service manual incident and resolves it with an update', async () => {
		const ids = await Promise.all(['API', 'Web', 'Jobs'].map(monitor));
		const auth = await cookie();
		const created = await request('/api/incidents', 'POST', auth, {
			title: 'Delayed requests',
			impact: 'critical',
			status: 'investigating',
			body: 'Some requests are taking longer than expected. We are investigating.',
			note: 'redis memory',
			monitorIds: ids,
		});
		expect(created.status).toBe(201);
		const body = await created.json<{ incident: { id: number; monitorIds: number[]; updates: unknown[] } }>();
		expect(body.incident.monitorIds).toHaveLength(3);
		expect(body.incident.updates).toHaveLength(1);
		const resolved = await request(`/api/incidents/${body.incident.id}/updates`, 'POST', auth, {
			status: 'resolved',
			body: 'Service is operating normally again.',
			note: 'scaled',
		});
		expect(resolved.status).toBe(200);
		const row = await env.DB.prepare('SELECT status, resolved_at, duration_ms FROM incidents WHERE id = ?').bind(body.incident.id).first();
		expect(row).toMatchObject({ status: 'resolved' });
		expect(row?.resolved_at).toEqual(expect.any(Number));
	});
	it('publishes a service-less critical incident without leaking internal notes', async () => {
		const auth = await cookie();
		const created = await request('/api/incidents', 'POST', auth, {
			title: 'Sign-in disruption',
			impact: 'critical',
			status: 'investigating',
			body: 'Some customers cannot sign in. We are investigating.',
			note: 'internal secret redis',
			monitorIds: [],
		});
		const incident = (await created.json<{ incident: { id: number } }>()).incident;
		const status = await (await request('/api/status')).json<{ overall: string; activeIncidents: Array<{ services: unknown[] }> }>();
		expect(status.overall).toBe('down');
		expect(status.activeIncidents[0].services).toEqual([]);
		const detailText = await (await request(`/api/status/incidents/${incident.id}`)).text();
		expect(detailText).not.toContain('internal secret');
		expect(detailText).not.toContain('note');
	});
	it('keeps an incident after its assigned monitor is deleted', async () => {
		const id = await monitor('API');
		const auth = await cookie();
		const created = await request('/api/incidents', 'POST', auth, {
			title: 'API issue',
			impact: 'major',
			status: 'investigating',
			body: 'Some requests are failing.',
			monitorIds: [id],
		});
		const incidentId = (await created.json<{ incident: { id: number } }>()).incident.id;
		expect((await request(`/api/monitors/${id}`, 'DELETE', auth)).status).toBe(200);
		expect(await env.DB.prepare('SELECT id FROM incidents WHERE id = ?').bind(incidentId).first()).toBeTruthy();
		expect(await env.DB.prepare('SELECT * FROM incident_monitors WHERE incident_id = ?').bind(incidentId).first()).toBeNull();
	});
});
