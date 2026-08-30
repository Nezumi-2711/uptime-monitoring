ALTER TABLE `checks` ADD `degraded` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `monitors` ADD `expect_keyword` text;--> statement-breakpoint
ALTER TABLE `monitors` ADD `keyword_inverted` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `monitors` ADD `request_headers` text;--> statement-breakpoint
ALTER TABLE `monitors` ADD `request_body` text;--> statement-breakpoint
ALTER TABLE `monitors` ADD `degraded_latency_ms` integer;--> statement-breakpoint
ALTER TABLE `monitors` ADD `consecutive_slow` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `monitors` ADD `last_degraded` integer DEFAULT false NOT NULL;