import { bigint, index, jsonb, text, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { coreSchema, entities } from "./core.js";

/** Verified corrections, never fuzzy suggestions. Old entity rows are retained
 * so immutable evidence remains readable. The repair must prohibit chains and
 * retain the proof + previous identity before removing fabricated SICAP keys. */
export const entityRedirects = coreSchema.table("entity_redirects", {
  oldId: bigint("old_id", { mode: "bigint" }).primaryKey().references(() => entities.id),
  canonicalId: bigint("canonical_id", { mode: "bigint" }).notNull().references(() => entities.id),
  reason: text("reason").notNull(),
  evidence: jsonb("evidence").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("entity_redirects_canonical_idx").on(t.canonicalId), check("entity_redirects_not_self", sql`${t.oldId} <> ${t.canonicalId}`)]);
