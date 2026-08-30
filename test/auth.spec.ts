import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env, exports as worker } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/worker/lib/password';

const ADMIN_PASSWORD = 'correct-horse-battery-staple';

async function seedAdmin() {
	await env.DB.batch([
		env.DB.prepare('DELETE FROM login_attempts'),
		env.DB.prepare('DELETE FROM sessions'),
		env.DB.prepare('DELETE FROM admin_credentials'),
	]);

	const now = Date.now();
	await env.DB.prepare('INSERT INTO admin_credentials (id, password_hash, created_at, updated_at) VALUES (1, ?, ?, ?)')
		.bind(await hashPassword(ADMIN_PASSWORD), now, now)
		.run();
}

function login(password = ADMIN_PASSWORD, ipAddress = '198.51.100.10') {
	return worker.default.fetch('https://example.com/api/auth/login', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'CF-Connecting-IP': ipAddress,
			Origin: 'https://example.com',
		},
		body: JSON.stringify({ password }),
	});
}

function cookieFrom(response: Response) {
	return response.headers.get('Set-Cookie')?.split(';', 1)[0] ?? '';
}

describe('authentication', () => {
	beforeAll(async () => {
		const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };
		await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
	});
	beforeEach(seedAdmin);

	it('logs in with the admin password and creates an HttpOnly session', async () => {
		const response = await login();
		const body = await response.json<{ authenticated: boolean }>();

		expect(response.status).toBe(200);
		expect(response.headers.get('Set-Cookie')).toContain('upwatch_session=');
		expect(response.headers.get('Set-Cookie')).toContain('HttpOnly');
		expect(response.headers.get('Set-Cookie')).toContain('SameSite=Lax');
		expect(body).toEqual({ authenticated: true });

		const session = await env.DB.prepare('SELECT id FROM sessions').first();
		expect(session).not.toBeNull();
	});

	it('rejects an incorrect password without setting a cookie', async () => {
		const response = await login('incorrect-password');

		expect(response.status).toBe(401);
		expect(response.headers.get('Set-Cookie')).toBeNull();
		expect(await response.json()).toEqual({
			message: 'Password is incorrect',
		});
	});

	it('returns authentication state from the session endpoint', async () => {
		const anonymousResponse = await worker.default.fetch('https://example.com/api/auth/me');
		expect(anonymousResponse.status).toBe(200);
		expect(await anonymousResponse.json()).toEqual({ authenticated: false });

		const loginResponse = await login();
		const authenticatedResponse = await worker.default.fetch('https://example.com/api/auth/me', {
			headers: { Cookie: cookieFrom(loginResponse) },
		});

		expect(authenticatedResponse.status).toBe(200);
		expect(await authenticatedResponse.json()).toEqual({ authenticated: true });
	});

	it('revokes the persisted session on logout', async () => {
		const loginResponse = await login();
		const cookie = cookieFrom(loginResponse);
		const logoutResponse = await worker.default.fetch('https://example.com/api/auth/logout', {
			method: 'POST',
			headers: {
				Cookie: cookie,
				Origin: 'https://example.com',
			},
		});

		expect(logoutResponse.status).toBe(200);
		expect(await logoutResponse.json()).toEqual({ ok: true });
		const sessionCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM sessions').first<{ count: number }>();
		expect(sessionCount?.count).toBe(0);

		const sessionResponse = await worker.default.fetch('https://example.com/api/auth/me', {
			headers: { Cookie: cookie },
		});
		expect(await sessionResponse.json()).toEqual({ authenticated: false });
	});

	it('rate limits repeated failed login attempts by IP', async () => {
		const responses: Response[] = [];
		for (let attempt = 0; attempt < 11; attempt += 1) {
			responses.push(await login('incorrect-password', '203.0.113.42'));
		}

		expect(responses.slice(0, 10).every((response) => response.status === 401)).toBe(true);
		expect(responses[10].status).toBe(429);
		expect(await responses[10].json()).toEqual({
			message: 'Too many login attempts. Try again later',
		});
	});
});
