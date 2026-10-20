CREATE TABLE `admin_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_admin_audit_created` ON `admin_audit` (`created_at`);--> statement-breakpoint
CREATE TABLE `site_admins` (
	`user_id` text PRIMARY KEY NOT NULL,
	`granted_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `site_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `users` ADD `disabled_at` integer;--> statement-breakpoint
INSERT INTO `site_admins` (`user_id`, `granted_at`)
SELECT `id`, datetime('now') FROM `users`
WHERE lower(`email`) = 'daydreamer10191980@gmail.com' AND `google_subject` <> ''
LIMIT 1;--> statement-breakpoint
INSERT INTO `site_settings` (`key`, `value`) VALUES
('registration_enabled', 'true'),
('new_groups_enabled', 'true');
