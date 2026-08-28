CREATE TABLE `incidents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monitor_id` integer NOT NULL,
	`started_at` integer NOT NULL,
	`resolved_at` integer,
	`start_status_code` integer,
	`start_error` text,
	`duration_ms` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `incidents_monitor_id_started_at_idx` ON `incidents` (`monitor_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `monitor_daily_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monitor_id` integer NOT NULL,
	`day` integer NOT NULL,
	`total_checks` integer NOT NULL,
	`up_checks` integer NOT NULL,
	`avg_latency_ms` integer,
	`min_latency_ms` integer,
	`max_latency_ms` integer,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monitor_daily_stats_monitor_id_day_uidx` ON `monitor_daily_stats` (`monitor_id`,`day`);--> statement-breakpoint
CREATE TABLE `notification_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`webhook_url` text,
	`webhook_enabled` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `monitors` ADD `alerts_enabled` integer DEFAULT true NOT NULL;