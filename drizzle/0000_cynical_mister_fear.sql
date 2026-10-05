CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`original_name` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_photos_review` ON `photos` (`review_id`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`dining_date` text NOT NULL,
	`restaurant` text NOT NULL,
	`food` text NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`score` integer,
	`channel` text DEFAULT 'dine_in' NOT NULL,
	`status` text DEFAULT 'none' NOT NULL,
	`order_number` text DEFAULT '' NOT NULL,
	`amount_cents` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_reviews_owner_date` ON `reviews` (`owner_id`,`dining_date`);