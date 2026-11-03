CREATE TABLE `restaurant_branches` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`name` text NOT NULL,
	`district` text DEFAULT '' NOT NULL,
	`region` text DEFAULT '香港' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`cover_photo_url` text DEFAULT '' NOT NULL,
	`cover_source_url` text DEFAULT '' NOT NULL,
	`cover_attribution` text DEFAULT '' NOT NULL,
	`cover_license` text DEFAULT '' NOT NULL,
	`cover_usage` text DEFAULT 'missing' NOT NULL,
	`review_state` text DEFAULT 'pending' NOT NULL,
	`review_notes` text DEFAULT '' NOT NULL,
	`checked_at` text,
	`manual_lock` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_restaurant_branches_identity` ON `restaurant_branches` (`collection_id`,`name`,`district`);--> statement-breakpoint
CREATE INDEX `idx_restaurant_branches_pending` ON `restaurant_branches` (`review_state`,`checked_at`);--> statement-breakpoint
ALTER TABLE `reviews` ADD `restaurant_id` text REFERENCES restaurant_branches(id);
--> statement-breakpoint
-- Exact name + district within one collection only. Keep every review/photo ID intact.
INSERT INTO restaurant_branches (id,collection_id,name,district,created_at,updated_at)
SELECT lower(hex(randomblob(16))),collection_id,trim(restaurant),coalesce(district,''),min(created_at),max(updated_at)
FROM reviews WHERE collection_id IS NOT NULL
GROUP BY collection_id,trim(restaurant),coalesce(district,'');
--> statement-breakpoint
UPDATE reviews SET restaurant_id=(
  SELECT b.id FROM restaurant_branches b WHERE b.collection_id=reviews.collection_id
    AND b.name=trim(reviews.restaurant) AND b.district=coalesce(reviews.district,'')
) WHERE collection_id IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER reviews_branch_collection_insert BEFORE INSERT ON reviews
WHEN NEW.restaurant_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM restaurant_branches b WHERE b.id=NEW.restaurant_id AND b.collection_id=NEW.collection_id
)
BEGIN SELECT RAISE(ABORT,'restaurant branch belongs to a different collection'); END;
--> statement-breakpoint
CREATE TRIGGER reviews_branch_collection_update BEFORE UPDATE OF restaurant_id,collection_id ON reviews
WHEN NEW.restaurant_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM restaurant_branches b WHERE b.id=NEW.restaurant_id AND b.collection_id=NEW.collection_id
)
BEGIN SELECT RAISE(ABORT,'restaurant branch belongs to a different collection'); END;
--> statement-breakpoint
-- Keep writes from the previous Worker version linked during a rolling release.
CREATE TRIGGER reviews_branch_legacy_insert AFTER INSERT ON reviews
WHEN NEW.collection_id IS NOT NULL AND NEW.restaurant_id IS NULL
BEGIN
 INSERT OR IGNORE INTO restaurant_branches (id,collection_id,name,district,created_at,updated_at)
 VALUES (lower(hex(randomblob(16))),NEW.collection_id,trim(NEW.restaurant),coalesce(NEW.district,''),NEW.created_at,NEW.updated_at);
 UPDATE reviews SET restaurant_id=(SELECT id FROM restaurant_branches WHERE collection_id=NEW.collection_id AND name=trim(NEW.restaurant) AND district=coalesce(NEW.district,'')) WHERE id=NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER reviews_branch_legacy_update AFTER UPDATE OF restaurant,district ON reviews
WHEN NEW.collection_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM restaurant_branches WHERE id=NEW.restaurant_id AND collection_id=NEW.collection_id AND name=trim(NEW.restaurant) AND district=coalesce(NEW.district,'')
)
BEGIN
 INSERT OR IGNORE INTO restaurant_branches (id,collection_id,name,district,created_at,updated_at)
 VALUES (lower(hex(randomblob(16))),NEW.collection_id,trim(NEW.restaurant),coalesce(NEW.district,''),NEW.created_at,NEW.updated_at);
 UPDATE reviews SET restaurant_id=(SELECT id FROM restaurant_branches WHERE collection_id=NEW.collection_id AND name=trim(NEW.restaurant) AND district=coalesce(NEW.district,'')) WHERE id=NEW.id;
END;
