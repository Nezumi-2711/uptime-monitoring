ALTER TABLE `monitors` ADD `retry_count` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `monitors` ADD `failure_threshold` integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `monitors` ADD `consecutive_failures` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `monitors` SET `consecutive_failures` = `failure_threshold` WHERE `last_ok` = 0;
