import { eq } from "drizzle-orm";
import { ingestionWatermarks, type Db } from "@seap/db";
import type { IsoDate } from "./window.js";

/**
 * Durable per-source cursors. The cursor advances ONLY in the same
 * transaction as the page's raw_documents inserts — that transaction is
 * what makes "resume without gaps" literally true.
 */

export interface ScrapeCursor {
  /** Window start day this cursor belongs to. */
  windowStart: IsoDate;
  /** Last day fully or partially processed. */
  day: IsoDate;
  /** Next page index to fetch within `day` (and `slice`, when sliced). */
  page: number;
  /** DA slicing position (sliceKey), absent for unsliced sources. */
  slice?: string;
}

/** Anything drizzle-shaped that can run the upsert (db or tx handle). */
type DbLike = Pick<Db, "insert">;

export async function readWatermark(
  db: Db,
  source: string,
): Promise<ScrapeCursor | null> {
  const [row] = await db
    .select()
    .from(ingestionWatermarks)
    .where(eq(ingestionWatermarks.source, source));
  if (!row) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.cursor);
  } catch {
    throw new Error(
      `Corrupt watermark cursor for ${source}: ${row.cursor.slice(0, 100)}`,
    );
  }
  const cursor = parsed as Partial<ScrapeCursor>;
  if (
    typeof cursor.windowStart !== "string" ||
    typeof cursor.day !== "string" ||
    typeof cursor.page !== "number" ||
    (cursor.slice !== undefined && typeof cursor.slice !== "string")
  ) {
    throw new Error(`Malformed watermark cursor for ${source}`);
  }
  return {
    windowStart: cursor.windowStart,
    day: cursor.day,
    page: cursor.page,
    ...(cursor.slice !== undefined ? { slice: cursor.slice } : {}),
  };
}

export async function writeWatermark(
  db: DbLike,
  source: string,
  cursor: ScrapeCursor,
): Promise<void> {
  await db
    .insert(ingestionWatermarks)
    .values({ source, cursor: JSON.stringify(cursor) })
    .onConflictDoUpdate({
      target: ingestionWatermarks.source,
      set: { cursor: JSON.stringify(cursor), updatedAt: new Date() },
    });
}
