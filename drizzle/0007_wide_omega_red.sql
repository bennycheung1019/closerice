CREATE TABLE `personal_review_status` (
	`review_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	PRIMARY KEY(`review_id`, `user_id`),
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_personal_review_status_user` ON `personal_review_status` (`user_id`);--> statement-breakpoint
CREATE TABLE `personal_review_tags` (
	`review_id` text NOT NULL,
	`user_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`review_id`, `user_id`, `tag_id`),
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `personal_tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_personal_review_tags_user` ON `personal_review_tags` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_personal_review_tags_tag` ON `personal_review_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `personal_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_personal_tags_collection_user_name` ON `personal_tags` (`collection_id`,`user_id`,`name`);
--> statement-breakpoint
INSERT OR IGNORE INTO `personal_tags` (`id`,`collection_id`,`user_id`,`name`,`created_at`)
SELECT lower(hex(randomblob(16))), t.collection_id, audience.user_id, t.name, t.created_at
FROM `tags` t
JOIN (
  SELECT collection_id,user_id FROM `memberships`
  UNION
  SELECT id,owner_user_id FROM `collections` WHERE owner_user_id IS NOT NULL
) audience ON audience.collection_id=t.collection_id;
--> statement-breakpoint
INSERT OR IGNORE INTO `personal_review_status` (`review_id`,`user_id`,`status`)
SELECT r.id,audience.user_id,r.status
FROM `reviews` r
JOIN (
  SELECT collection_id,user_id FROM `memberships`
  UNION
  SELECT id,owner_user_id FROM `collections` WHERE owner_user_id IS NOT NULL
) audience ON audience.collection_id=r.collection_id
WHERE r.status IN ('favorite','blacklist');
--> statement-breakpoint
INSERT OR IGNORE INTO `personal_review_tags` (`review_id`,`user_id`,`tag_id`)
SELECT rt.review_id,pt.user_id,pt.id
FROM `review_tags` rt
JOIN `tags` t ON t.id=rt.tag_id
JOIN `reviews` r ON r.id=rt.review_id AND r.collection_id=t.collection_id
JOIN `personal_tags` pt ON pt.collection_id=t.collection_id AND pt.name=t.name;
