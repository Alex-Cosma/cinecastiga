import { eq, sql } from "drizzle-orm";
import { rawDocuments, scrapeRuns, type Db } from "@seap/db";
import { contentHash } from "./hash.js";
import { redactPayload } from "./redact.js";

/**
 * The single chokepoint between fetch and archive: every payload is
 * redacted (DEC-006), hashed on its post-redaction canonical form, and
 * inserted idempotently. No scrape code writes raw_documents directly.
 */

export interface ArchivableDocument {
  /** SourceSystem value, e.g. 'elicitatie'. */
  source: string;
  /** Family-namespaced id: 'tender:123', 'da:987' — families share one source. */
  externalId: string;
  /** Parser selector, e.g. 'tender-detail:v1'. */
  endpointVersion: string;
  payload: unknown;
}

export interface ArchiveResult {
  inserted: number;
  skipped: number;
}

/** Accepts a db or transaction handle — archiving joins the caller's tx. */
type InsertCapable = Pick<Db, "insert">;

/**
 * Postgres text/jsonb cannot store a NUL (U+0000) — it aborts the whole
 * statement ("unsupported Unicode escape sequence"). SICAP occasionally emits
 * one inside a free-text field (supplier/description), which used to poison an
 * entire insert chunk and, on a resumed authority scrape, deterministically
 * halt the crawler. JSON.stringify encodes NUL as the six-char escape
 * "backslash-u-0000", so we strip it on the serialized form and reparse. Only
 * NUL is illegal to Postgres; every other control escape jsonb accepts, so we
 * leave them intact.
 */
function stripNul<T>(value: T): T {
  const json = JSON.stringify(value);
  if (json === undefined || !json.includes("\\u0000")) return value;
  return JSON.parse(json.replace(/\\u0000/g, "")) as T;
}

export async function archiveDocuments(
  db: InsertCapable,
  docs: ArchivableDocument[],
): Promise<ArchiveResult> {
  if (docs.length === 0) return { inserted: 0, skipped: 0 };

  const rows = docs.map((doc) => {
    const redacted = stripNul(redactPayload(doc.payload, doc.endpointVersion));
    return {
      source: doc.source,
      externalId: doc.externalId,
      endpointVersion: doc.endpointVersion,
      contentHash: contentHash(redacted),
      payload: redacted,
    };
  });

  // Chunk the multi-row insert: one DA authority can carry thousands of docs,
  // and Postgres caps a statement at 65535 bind parameters (~5 cols/row). Insert
  // in safe batches so a big authority can't blow the parameter limit.
  const CHUNK = 1000;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const insertedRows = await db
      .insert(rawDocuments)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoNothing({
        target: [
          rawDocuments.source,
          rawDocuments.externalId,
          rawDocuments.contentHash,
        ],
      })
      .returning({ id: rawDocuments.id });
    inserted += insertedRows.length;
  }

  return {
    inserted,
    skipped: rows.length - inserted,
  };
}

export interface ScrapeRunWindow {
  source: string;
  windowStart: Date;
  windowEnd: Date;
}

export async function startScrapeRun(
  db: Db,
  run: ScrapeRunWindow,
): Promise<bigint> {
  const [row] = await db
    .insert(scrapeRuns)
    .values({
      source: run.source,
      windowStart: run.windowStart,
      windowEnd: run.windowEnd,
      status: "running",
    })
    .returning({ id: scrapeRuns.id });
  return row!.id;
}

export interface ScrapeRunOutcome {
  status: "completed" | "failed";
  /** Null when the source count wasn't trustworthy (searchTooLong). */
  reportedTotal: number | null;
  fetchedCount: number;
  insertedCount: number;
  skippedCount: number;
  pagesFetched: number;
  error?: string;
}

export async function finishScrapeRun(
  db: Db,
  id: bigint,
  outcome: ScrapeRunOutcome,
): Promise<void> {
  await db
    .update(scrapeRuns)
    .set({
      status: outcome.status,
      reportedTotal: outcome.reportedTotal,
      fetchedCount: outcome.fetchedCount,
      insertedCount: outcome.insertedCount,
      skippedCount: outcome.skippedCount,
      pagesFetched: outcome.pagesFetched,
      deviation:
        outcome.reportedTotal === null
          ? null
          : outcome.reportedTotal - outcome.fetchedCount,
      error: outcome.error ?? null,
      finishedAt: sql`now()`,
    })
    .where(eq(scrapeRuns.id, id));
}
