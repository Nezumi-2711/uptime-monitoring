CREATE TABLE `checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monitor_id` integer NOT NULL,
	`ok` integer NOT NULL,
	`status_code` integer,
	`latency_ms` integer,
	`error` text,
	`checked_at` integer NOT NULL,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checks_monitor_id_checked_at_idx` ON `checks` (`monitor_id`,`checked_at`);--> statement-breakpoint
CREATE TABLE `monitors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`method` text DEFAULT 'GET' NOT NULL,
	`expected_status` integer DEFAULT 200 NOT NULL,
	`interval_seconds` integer DEFAULT 300 NOT NULL,
	`timeout_ms` integer DEFAULT 10000 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_ok` integer,
	`last_status_code` integer,
	`last_latency_ms` integer,
	`last_error` text,
	`last_checked_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `monitors_enabled_last_checked_at_idx` ON `monitors` (`enabled`,`last_checked_at`);