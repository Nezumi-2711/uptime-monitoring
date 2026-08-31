CREATE TABLE `ai_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`incident_id` integer,
	`monitor_id` integer,
	`model` text,
	`outcome` text NOT NULL,
	`reason` text,
	`latency_ms` integer,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`context_preview` text,
	`output_preview` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ai_events_created_at_idx` ON `ai_events` (`created_at`);--> statement-breakpoint
ALTER TABLE `ai_settings` ADD `autopilot_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_settings` ADD `autopilot_followup_minutes` integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_settings` ADD `autopilot_max_updates` integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_settings` ADD `autopilot_advance_status` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_settings` ADD `autopilot_degraded_incidents` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `incidents` ADD `kind` text DEFAULT 'down' NOT NULL;