import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("uptime monitoring Worker", () => {
	it("returns a successful D1 health response", async () => {
		const response = await SELF.fetch("https://example.com/api/health");
		const body = await response.json<{
			ok: boolean;
			db: { ok: number } | null;
			ts: number;
		}>();

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("application/json");
		expect(body.ok).toBe(true);
		expect(body.db).toEqual({ ok: 1 });
		expect(body.ts).toEqual(expect.any(Number));
	});
});
