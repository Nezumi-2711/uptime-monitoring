CREATE INDEX `checks_checked_at_idx` ON `checks` (`checked_at`);--> statement-breakpoint
CREATE INDEX `login_attempts_attempted_at_idx` ON `login_attempts` (`attempted_at`);--> statement-breakpoint
CREATE INDEX `monitor_daily_stats_day_idx` ON `monitor_daily_stats` (`day`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_created_at_idx` ON `notification_deliveries` (`created_at`);