import { and, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { buildResultStatements } from "../checks/persist-result";
import { runCheck } from "../checks/run-check";
import { getDb } from "../db/client";
import { checks, incidents, monitorDailyStats, monitors } from "../db/schema";
import { requireAuth, type AuthVariables } from "../lib/require-auth";
import { sendIncidentAlert } from "../notifications/webhook";

type MonitorMethod = "GET" | "HEAD" | "POST";

type ParsedMonitorInput = {
	name?: string;
	url?: string;
	method?: MonitorMethod;
	expectedStatus?: number;
	intervalSeconds?: number;
	timeoutMs?: number;
	enabled?: boolean;
	alertsEnabled?: boolean;
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
	if ("alertsEnabled" in body) {
		if (typeof body.alertsEnabled !== "boolean") {
			return { ok: false, message: "alertsEnabled must be a boolean" };
		}
		value.alertsEnabled = body.alertsEnabled;
	}

	return { ok: true, value };
}

function parseId(rawId: string) {
	const id = Number(rawId);
	return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseLimit(raw: string | undefined, fallback: number, maximum: number) {
	if (!raw) return fallback;
	const value = Number(raw);
	return Number.isSafeInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
}

type StatsWindow = {
	uptimePct: number | null;
	totalChecks: number;
	upChecks: number;
	avgLatencyMs: number | null;
	incidentCount: number;
};

function asStatsWindow(
	row: { totalChecks: number; upChecks: number; avgLatencyMs: number | null },
	incidentCount: number,
): StatsWindow {
	return {
		uptimePct: row.totalChecks > 0 ? Math.round((row.upChecks / row.totalChecks) * 100_000) / 1_000 : null,
		totalChecks: row.totalChecks,
		upChecks: row.upChecks,
		avgLatencyMs: row.avgLatencyMs,
		incidentCount,
	};
}

const monitorRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

monitorRoutes.use("*", requireAuth);

monitorRoutes.get("/", async (context) => {
	const rows = await getDb(context.env).select().from(monitors).orderBy(monitors.createdAt);
	return context.json({ monitors: rows });
});

monitorRoutes.get("/:id", async (context) => {
	const id = parseId(context.req.param("id"));
	if (id === null) return context.json({ message: "Monitor not found" }, 404);
	const [monitor] = await getDb(context.env).select().from(monitors).where(eq(monitors.id, id)).limit(1);
	if (!monitor) return context.json({ message: "Monitor not found" }, 404);
	return context.json({ monitor });
});

monitorRoutes.get("/:id/checks", async (context) => {
	const id = parseId(context.req.param("id"));
	if (id === null) return context.json({ message: "Monitor not found" }, 404);
	const limit = parseLimit(context.req.query("limit"), 100, 500);
	const rows = await getDb(context.env)
		.select()
		.from(checks)
		.where(eq(checks.monitorId, id))
		.orderBy(desc(checks.checkedAt))
		.limit(limit);
	return context.json({ checks: rows });
});

monitorRoutes.get("/:id/incidents", async (context) => {
	const id = parseId(context.req.param("id"));
	if (id === null) return context.json({ message: "Monitor not found" }, 404);
	const limit = parseLimit(context.req.query("limit"), 50, 200);
	const rows = await getDb(context.env)
		.select()
		.from(incidents)
		.where(eq(incidents.monitorId, id))
		.orderBy(desc(incidents.startedAt))
		.limit(limit);
	return context.json({ incidents: rows });
});

monitorRoutes.get("/:id/stats", async (context) => {
	const id = parseId(context.req.param("id"));
	if (id === null) return context.json({ message: "Monitor not found" }, 404);
	const db = getDb(context.env);
	const [monitor] = await db.select({ id: monitors.id }).from(monitors).where(eq(monitors.id, id)).limit(1);
	if (!monitor) return context.json({ message: "Monitor not found" }, 404);

	const now = Date.now();
	const currentDayMs = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
	const windows = [
		{ key: "24h", start: now - 24 * 60 * 60 * 1000, raw: true },
		{ key: "7d", start: now - 7 * 24 * 60 * 60 * 1000, raw: true },
		{ key: "30d", start: currentDayMs - 29 * 24 * 60 * 60 * 1000, raw: false },
		{ key: "90d", start: currentDayMs - 89 * 24 * 60 * 60 * 1000, raw: false },
	] as const;

	const results = await Promise.all(windows.map(async (window) => {
		const [aggregate] = window.raw
			? await db.select({
				totalChecks: sql<number>`count(*)`,
				upChecks: sql<number>`coalesce(sum(case when ${checks.ok} = 1 then 1 else 0 end), 0)`,
				avgLatencyMs: sql<number | null>`round(avg(${checks.latencyMs}))`,
			}).from(checks).where(and(eq(checks.monitorId, id), gte(checks.checkedAt, new Date(window.start))))
			: await db.select({
				totalChecks: sql<number>`coalesce(sum(total_checks), 0)`,
				upChecks: sql<number>`coalesce(sum(up_checks), 0)`,
				avgLatencyMs: sql<number | null>`round(sum(avg_latency_ms * total_checks) / nullif(sum(total_checks), 0))`,
			}).from(sql`(
				select total_checks, up_checks, avg_latency_ms
				from monitor_daily_stats
				where monitor_id = ${id} and day >= ${window.start} and day < ${currentDayMs}
				union all
				select count(*), coalesce(sum(case when ok = 1 then 1 else 0 end), 0), round(avg(latency_ms))
				from checks
				where monitor_id = ${id} and checked_at >= ${currentDayMs}
			)`);
		const [incidentAggregate] = await db.select({ count: sql<number>`count(*)` })
			.from(incidents)
			.where(and(
				eq(incidents.monitorId, id),
				gte(incidents.startedAt, new Date(window.start)),
				or(isNull(incidents.resolvedAt), gte(incidents.resolvedAt, new Date(window.start))),
			));
		return [window.key, asStatsWindow(aggregate, incidentAggregate.count)] as const;
	}));

	return context.json({ windows: Object.fromEntries(results) as Record<(typeof windows)[number]["key"], StatsWindow> });
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
			alertsEnabled: parsed.value.alertsEnabled ?? true,
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
	const { statements, transition } = buildResultStatements(db, monitor, result, checkedAt);
	await db.batch(statements as [typeof statements[number], ...typeof statements]);
	if (transition) {
		await sendIncidentAlert(context.env, { monitor, kind: transition, result, at: checkedAt });
	}
	const [updated] = await db.select().from(monitors).where(eq(monitors.id, monitor.id)).limit(1);

	return context.json({ result, monitor: updated });
});

export default monitorRoutes;
