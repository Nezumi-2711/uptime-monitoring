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
