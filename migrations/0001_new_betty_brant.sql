PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP TABLE `sessions`;--> statement-breakpoint
DROP TABLE `login_attempts`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
CREATE TABLE `admin_credentials` (
	`id` integer PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`user_agent` text
);
--> statement-breakpoint
CREATE INDEX `sessions_expires_at_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ip_address` text NOT NULL,
	`attempted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_attempts_ip_attempted_at_idx` ON `login_attempts` (`ip_address`,`attempted_at`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
