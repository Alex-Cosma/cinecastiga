import { sql } from "drizzle-orm";
import { check, index, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { appSchema } from "./app.js";

/** Anonymous submissions, visible only to admins. No account or network identity. */
export const feedback = appSchema.table("feedback", {
  id: uuid("id").primaryKey(),
  category: text("category").notNull(),
  message: text("message").notNull(),
  sourcePath: text("source_path"),
  createdAt: timestamp("created_at", { withTimezone:true }).notNull().defaultNow(),
}, t => [index("feedback_created_idx").on(t.createdAt, t.id),
  check("feedback_category_check", sql`${t.category} in ('data','bug','idea','other')`),
  check("feedback_message_check", sql`length(${t.message}) between 20 and 3000`),
  check("feedback_path_check", sql`${t.sourcePath} is null or (length(${t.sourcePath}) <= 400 and ${t.sourcePath} like '/%')`)]);

/** Short-lived HMAC buckets, separate from reports; no link to individual messages. */
export const feedbackLimits = appSchema.table("feedback_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone:true }).notNull(),
}, t => [index("feedback_limits_expiry_idx").on(t.expiresAt)]);
