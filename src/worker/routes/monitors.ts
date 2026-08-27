import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { runCheck } from "../checks/run-check";
import { getDb } from "../db/client";
import { checks, monitors } from "../db/schema";
import { requireAuth, type AuthVariables } from "../lib/require-auth";

type MonitorMethod = "GET" | "HEAD" | "POST";

type ParsedMonitorInput = {
	name?: string;
	url?: string;
	method?: MonitorMethod;
	expectedStatus?: number;
	intervalSeconds?: number;
	timeoutMs?: number;
	enabled?: boolean;
};

type ParseResult =
	| { ok: true; value: ParsedMonitorInput }
	| { ok: false; message: string };

const METHODS = new Set<MonitorMethod>(["GET", "HEAD", "POST"]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseInteger(
	value: unknown,
	name: string,
	minimum: number,
	maximum: number,
): { ok: true; value: number } | { ok: false; message: string } {
	if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
		return {
			ok: false,
			message: `${name} must be an integer between ${minimum} and ${maximum}`,
		};
	}
	return { ok: true, value: value as number };
}

export function parseMonitorInput(body: unknown, partial = false): ParseResult {
	if (!isRecord(body)) return { ok: false, message: "Invalid request body" };

	const value: ParsedMonitorInput = {};
	if (!partial || "name" in body) {
		if (typeof body.name !== "string" || body.name.trim().length < 1 || body.name.trim().length > 100) {
			return { ok: false, message: "Name must be between 1 and 100 characters" };
		}
		value.name = body.name.trim();
	}

	if (!partial || "url" in body) {
		if (typeof body.url !== "string") {
			return { ok: false, message: "Enter a valid http or https URL" };
		}
		try {
			const url = new URL(body.url);
			if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Invalid protocol");
			value.url = url.toString();
		} catch {
			return { ok: false, message: "Enter a valid http or https URL" };
		}
	}

	if (!partial || "method" in body) {
		if (typeof body.method !== "string" || !METHODS.has(body.method as MonitorMethod)) {
			return { ok: false, message: "Method must be GET, HEAD, or POST" };
		}
		value.method = body.method as MonitorMethod;
	}

	for (const [key, label, minimum, maximum] of [
		["expectedStatus", "expectedStatus", 100, 599],
		["intervalSeconds", "intervalSeconds", 300, 86_400],
		["timeoutMs", "timeoutMs", 1_000, 30_000],
	] as const) {
		if (!partial || key in body) {
			const parsed = parseInteger(body[key], label, minimum, maximum);
			if (!parsed.ok) return parsed;
			value[key] = parsed.value;
		}
	}

	if ("enabled" in body) {
		if (typeof body.enabled !== "boolean") {
			return { ok: false, message: "enabled must be a boolean" };
		}
		value.enabled = body.enabled;
	}

	return { ok: true, value };
}

function parseId(rawId: string) {
	const id = Number(rawId);
	return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const monitorRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

monitorRoutes.use("*", requireAuth);

monitorRoutes.get("/", async (context) => {
	const rows = await getDb(context.env).select().from(monitors).orderBy(monitors.createdAt);
	return context.json({ monitors: rows });
});

monitorRoutes.post("/", async (context) => {
	let body: unknown;
	try {
		body = await context.req.json();
	} catch {
		return context.json({ message: "Invalid request body" }, 400);
	}

	const parsed = parseMonitorInput(body);
	if (!parsed.ok) return context.json({ message: parsed.message }, 400);

	const now = new Date();
	const [monitor] = await getDb(context.env)
		.insert(monitors)
		.values({
			name: parsed.value.name!,
			url: parsed.value.url!,
			method: parsed.value.method!,
			expectedStatus: parsed.value.expectedStatus!,
			intervalSeconds: parsed.value.intervalSeconds!,
			timeoutMs: parsed.value.timeoutMs!,
			enabled: parsed.value.enabled ?? true,
			createdAt: now,
			updatedAt: now,
		})
		.returning();

	return context.json({ monitor });
});

monitorRoutes.patch("/:id", async (context) => {
	const id = parseId(context.req.param("id"));
	if (id === null) return context.json({ message: "Monitor not found" }, 404);

	let body: unknown;
	try {
		body = await context.req.json();
	} catch {
		return context.json({ message: "Invalid request body" }, 400);
	}

	const parsed = parseMonitorInput(body, true);
	if (!parsed.ok) return context.json({ message: parsed.message }, 400);
	if (Object.keys(parsed.value).length === 0) {
		return context.json({ message: "Provide at least one field to update" }, 400);
	}

	const [monitor] = await getDb(context.env)
		.update(monitors)
		.set({ ...parsed.value, updatedAt: new Date() })
		.where(eq(monitors.id, id))
		.returning();
	if (!monitor) return context.json({ message: "Monitor not found" }, 404);

	return context.json({ monitor });
});

monitorRoutes.delete("/:id", async (context) => {
	const id = parseId(context.req.param("id"));
	if (id === null) return context.json({ message: "Monitor not found" }, 404);

	const db = getDb(context.env);
	const [monitor] = await db.select({ id: monitors.id }).from(monitors).where(eq(monitors.id, id)).limit(1);
	if (!monitor) return context.json({ message: "Monitor not found" }, 404);

	await db.batch([
		db.delete(checks).where(eq(checks.monitorId, id)),
		db.delete(monitors).where(eq(monitors.id, id)),
	]);
	return context.json({ ok: true });
});

monitorRoutes.post("/:id/check", async (context) => {
	const id = parseId(context.req.param("id"));
	if (id === null) return context.json({ message: "Monitor not found" }, 404);

	const db = getDb(context.env);
	const [monitor] = await db.select().from(monitors).where(eq(monitors.id, id)).limit(1);
	if (!monitor) return context.json({ message: "Monitor not found" }, 404);

	const result = await runCheck(monitor);
	const checkedAt = new Date();
	const [, updated] = await db.batch([
		db.insert(checks).values({
			monitorId: monitor.id,
			ok: result.ok,
			statusCode: result.statusCode,
			latencyMs: result.latencyMs,
			error: result.error,
			checkedAt,
		}),
		db.update(monitors).set({
			lastOk: result.ok,
			lastStatusCode: result.statusCode,
			lastLatencyMs: result.latencyMs,
			lastError: result.error,
			lastCheckedAt: checkedAt,
			updatedAt: checkedAt,
		}).where(eq(monitors.id, monitor.id)).returning(),
	]);

	return context.json({ result, monitor: updated[0] });
});

export default monitorRoutes;
