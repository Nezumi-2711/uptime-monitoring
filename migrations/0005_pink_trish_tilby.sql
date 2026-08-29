CREATE TABLE `maintenance_window_monitors` (
	`window_id` integer NOT NULL,
	`monitor_id` integer NOT NULL,
	PRIMARY KEY(`window_id`, `monitor_id`),
	FOREIGN KEY (`window_id`) REFERENCES `maintenance_windows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `maintenance_window_monitors_monitor_id_idx` ON `maintenance_window_monitors` (`monitor_id`);--> statement-breakpoint
CREATE TABLE `maintenance_windows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`start_minute` integer NOT NULL,
	`duration_minutes` integer NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `maintenance_windows_enabled_idx` ON `maintenance_windows` (`enabled`);--> statement-breakpoint
ALTER TABLE `checks` ADD `maintenance` integer DEFAULT false NOT NULL;