CREATE TABLE `scan_usage` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_scan_usage_expires_at` ON `scan_usage` (`expires_at`);--> statement-breakpoint
ALTER TABLE `reviews` ADD `district` text;