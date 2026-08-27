import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const adminCredentials = sqliteTable("admin_credentials", {
	id: integer("id").primaryKey(),
	passwordHash: text("password_hash").notNull(),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const sessions = sqliteTable(
	"sessions",
	{
		id: text("id").primaryKey(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		userAgent: text("user_agent"),
	},
	(table) => [index("sessions_expires_at_idx").on(table.expiresAt)],
);

export const loginAttempts = sqliteTable(
	"login_attempts",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		ipAddress: text("ip_address").notNull(),
		attemptedAt: integer("attempted_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [index("login_attempts_ip_attempted_at_idx").on(table.ipAddress, table.attemptedAt)],
);

export const monitors = sqliteTable(
	"monitors",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		name: text("name").notNull(),
		url: text("url").notNull(),
		method: text("method").notNull().default("GET"),
		expectedStatus: integer("expected_status").notNull().default(200),
		intervalSeconds: integer("interval_seconds").notNull().default(300),
		timeoutMs: integer("timeout_ms").notNull().default(10_000),
		enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
		lastOk: integer("last_ok", { mode: "boolean" }),
		lastStatusCode: integer("last_status_code"),
		lastLatencyMs: integer("last_latency_ms"),
		lastError: text("last_error"),
		lastCheckedAt: integer("last_checked_at", { mode: "timestamp_ms" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		index("monitors_enabled_last_checked_at_idx").on(
			table.enabled,
			table.lastCheckedAt,
		),
	],
);

export const checks = sqliteTable(
	"checks",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		monitorId: integer("monitor_id")
			.notNull()
			.references(() => monitors.id, { onDelete: "cascade" }),
		ok: integer("ok", { mode: "boolean" }).notNull(),
		statusCode: integer("status_code"),
		latencyMs: integer("latency_ms"),
		error: text("error"),
		checkedAt: integer("checked_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		index("checks_monitor_id_checked_at_idx").on(
			table.monitorId,
			table.checkedAt,
		),
	],
);
