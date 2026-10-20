CREATE TABLE `review_opinions` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`author_id` text,
	`comment` text DEFAULT '' NOT NULL,
	`score` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_review_opinions_review` ON `review_opinions` (`review_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_review_opinions_author` ON `review_opinions` (`review_id`,`author_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `picture_url` text;
--> statement-breakpoint
UPDATE `reviews` SET `created_by` = (SELECT `owner_user_id` FROM `collections` WHERE `collections`.`id` = `reviews`.`collection_id`) WHERE `created_by` IS NULL AND `collection_id` = 'legacy-home' AND EXISTS (SELECT 1 FROM `collections` WHERE `collections`.`id` = 'legacy-home' AND `owner_user_id` IS NOT NULL);
--> statement-breakpoint
INSERT INTO `review_opinions` (`id`,`review_id`,`author_id`,`comment`,`score`,`created_at`,`updated_at`) SELECT lower(hex(randomblob(16))),`id`,`created_by`,`comment`,`score`,`created_at`,`updated_at` FROM `reviews` WHERE trim(`comment`) <> '' OR `score` IS NOT NULL;
