import { sql } from "drizzle-orm";
import { check, date, index, integer, jsonb, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { appSchema } from "./app.js";
import { authUsers } from "./auth.js";

/** A recipient/day outbox. Ambiguous SMTP outcomes are never retried automatically. */
export const monitoringDigestDeliveries = appSchema.table("monitoring_digest_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: text("owner_user_id").notNull().references(() => authUsers.id, { onDelete:"cascade" }),
  recipientEmail: text("recipient_email").notNull(),
  period: date("period").notNull(),
  status: text("status").notNull().default("queued"),
  runIds: jsonb("run_ids").notNull(),
  updateCount: integer("update_count").notNull(),
  messageId: text("message_id"),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone:true }),
  sentAt: timestamp("sent_at", { withTimezone:true }),
  createdAt: timestamp("created_at", { withTimezone:true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone:true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("monitoring_digest_owner_period_uq").on(t.ownerUserId,t.period),
  index("monitoring_digest_status_updated_idx").on(t.status,t.updatedAt),
  check("monitoring_digest_status_check",sql`${t.status} in ('queued','sending','sent','failed','uncertain','cancelled')`),
  check("monitoring_digest_count_check",sql`${t.updateCount} >= 0`),
]);
