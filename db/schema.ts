import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const reviews = sqliteTable("reviews", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  diningDate: text("dining_date").notNull(),
  restaurant: text("restaurant").notNull(),
  food: text("food").notNull(),
  comment: text("comment").notNull().default(""),
  score: integer("score"),
  channel: text("channel").notNull().default("dine_in"),
  status: text("status").notNull().default("none"),
  orderNumber: text("order_number").notNull().default(""),
  amountCents: integer("amount_cents"),
  district: text("district"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("idx_reviews_owner_date").on(table.ownerId, table.diningDate)]);

export const photos = sqliteTable("photos", {
  id: text("id").primaryKey(),
  reviewId: text("review_id").notNull().references(() => reviews.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull(),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(),
  originalName: text("original_name").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_photos_review").on(table.reviewId)]);

export const scanUsage = sqliteTable("scan_usage", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("idx_scan_usage_expires_at").on(table.expiresAt)]);
