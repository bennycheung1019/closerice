CREATE TABLE `users` (`id` text PRIMARY KEY NOT NULL, `google_subject` text NOT NULL UNIQUE, `email` text NOT NULL, `name` text NOT NULL DEFAULT '', `created_at` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `collections` (`id` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `owner_user_id` text REFERENCES `users`(`id`), `created_at` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `memberships` (`collection_id` text NOT NULL REFERENCES `collections`(`id`) ON DELETE CASCADE, `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE, `role` text NOT NULL CHECK (`role` IN ('editor','viewer')), `created_at` text NOT NULL, PRIMARY KEY (`collection_id`,`user_id`));
--> statement-breakpoint
CREATE INDEX `idx_memberships_user` ON `memberships` (`user_id`);
--> statement-breakpoint
CREATE TABLE `sessions` (`token_hash` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE, `expires_at` integer NOT NULL);
--> statement-breakpoint
CREATE TABLE `invites` (`id` text PRIMARY KEY NOT NULL, `collection_id` text NOT NULL REFERENCES `collections`(`id`) ON DELETE CASCADE, `email` text NOT NULL, `role` text NOT NULL CHECK (`role` IN ('editor','viewer')), `token_hash` text NOT NULL UNIQUE, `expires_at` integer NOT NULL, `accepted_at` integer, `created_at` text NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_invites_collection` ON `invites` (`collection_id`);
--> statement-breakpoint
CREATE TABLE `ownership_transfers` (`collection_id` text PRIMARY KEY NOT NULL REFERENCES `collections`(`id`) ON DELETE CASCADE, `from_user_id` text NOT NULL REFERENCES `users`(`id`), `to_user_id` text NOT NULL REFERENCES `users`(`id`), `expires_at` integer NOT NULL);
--> statement-breakpoint
INSERT INTO `collections` (`id`,`name`,`created_at`) VALUES ('legacy-home','Home',datetime('now'));
--> statement-breakpoint
ALTER TABLE `reviews` ADD `collection_id` text REFERENCES `collections`(`id`);
--> statement-breakpoint
ALTER TABLE `reviews` ADD `created_by` text REFERENCES `users`(`id`);
--> statement-breakpoint
UPDATE `reviews` SET `collection_id` = 'legacy-home';
--> statement-breakpoint
CREATE INDEX `idx_reviews_collection_date` ON `reviews` (`collection_id`,`dining_date`);
--> statement-breakpoint
ALTER TABLE `photos` ADD `collection_id` text REFERENCES `collections`(`id`);
--> statement-breakpoint
UPDATE `photos` SET `collection_id` = 'legacy-home';
--> statement-breakpoint
CREATE INDEX `idx_photos_collection` ON `photos` (`collection_id`);
--> statement-breakpoint
CREATE TABLE `tags` (`id` text PRIMARY KEY NOT NULL, `collection_id` text NOT NULL REFERENCES `collections`(`id`) ON DELETE CASCADE, `name` text NOT NULL, `created_by` text NOT NULL REFERENCES `users`(`id`), `created_at` text NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tags_collection_name` ON `tags` (`collection_id`,`name`);
--> statement-breakpoint
CREATE TABLE `review_tags` (`review_id` text NOT NULL REFERENCES `reviews`(`id`) ON DELETE CASCADE, `tag_id` text NOT NULL REFERENCES `tags`(`id`) ON DELETE CASCADE, PRIMARY KEY (`review_id`,`tag_id`));
--> statement-breakpoint
CREATE INDEX `idx_review_tags_tag` ON `review_tags` (`tag_id`);
