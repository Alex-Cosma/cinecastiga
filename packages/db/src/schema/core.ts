import { pgSchema, text, timestamp } from "drizzle-orm/pg-core";

export const coreSchema = pgSchema("core");

/**
 * Durable per-source ingestion cursors. A crashed or banned run resumes
 * from its watermark instead of silently truncating history.
 */
export const ingestionWatermarks = coreSchema.table("ingestion_watermarks", {
  /** Source + endpoint identifier, e.g. 'elicitatie:tenders'. */
  source: text("source").primaryKey(),
  /** Opaque cursor: last page, last external id, or ISO date — fetcher-defined. */
  cursor: text("cursor").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
