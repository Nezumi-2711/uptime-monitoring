CREATE TABLE `notification_channel_monitors` (
	`channel_id` integer NOT NULL,
	`monitor_id` integer NOT NULL,
	PRIMARY KEY(`channel_id`, `monitor_id`),
	FOREIGN KEY (`channel_id`) REFERENCES `notification_channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_channel_monitors_monitor_id_idx` ON `notification_channel_monitors` (`monitor_id`);--> statement-breakpoint
CREATE TABLE `notification_channels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`config` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`notify_manual` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notification_channels_enabled_idx` ON `notification_channels` (`enabled`);--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_id` integer NOT NULL,
	`incident_id` integer,
	`monitor_id` integer,
	`event` text NOT NULL,
	`ok` integer NOT NULL,
	`status_code` integer,
	`error` text,
	`attempts` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `notification_channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_deliveries_channel_id_created_at_idx` ON `notification_deliveries` (`channel_id`,`created_at`);--> statement-breakpoint
INSERT INTO `notification_channels` (`name`, `type`, `config`, `enabled`, `notify_manual`, `created_at`, `updated_at`)
SELECT 'Legacy webhook', 'webhook', json_object('url', `webhook_url`), `webhook_enabled`, 1, `created_at`, `updated_at`
FROM `notification_settings`
WHERE `webhook_url` IS NOT NULL;--> statement-breakpoint
DROP TABLE `notification_settings`;
