import { applyD1Migrations, env, SELF, type D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/worker/lib/password";

const ADMIN_PASSWORD = "correct-horse-battery-staple";
const VALID_MONITOR = {
	name: "Example",
	url: "https://example.com/health",
	method: "GET",
	expectedStatus: 200,
	intervalSeconds: 300,
	timeoutMs: 10_000,
};

async function seedAdmin() {
	await env.DB.batch([
		env.DB.prepare("DELETE FROM checks"),
		env.DB.prepare("DELETE FROM incidents"),
		env.DB.prepare("DELETE FROM monitor_daily_stats"),
		env.DB.prepare("DELETE FROM notification_settings"),
		env.DB.prepare("DELETE FROM monitors"),
		env.DB.prepare("DELETE FROM login_attempts"),
		env.DB.prepare("DELETE FROM sessions"),
		env.DB.prepare("DELETE FROM admin_credentials"),
	]);
	const now = Date.now();
	await env.DB.prepare("INSERT INTO admin_credentials (id, password_hash, created_at, updated_at) VALUES (1, ?, ?, ?)")
		.bind(await hashPassword(ADMIN_PASSWORD), now, now)
		.run();
}

async function authenticatedCookie() {
	const response = await SELF.fetch("https://example.com/api/auth/login", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"CF-Connecting-IP": "198.51.100.20",
			Origin: "https://example.com",
		},
		body: JSON.stringify({ password: ADMIN_PASSWORD }),
	});
	return response.headers.get("Set-Cookie")?.split(";", 1)[0] ?? "";
}

