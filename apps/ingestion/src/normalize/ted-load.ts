import { eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { awardLinks, tedLotResults, tedLotWinners } from "@seap/db";
import type { CoreDb } from "./context.js";

const BATCH = 250;
const columns = getTableColumns(tedLotResults);
const update = Object.fromEntries(Object.entries(columns)
  .filter(([key]) => !["id", "tedNoticeId", "lotId"].includes(key))
  .map(([key, column]) => [key, sql.raw(`excluded."${column.name}"`)]));

/** Caller owns the per-notice transaction. Stable source identities survive replay. */
export async function replaceTedLots(tx: CoreDb, noticeId: bigint,
  values: (typeof tedLotResults.$inferInsert)[],
  options: { existing?: { id: bigint; lotId: string }[]; preserveWinnerEdges?: boolean } = {}): Promise<Map<string, bigint>> {
  const existing = options.existing ?? await tx.select({ id: tedLotResults.id, lotId: tedLotResults.lotId })
    .from(tedLotResults).where(eq(tedLotResults.tedNoticeId, noticeId));
  const retained = new Set(values.map((v) => v.lotId));
  for (let i = 0; i < existing.length; i += BATCH) {
    const chunk = existing.slice(i, i + BATCH);
    // ted_notice_id on award_links has no index. Its lot-result FK does: use it
    // directly, avoiding a multi-million-row scan for every replayed notice.
    await tx.delete(awardLinks).where(inArray(awardLinks.tedLotResultId, chunk.map((r) => r.id)));
    const stale = chunk.filter((r) => !retained.has(r.lotId));
    if (stale.length) await tx.delete(tedLotResults).where(inArray(tedLotResults.id, stale.map((r) => r.id)));
  }
  const ids = new Map<string, bigint>();
  for (let i = 0; i < values.length; i += BATCH) {
    const rows = await tx.insert(tedLotResults).values(values.slice(i, i + BATCH))
      .onConflictDoUpdate({ target: [tedLotResults.tedNoticeId, tedLotResults.lotId], set: update })
      .returning({ id: tedLotResults.id, lotId: tedLotResults.lotId });
    for (const r of rows) ids.set(r.lotId, r.id);
    if (!options.preserveWinnerEdges) {
      await tx.delete(tedLotWinners).where(inArray(tedLotWinners.lotResultId, rows.map((r) => r.id)));
    }
  }
  return ids;
}

/** Fast replay is permitted only for the exact same set of unique source lots. */
export function sameTedLotIdentities(existing: string[], incoming: string[]): boolean {
  const old = new Set(existing), next = new Set(incoming);
  return old.size === existing.length && next.size === incoming.length && old.size === next.size
    && [...old].every((id) => next.has(id));
}

/** F03 winner parsing is unchanged. Preserve those existing edges on exact replay. */
export async function tryReplaceTedAmounts(tx: CoreDb, noticeId: bigint,
  values: (typeof tedLotResults.$inferInsert)[], verifyDates = false): Promise<boolean> {
  const existing = await tx.select({ id: tedLotResults.id, lotId: tedLotResults.lotId, contractDate: tedLotResults.contractDate })
    .from(tedLotResults).where(eq(tedLotResults.tedNoticeId, noticeId));
  if (!sameTedLotIdentities(existing.map((r) => r.lotId), values.map((r) => r.lotId))) return false;
  if (verifyDates) {
    const dates = new Map(values.map((v) => [v.lotId, v.contractDate?.getTime() ?? null]));
    if (existing.some((r) => (r.contractDate?.getTime() ?? null) !== dates.get(r.lotId))) return false;
  }
  await replaceTedLots(tx, noticeId, values, { existing, preserveWinnerEdges: true });
  return true;
}

export async function insertTedWinners(tx: CoreDb, values: (typeof tedLotWinners.$inferInsert)[]) {
  for (let i = 0; i < values.length; i += BATCH) {
    await tx.insert(tedLotWinners).values(values.slice(i, i + BATCH)).onConflictDoNothing();
  }
}
