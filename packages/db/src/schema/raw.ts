import {
  bigserial,
  index,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const rawSchema = pgSchema("raw");

/**
 * Bronze layer: append-only archive of every fetched response, stored
 * BEFORE any parsing. Normalization is a replayable transform over this
 * table — reprocessing must never require re-scraping.
 */
export const rawDocuments = rawSchema.table(
  "raw_documents",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    /** Source system: 'elicitatie' | 'datagov'. */
    source: text("source").notNull(),
    /** Identifier of the record in the source system. */
    externalId: text("external_id").notNull(),
    /** Which endpoint/shape produced this payload — parser selection on replay. */
    endpointVersion: text("endpoint_version").notNull(),
    /** SHA-256 of the canonical payload bytes — idempotent re-ingestion. */
    contentHash: text("content_hash").notNull(),
    payload: jsonb("payload").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("raw_documents_source_ext_hash_uq").on(
      t.source,
      t.externalId,
      t.contentHash,
    ),
    index("raw_documents_source_fetched_idx").on(t.source, t.fetchedAt),
  ],
);
