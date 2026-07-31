import { boolean, index, jsonb, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authUsers } from "./auth.js";

/**
 * Application-feature tables (watchdog investigations). Isolated in the `app`
 * Postgres schema: written by the web app only, never touched by ingestion
 * rebuilds. Clips reference platform objects by their STABLE keys (entity id,
 * SICAP contract id, person key) and additionally carry an immutable snapshot
 * of what the data showed at clip time — the reference keeps the clip alive,
 * the snapshot keeps the evidence honest.
 */
export const appSchema = pgSchema("app");

export const investigations = appSchema.table(
  "investigations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("activa"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("investigations_owner_idx").on(t.ownerUserId)],
);

export const clips = appSchema.table(
  "clips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    investigationId: uuid("investigation_id")
      .notNull()
      .references(() => investigations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // entity | contract | notice | person | query | flag | note
    refId: text("ref_id"),
    spec: jsonb("spec"),
    snapshot: jsonb("snapshot"),
    note: text("note"),
    pinned: boolean("pinned").notNull().default(false),
    createdBy: text("created_by")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("clips_investigation_idx").on(t.investigationId, t.createdAt)],
);