function apiFetch(path: string, method = "GET", cookie = "", body?: unknown) {
	return SELF.fetch(`https://example.com${path}`, {
		method,
		headers: {
			...(cookie ? { Cookie: cookie } : {}),
			...(method !== "GET" ? { Origin: "https://example.com" } : {}),
			...(body === undefined ? {} : { "Content-Type": "application/json" }),
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

async function createMonitor(cookie: string, overrides: Record<string, unknown> = {}) {
	return apiFetch("/api/monitors", "POST", cookie, { ...VALID_MONITOR, ...overrides });
}

describe("monitor API", () => {
	beforeAll(async () => {
		const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };
		await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
	});
	beforeEach(seedAdmin);

	it("protects every monitor endpoint, including the collection path without a trailing slash", async () => {
		const requests = [
			apiFetch("/api/monitors"),
			apiFetch("/api/monitors", "POST", "", VALID_MONITOR),
			apiFetch("/api/monitors/1", "PATCH", "", { name: "Changed" }),
			apiFetch("/api/monitors/1", "DELETE"),
			apiFetch("/api/monitors/1/check", "POST"),
		];
		const responses = await Promise.all(requests);
		for (const response of responses) {
			expect(response.status).toBe(401);
			expect(await response.json()).toEqual({ message: "Authentication required" });
		}
	});

	it("creates a valid monitor and returns it in the list", async () => {
		const cookie = await authenticatedCookie();
		const response = await createMonitor(cookie);
		const created = await response.json<{ monitor: { id: number; name: string; enabled: boolean; alertsEnabled: boolean } }>();

		expect(response.status).toBe(200);
		expect(created.monitor).toMatchObject({ name: "Example", enabled: true, alertsEnabled: true });

		const listResponse = await apiFetch("/api/monitors", "GET", cookie);
		const list = await listResponse.json<{ monitors: Array<{ id: number; url: string }> }>();
		expect(list.monitors).toHaveLength(1);
		expect(list.monitors[0]).toMatchObject({ id: created.monitor.id, url: "https://example.com/health" });
	});

	it.each([
		[{ url: "file:///etc/passwd" }, "Enter a valid http or https URL"],
		[{ intervalSeconds: 60 }, "intervalSeconds must be an integer between 300 and 86400"],
		[{ expectedStatus: 99 }, "expectedStatus must be an integer between 100 and 599"],
	] as const)("rejects invalid monitor input %o", async (overrides, message) => {
		const response = await createMonitor(await authenticatedCookie(), overrides);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ message });
	});

	it("patches only the requested fields", async () => {
		const cookie = await authenticatedCookie();
		const created = await (await createMonitor(cookie)).json<{ monitor: { id: number } }>();
		const response = await apiFetch(`/api/monitors/${created.monitor.id}`, "PATCH", cookie, {
			name: "Renamed endpoint",
			enabled: false,
		});
		const body = await response.json<{ monitor: { name: string; url: string; enabled: boolean } }>();

		expect(response.status).toBe(200);
		expect(body.monitor).toMatchObject({
			name: "Renamed endpoint",
			url: "https://example.com/health",
			enabled: false,
		});
	});

	it("returns detail, checks, incidents, and raw stats", async () => {
		const cookie = await authenticatedCookie();
		const created = await (await createMonitor(cookie)).json<{ monitor: { id: number } }>();
		const id = created.monitor.id;
		const now = Date.now();
		await env.DB.batch([
			env.DB.prepare("INSERT INTO checks (monitor_id, ok, status_code, latency_ms, checked_at) VALUES (?, 1, 200, 100, ?)").bind(id, now - 2000),
			env.DB.prepare("INSERT INTO checks (monitor_id, ok, status_code, latency_ms, checked_at) VALUES (?, 0, 500, 300, ?)").bind(id, now - 1000),
			env.DB.prepare("INSERT INTO incidents (monitor_id, started_at, start_status_code, start_error, created_at, updated_at) VALUES (?, ?, 500, 'Down', ?, ?)").bind(id, now - 1000, now - 1000, now - 1000),
		]);

		const [detail, checksResponse, incidentsResponse, statsResponse] = await Promise.all([
			apiFetch(`/api/monitors/${id}`, "GET", cookie),
			apiFetch(`/api/monitors/${id}/checks`, "GET", cookie),
			apiFetch(`/api/monitors/${id}/incidents`, "GET", cookie),
			apiFetch(`/api/monitors/${id}/stats`, "GET", cookie),
		]);
		expect((await detail.json<{ monitor: { id: number } }>()).monitor.id).toBe(id);
		expect((await checksResponse.json<{ checks: unknown[] }>()).checks).toHaveLength(2);
		expect((await incidentsResponse.json<{ incidents: unknown[] }>()).incidents).toHaveLength(1);
		const stats = await statsResponse.json<{ windows: { "24h": { uptimePct: number; totalChecks: number; upChecks: number; avgLatencyMs: number; incidentCount: number } } }>();
		expect(stats.windows["24h"]).toEqual({ uptimePct: 50, totalChecks: 2, upChecks: 1, avgLatencyMs: 200, incidentCount: 1 });
	});

	it("combines daily rollups with the current partial day for long-range stats", async () => {
		const cookie = await authenticatedCookie();
		const created = await (await createMonitor(cookie)).json<{ monitor: { id: number } }>();
		const id = created.monitor.id;
		const now = new Date();
		const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
		await env.DB.batch([
			env.DB.prepare("INSERT INTO monitor_daily_stats (monitor_id, day, total_checks, up_checks, avg_latency_ms, min_latency_ms, max_latency_ms) VALUES (?, ?, 8, 6, 100, 50, 150)").bind(id, today - 24 * 60 * 60 * 1000),
			env.DB.prepare("INSERT INTO checks (monitor_id, ok, status_code, latency_ms, checked_at) VALUES (?, 1, 200, 200, ?)").bind(id, today + 1000),
			env.DB.prepare("INSERT INTO checks (monitor_id, ok, status_code, latency_ms, checked_at) VALUES (?, 1, 200, 200, ?)").bind(id, today + 2000),
		]);

		const response = await apiFetch(`/api/monitors/${id}/stats`, "GET", cookie);
		const stats = await response.json<{ windows: { "30d": { uptimePct: number; totalChecks: number; upChecks: number; avgLatencyMs: number } } }>();
		expect(stats.windows["30d"]).toMatchObject({
			uptimePct: 80,
			totalChecks: 10,
			upChecks: 8,
			avgLatencyMs: 120,
		});
	});

	it("deletes the monitor and its check records explicitly", async () => {
		const cookie = await authenticatedCookie();
		const created = await (await createMonitor(cookie)).json<{ monitor: { id: number } }>();
		await env.DB.prepare("INSERT INTO checks (monitor_id, ok, status_code, latency_ms, checked_at) VALUES (?, 1, 200, 12, ?)")
			.bind(created.monitor.id, Date.now())
			.run();

		const response = await apiFetch(`/api/monitors/${created.monitor.id}`, "DELETE", cookie);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });

		const monitorCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM monitors").first<{ count: number }>();
		const checkCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM checks").first<{ count: number }>();
		expect(monitorCount?.count).toBe(0);
		expect(checkCount?.count).toBe(0);
	});
});
