CREATE TABLE `incident_monitors` (
	`incident_id` integer NOT NULL,
	`monitor_id` integer NOT NULL,
	PRIMARY KEY(`incident_id`, `monitor_id`),
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `incident_monitors_monitor_id_idx` ON `incident_monitors` (`monitor_id`);--> statement-breakpoint
CREATE TABLE `incident_updates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`incident_id` integer NOT NULL,
	`status` text NOT NULL,
	`body` text NOT NULL,
	`note` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `incident_updates_incident_id_created_at_idx` ON `incident_updates` (`incident_id`,`created_at`);--> statement-breakpoint
INSERT INTO `incident_monitors` (`incident_id`, `monitor_id`)
	SELECT `id`, `monitor_id` FROM `incidents`;--> statement-breakpoint
INSERT INTO `incident_updates` (`incident_id`, `status`, `body`, `source`, `created_at`)
	SELECT `id`, CASE WHEN `resolved_at` IS NULL THEN 'investigating' ELSE 'resolved' END,
		`ai_message`, 'ai', `created_at`
	FROM `incidents` WHERE `ai_message` IS NOT NULL;--> statement-breakpoint
PRAGMA defer_foreign_keys = true;--> statement-breakpoint
CREATE TABLE `__new_incidents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text,
	`status` text DEFAULT 'investigating' NOT NULL,
	`impact` text DEFAULT 'major' NOT NULL,
	`source` text DEFAULT 'auto' NOT NULL,
	`started_at` integer NOT NULL,
	`resolved_at` integer,
	`start_status_code` integer,
	`start_error` text,
	`duration_ms` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_incidents`("id", "title", "status", "impact", "source", "started_at", "resolved_at", "start_status_code", "start_error", "duration_ms", "created_at", "updated_at")
	SELECT "id", NULL, CASE WHEN "resolved_at" IS NULL THEN 'investigating' ELSE 'resolved' END,
		'major', 'auto', "started_at", "resolved_at", "start_status_code", "start_error", "duration_ms", "created_at", "updated_at"
	FROM `incidents`;--> statement-breakpoint
DROP TABLE `incidents`;--> statement-breakpoint
ALTER TABLE `__new_incidents` RENAME TO `incidents`;--> statement-breakpoint
CREATE INDEX `incidents_started_at_idx` ON `incidents` (`started_at`);--> statement-breakpoint
CREATE INDEX `incidents_resolved_at_idx` ON `incidents` (`resolved_at`);
