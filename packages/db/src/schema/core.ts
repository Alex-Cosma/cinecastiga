import {
  bigserial,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

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

/**
 * One row per scrape run: the reconciliation record that makes silent
 * ingestion gaps visible. `deviation` = reportedTotal - fetchedCount;
 * reportedTotal is null when the source count wasn't trustworthy
 * (searchTooLong) — a run with null reportedTotal is itself a signal.
 */
export const scrapeRuns = coreSchema.table(
  "scrape_runs",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    /** Same key convention as watermarks, e.g. 'elicitatie:tenders'. */
    source: text("source").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    windowStart: timestamp("window_start", { withTimezone: true }),
    windowEnd: timestamp("window_end", { withTimezone: true }),
    /** running | completed | failed */
    status: text("status").notNull(),
    reportedTotal: integer("reported_total"),
    fetchedCount: integer("fetched_count").notNull().default(0),
    insertedCount: integer("inserted_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    pagesFetched: integer("pages_fetched").notNull().default(0),
    deviation: integer("deviation"),
    error: text("error"),
  },
  (t) => [index("scrape_runs_source_started_idx").on(t.source, t.startedAt)],
);
