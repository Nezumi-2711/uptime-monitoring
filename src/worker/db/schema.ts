import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const adminCredentials = sqliteTable('admin_credentials', {
	id: integer('id').primaryKey(),
	passwordHash: text('password_hash').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const aiSettings = sqliteTable('ai_settings', {
	id: integer('id').primaryKey(),
	enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
	baseUrl: text('base_url'),
	apiKey: text('api_key'),
	model: text('model'),
	autopilotEnabled: integer('autopilot_enabled', { mode: 'boolean' }).notNull().default(false),
	autopilotFollowupMinutes: integer('autopilot_followup_minutes').notNull().default(15),
	autopilotMaxUpdates: integer('autopilot_max_updates').notNull().default(6),
	autopilotAdvanceStatus: integer('autopilot_advance_status', { mode: 'boolean' }).notNull().default(false),
	autopilotDegradedIncidents: integer('autopilot_degraded_incidents', { mode: 'boolean' }).notNull().default(false),
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
	(table) => [
		index('login_attempts_ip_attempted_at_idx').on(table.ipAddress, table.attemptedAt),
		// Retention cleanup filters on attempted_at alone; the composite index above cannot serve it.
		index('login_attempts_attempted_at_idx').on(table.attemptedAt),
	],
);

export const monitors = sqliteTable(
	'monitors',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		name: text('name').notNull(),
		url: text('url').notNull(),
		method: text('method').notNull().default('GET'),
		expectedStatus: integer('expected_status').notNull().default(200),
		expectKeyword: text('expect_keyword'),
		keywordInverted: integer('keyword_inverted', { mode: 'boolean' }).notNull().default(false),
		requestHeaders: text('request_headers'),
		requestBody: text('request_body'),
		degradedLatencyMs: integer('degraded_latency_ms'),
		intervalSeconds: integer('interval_seconds').notNull().default(300),
		timeoutMs: integer('timeout_ms').notNull().default(10_000),
		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
		alertsEnabled: integer('alerts_enabled', { mode: 'boolean' }).notNull().default(true),
		/** Number of immediate retries after a failed attempt. Zero disables retries. */
		retryCount: integer('retry_count').notNull().default(1),
		/** Consecutive failed checks required before confirming an outage. */
		failureThreshold: integer('failure_threshold').notNull().default(2),
		/** Failures since the last successful check. Maintenance checks do not change this value. */
		consecutiveFailures: integer('consecutive_failures').notNull().default(0),
		/** Slow successful checks since latency last recovered. Maintenance checks do not change this value. */
		consecutiveSlow: integer('consecutive_slow').notNull().default(0),
		/** Confirmed state, not the raw latest result. */
		lastOk: integer('last_ok', { mode: 'boolean' }),
		/** Confirmed degraded state. A down monitor is never degraded. */
		lastDegraded: integer('last_degraded', { mode: 'boolean' }).notNull().default(false),
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
		degraded: integer('degraded', { mode: 'boolean' }).notNull().default(false),
	},
	(table) => [
		index('checks_monitor_id_checked_at_idx').on(table.monitorId, table.checkedAt),
		// Daily rollup and retention cleanup scan by checked_at across every monitor; without this
		// index those become full-table scans, which dominate D1 "rows read" at scale.
		index('checks_checked_at_idx').on(table.checkedAt),
	],
);

export const incidents = sqliteTable(
	'incidents',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		title: text('title'),
		status: text('status').notNull().default('investigating'),
		impact: text('impact').notNull().default('major'),
		source: text('source').notNull().default('auto'),
		kind: text('kind').notNull().default('down'),
		startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
		resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
		startStatusCode: integer('start_status_code'),
		startError: text('start_error'),
		durationMs: integer('duration_ms'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
	},
	(table) => [index('incidents_started_at_idx').on(table.startedAt), index('incidents_resolved_at_idx').on(table.resolvedAt)],
);

export const incidentMonitors = sqliteTable(
	'incident_monitors',
	{
		incidentId: integer('incident_id')
			.notNull()
			.references(() => incidents.id, { onDelete: 'cascade' }),
		monitorId: integer('monitor_id')
			.notNull()
			.references(() => monitors.id, { onDelete: 'cascade' }),
	},
	(table) => [primaryKey({ columns: [table.incidentId, table.monitorId] }), index('incident_monitors_monitor_id_idx').on(table.monitorId)],
);

export const incidentUpdates = sqliteTable(
	'incident_updates',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		incidentId: integer('incident_id')
			.notNull()
			.references(() => incidents.id, { onDelete: 'cascade' }),
		status: text('status').notNull(),
		body: text('body').notNull(),
		note: text('note'),
		source: text('source').notNull().default('manual'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	},
	(table) => [index('incident_updates_incident_id_created_at_idx').on(table.incidentId, table.createdAt)],
);

export const aiEvents = sqliteTable(
	'ai_events',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		kind: text('kind').notNull(),
		incidentId: integer('incident_id').references(() => incidents.id, { onDelete: 'set null' }),
		monitorId: integer('monitor_id').references(() => monitors.id, { onDelete: 'set null' }),
		model: text('model'),
		outcome: text('outcome').notNull(),
		reason: text('reason'),
		latencyMs: integer('latency_ms'),
		promptTokens: integer('prompt_tokens'),
		completionTokens: integer('completion_tokens'),
		contextPreview: text('context_preview'),
		outputPreview: text('output_preview'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	},
	(table) => [index('ai_events_created_at_idx').on(table.createdAt)],
);

export const notificationChannels = sqliteTable(
	'notification_channels',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		name: text('name').notNull(),
		type: text('type').notNull(),
		config: text('config').notNull(),
		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
		notifyManual: integer('notify_manual', { mode: 'boolean' }).notNull().default(true),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
	},
	(table) => [index('notification_channels_enabled_idx').on(table.enabled)],
);

export const notificationChannelMonitors = sqliteTable(
	'notification_channel_monitors',
	{
		channelId: integer('channel_id')
			.notNull()
			.references(() => notificationChannels.id, { onDelete: 'cascade' }),
		monitorId: integer('monitor_id')
			.notNull()
			.references(() => monitors.id, { onDelete: 'cascade' }),
	},
	(table) => [
		primaryKey({ columns: [table.channelId, table.monitorId] }),
		index('notification_channel_monitors_monitor_id_idx').on(table.monitorId),
	],
);

export const notificationDeliveries = sqliteTable(
	'notification_deliveries',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		channelId: integer('channel_id')
			.notNull()
			.references(() => notificationChannels.id, { onDelete: 'cascade' }),
		incidentId: integer('incident_id').references(() => incidents.id, { onDelete: 'cascade' }),
		monitorId: integer('monitor_id').references(() => monitors.id, { onDelete: 'cascade' }),
		event: text('event').notNull(),
		ok: integer('ok', { mode: 'boolean' }).notNull(),
		statusCode: integer('status_code'),
		error: text('error'),
		attempts: integer('attempts').notNull().default(1),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	},
	(table) => [
		index('notification_deliveries_channel_id_created_at_idx').on(table.channelId, table.createdAt),
		// Retention cleanup filters on created_at alone; the composite index above cannot serve it.
		index('notification_deliveries_created_at_idx').on(table.createdAt),
	],
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
	(table) => [
		uniqueIndex('monitor_daily_stats_monitor_id_day_uidx').on(table.monitorId, table.day),
		// Retention cleanup filters on day alone; the composite unique index above cannot serve it.
		index('monitor_daily_stats_day_idx').on(table.day),
	],
);
