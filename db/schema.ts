import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  googleSubject: text("google_subject").notNull().unique(),
  email: text("email").notNull(),
  name: text("name").notNull().default(""),
  displayName: text("display_name"),
  pictureUrl: text("picture_url"),
  createdAt: text("created_at").notNull(),
});

export const collections = sqliteTable("collections", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerUserId: text("owner_user_id").references(() => users.id),
  createdAt: text("created_at").notNull(),
});

export const memberships = sqliteTable("memberships", {
  collectionId: text("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.collectionId, table.userId] }), index("idx_memberships_user").on(table.userId)]);

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
});

export const invites = sqliteTable("invites", {
  id: text("id").primaryKey(),
  collectionId: text("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at").notNull(),
  acceptedAt: integer("accepted_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_invites_collection").on(table.collectionId)]);

export const ownershipTransfers = sqliteTable("ownership_transfers", {
  collectionId: text("collection_id").primaryKey().references(() => collections.id, { onDelete: "cascade" }),
  fromUserId: text("from_user_id").notNull().references(() => users.id),
  toUserId: text("to_user_id").notNull().references(() => users.id),
  expiresAt: integer("expires_at").notNull(),
});

export const reviews = sqliteTable("reviews", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  collectionId: text("collection_id").references(() => collections.id),
  createdBy: text("created_by").references(() => users.id),
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
}, (table) => [index("idx_reviews_owner_date").on(table.ownerId, table.diningDate), index("idx_reviews_collection_date").on(table.collectionId, table.diningDate)]);

export const reviewOpinions = sqliteTable("review_opinions", {
  id: text("id").primaryKey(),
  reviewId: text("review_id").notNull().references(() => reviews.id, { onDelete: "cascade" }),
  authorId: text("author_id").references(() => users.id),
  comment: text("comment").notNull().default(""),
  score: integer("score"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("idx_review_opinions_review").on(table.reviewId), uniqueIndex("idx_review_opinions_author").on(table.reviewId, table.authorId)]);

export const photos = sqliteTable("photos", {
  id: text("id").primaryKey(),
  reviewId: text("review_id").notNull().references(() => reviews.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull(),
  collectionId: text("collection_id").references(() => collections.id),
  objectKey: text("object_key").notNull(),
  dataBase64: text("data_base64"),
  contentType: text("content_type").notNull(),
  originalName: text("original_name").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_photos_review").on(table.reviewId), index("idx_photos_collection").on(table.collectionId)]);

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  collectionId: text("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("idx_tags_collection_name").on(table.collectionId, table.name)]);

export const reviewTags = sqliteTable("review_tags", {
  reviewId: text("review_id").notNull().references(() => reviews.id, { onDelete: "cascade" }),
  tagId: text("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
}, (table) => [primaryKey({ columns: [table.reviewId, table.tagId] }), index("idx_review_tags_tag").on(table.tagId)]);

export const scanUsage = sqliteTable("scan_usage", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("idx_scan_usage_expires_at").on(table.expiresAt)]);
