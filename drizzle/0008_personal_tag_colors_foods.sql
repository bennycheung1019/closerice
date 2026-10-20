ALTER TABLE `personal_tags` ADD `color` text NOT NULL DEFAULT '#e8efdc';
--> statement-breakpoint
ALTER TABLE `review_opinions` ADD `selected_foods` text;
--> statement-breakpoint
CREATE TABLE `personal_tag_defaults` (
  `collection_id` text NOT NULL REFERENCES `collections`(`id`) ON DELETE cascade,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
  PRIMARY KEY (`collection_id`,`user_id`)
);
--> statement-breakpoint
INSERT OR IGNORE INTO `personal_tag_defaults` (`collection_id`,`user_id`)
SELECT collection_id,user_id FROM `memberships`
UNION SELECT id,owner_user_id FROM `collections` WHERE owner_user_id IS NOT NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO `personal_tags` (`id`,`collection_id`,`user_id`,`name`,`color`,`created_at`)
SELECT lower(hex(randomblob(16))),a.collection_id,a.user_id,'☆ 最愛','#f5c542',datetime('now')
FROM `personal_tag_defaults` a
WHERE (SELECT count(*) FROM `personal_tags` t WHERE t.collection_id=a.collection_id AND t.user_id=a.user_id)<10;
--> statement-breakpoint
INSERT OR IGNORE INTO `personal_tags` (`id`,`collection_id`,`user_id`,`name`,`color`,`created_at`)
SELECT lower(hex(randomblob(16))),a.collection_id,a.user_id,'⊘ 黑名單','#242b28',datetime('now')
FROM `personal_tag_defaults` a
WHERE (SELECT count(*) FROM `personal_tags` t WHERE t.collection_id=a.collection_id AND t.user_id=a.user_id)<10;
--> statement-breakpoint
INSERT OR IGNORE INTO `personal_review_tags` (`review_id`,`user_id`,`tag_id`)
SELECT s.review_id,s.user_id,t.id
FROM `personal_review_status` s
JOIN `reviews` r ON r.id=s.review_id
JOIN `personal_tags` t ON t.collection_id=r.collection_id AND t.user_id=s.user_id
  AND t.name=CASE s.status WHEN 'favorite' THEN '☆ 最愛' WHEN 'blacklist' THEN '⊘ 黑名單' END
WHERE s.status IN ('favorite','blacklist');
