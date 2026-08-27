import { applyD1Migrations, env, SELF, type D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/worker/lib/password";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "correct-horse-battery-staple";

async function seedAdmin() {
	await env.DB.batch([
		env.DB.prepare("DELETE FROM login_attempts"),
		env.DB.prepare("DELETE FROM sessions"),
		env.DB.prepare("DELETE FROM users"),
	]);

	const now = Date.now();
	await env.DB.prepare(
		"INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
	)
		.bind(
			"test-admin",
			ADMIN_EMAIL,
			await hashPassword(ADMIN_PASSWORD),
			now,
			now,
		)
		.run();
}

function login(password = ADMIN_PASSWORD, ipAddress = "198.51.100.10") {
	return SELF.fetch("https://example.com/api/auth/login", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"CF-Connecting-IP": ipAddress,
			Origin: "https://example.com",
		},
		body: JSON.stringify({ email: ADMIN_EMAIL, password }),
	});
}

function cookieFrom(response: Response) {
	return response.headers.get("Set-Cookie")?.split(";", 1)[0] ?? "";
}

describe("authentication", () => {
	beforeAll(async () => {
		const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };
		await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
	});
	beforeEach(seedAdmin);

	it("logs in with the admin credentials and creates an HttpOnly session", async () => {
		const response = await login();
		const body = await response.json<{ user: { id: string; email: string } }>();

		expect(response.status).toBe(200);
		expect(response.headers.get("Set-Cookie")).toContain("upwatch_session=");
		expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
		expect(response.headers.get("Set-Cookie")).toContain("SameSite=Lax");
		expect(body.user).toEqual({ id: "test-admin", email: ADMIN_EMAIL });

		const session = await env.DB.prepare("SELECT id FROM sessions WHERE user_id = ?")
			.bind("test-admin")
			.first();
		expect(session).not.toBeNull();
	});

	it("rejects an incorrect password without setting a cookie", async () => {
		const response = await login("incorrect-password");

		expect(response.status).toBe(401);
		expect(response.headers.get("Set-Cookie")).toBeNull();
		expect(await response.json()).toEqual({
			message: "Email or password is incorrect",
		});
	});

	it("returns a nullable user from the session endpoint", async () => {
		const anonymousResponse = await SELF.fetch("https://example.com/api/auth/me");
		expect(anonymousResponse.status).toBe(200);
		expect(await anonymousResponse.json()).toEqual({ user: null });

		const loginResponse = await login();
		const authenticatedResponse = await SELF.fetch("https://example.com/api/auth/me", {
			headers: { Cookie: cookieFrom(loginResponse) },
		});

		expect(authenticatedResponse.status).toBe(200);
		expect(await authenticatedResponse.json()).toEqual({
			user: { id: "test-admin", email: ADMIN_EMAIL },
		});
	});

	it("revokes the persisted session on logout", async () => {
		const loginResponse = await login();
		const cookie = cookieFrom(loginResponse);
		const logoutResponse = await SELF.fetch("https://example.com/api/auth/logout", {
			method: "POST",
			headers: {
				Cookie: cookie,
				Origin: "https://example.com",
			},
		});

		expect(logoutResponse.status).toBe(200);
		expect(await logoutResponse.json()).toEqual({ ok: true });
		const sessionCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM sessions")
			.first<{ count: number }>();
		expect(sessionCount?.count).toBe(0);

		const sessionResponse = await SELF.fetch("https://example.com/api/auth/me", {
			headers: { Cookie: cookie },
		});
		expect(await sessionResponse.json()).toEqual({ user: null });
	});

	it("rate limits repeated failed login attempts by IP", async () => {
		const responses: Response[] = [];
		for (let attempt = 0; attempt < 11; attempt += 1) {
			responses.push(await login("incorrect-password", "203.0.113.42"));
		}

		expect(responses.slice(0, 10).every((response) => response.status === 401)).toBe(true);
		expect(responses[10].status).toBe(429);
		expect(await responses[10].json()).toEqual({
			message: "Too many login attempts. Try again later",
		});
	});
});
