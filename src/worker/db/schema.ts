import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const adminCredentials = sqliteTable('admin_credentials', {
	id: integer('id').primaryKey(),
	passwordHash: text('password_hash').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const notificationSettings = sqliteTable('notification_settings', {
	id: integer('id').primaryKey(),
	webhookUrl: text('webhook_url'),
	webhookEnabled: integer('webhook_enabled', { mode: 'boolean' }).notNull().default(false),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const aiSettings = sqliteTable('ai_settings', {
	id: integer('id').primaryKey(),
	enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
	baseUrl: text('base_url'),
	apiKey: text('api_key'),
	model: text('model'),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const sessions = sqliteTable(
	'sessions',
	{
		id: text('id').primaryKey(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		userAgent: text('user_agent'),
	},
	(table) => [index('sessions_expires_at_idx').on(table.expiresAt)],
);

export const loginAttempts = sqliteTable(
	'login_attempts',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		ipAddress: text('ip_address').notNull(),
		attemptedAt: integer('attempted_at', { mode: 'timestamp_ms' }).notNull(),
	},
	(table) => [index('login_attempts_ip_attempted_at_idx').on(table.ipAddress, table.attemptedAt)],
);

export const monitors = sqliteTable(
	'monitors',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		name: text('name').notNull(),
		url: text('url').notNull(),
		method: text('method').notNull().default('GET'),
		expectedStatus: integer('expected_status').notNull().default(200),
		intervalSeconds: integer('interval_seconds').notNull().default(300),
		timeoutMs: integer('timeout_ms').notNull().default(10_000),
		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
		alertsEnabled: integer('alerts_enabled', { mode: 'boolean' }).notNull().default(true),
		lastOk: integer('last_ok', { mode: 'boolean' }),
		lastStatusCode: integer('last_status_code'),
		lastLatencyMs: integer('last_latency_ms'),
		lastError: text('last_error'),
		lastCheckedAt: integer('last_checked_at', { mode: 'timestamp_ms' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
	},
	(table) => [index('monitors_enabled_last_checked_at_idx').on(table.enabled, table.lastCheckedAt)],
);

export const maintenanceWindows = sqliteTable(
	'maintenance_windows',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		name: text('name').notNull(),
		startMinute: integer('start_minute').notNull(),
		durationMinutes: integer('duration_minutes').notNull(),
		timezone: text('timezone').notNull().default('UTC'),
		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
	},
	(table) => [index('maintenance_windows_enabled_idx').on(table.enabled)],
);

export const maintenanceWindowMonitors = sqliteTable(
	'maintenance_window_monitors',
	{
		windowId: integer('window_id')
			.notNull()
			.references(() => maintenanceWindows.id, { onDelete: 'cascade' }),
		monitorId: integer('monitor_id')
			.notNull()
			.references(() => monitors.id, { onDelete: 'cascade' }),
	},
	(table) => [
		primaryKey({ columns: [table.windowId, table.monitorId] }),
		index('maintenance_window_monitors_monitor_id_idx').on(table.monitorId),
	],
);

export const checks = sqliteTable(
	'checks',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		monitorId: integer('monitor_id')
			.notNull()
			.references(() => monitors.id, { onDelete: 'cascade' }),
		ok: integer('ok', { mode: 'boolean' }).notNull(),
		statusCode: integer('status_code'),
		latencyMs: integer('latency_ms'),
		error: text('error'),
		checkedAt: integer('checked_at', { mode: 'timestamp_ms' }).notNull(),
		maintenance: integer('maintenance', { mode: 'boolean' }).notNull().default(false),
	},
	(table) => [index('checks_monitor_id_checked_at_idx').on(table.monitorId, table.checkedAt)],
);

export const incidents = sqliteTable(
	'incidents',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		monitorId: integer('monitor_id')
			.notNull()
			.references(() => monitors.id, { onDelete: 'cascade' }),
		startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
		resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
		startStatusCode: integer('start_status_code'),
		startError: text('start_error'),
		aiMessage: text('ai_message'),
		durationMs: integer('duration_ms'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
	},
	(table) => [index('incidents_monitor_id_started_at_idx').on(table.monitorId, table.startedAt)],
);

export const monitorDailyStats = sqliteTable(
	'monitor_daily_stats',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		monitorId: integer('monitor_id')
			.notNull()
			.references(() => monitors.id, { onDelete: 'cascade' }),
		day: integer('day', { mode: 'timestamp_ms' }).notNull(),
		totalChecks: integer('total_checks').notNull(),
		upChecks: integer('up_checks').notNull(),
		avgLatencyMs: integer('avg_latency_ms'),
		minLatencyMs: integer('min_latency_ms'),
		maxLatencyMs: integer('max_latency_ms'),
	},
	(table) => [uniqueIndex('monitor_daily_stats_monitor_id_day_uidx').on(table.monitorId, table.day)],
);
