import { sql } from "drizzle-orm";
import type { Task } from "graphile-worker";
import { getDirectAcquisitionDetail } from "@seap/scraper-clients";
import {
  archiveDocuments,
  finishScrapeRun,
  startScrapeRun,
} from "../archive.js";
import type { ScrapeDeps } from "./notices.js";

const SOURCE = "elicitatie:da-corrections";

/**
 * DA corrections mutate detail payloads after finalization and never
 * re-surface in list queries (no modified-date filter exists — DEC-003).
 * Re-fetch details still flagged open-for-correction until they close;
 * a changed payload lands as a new content-hash version row.
 */
export async function refetchOpenCorrections(
  deps: ScrapeDeps,
  opts: { days?: number } = {},
): Promise<{ candidates: number; inserted: number }> {
  const { db, client } = deps;
  const days = opts.days ?? 30;

  const runId = await startScrapeRun(db, {
    source: SOURCE,
    windowStart: new Date(Date.now() - days * 86_400_000),
    windowEnd: new Date(),
  });

  // Latest da-detail row per DA in the trailing window, flag still open
  const rows = (await db.execute(sql`
    select distinct on (external_id) external_id
    from raw.raw_documents
    where source = 'elicitatie'
      and endpoint_version = 'da-detail:v1'
      and fetched_at > now() - make_interval(days => ${days})
      and (
        payload->>'isOpenForCorrection' = 'true'
        or payload->>'isOpenForContractCorrection' = 'true'
      )
    order by external_id, fetched_at desc
  `)) as Array<{ external_id: string }>;

  let inserted = 0;
  let fetched = 0;

  try {
    for (const row of rows) {
      const id = Number(row.external_id.replace("da:", ""));
      if (!Number.isFinite(id)) continue;
      const detail = await getDirectAcquisitionDetail(client, id);
      fetched += 1;
      const result = await archiveDocuments(db, [
        {
          source: "elicitatie",
          externalId: row.external_id,
          endpointVersion: "da-detail:v1",
          payload: detail.data,
        },
      ]);
      inserted += result.inserted;
    }
  } catch (err) {
    await finishScrapeRun(db, runId, {
      status: "failed",
      reportedTotal: null,
      fetchedCount: fetched,
      insertedCount: inserted,
      skippedCount: fetched - inserted,
      pagesFetched: 0,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  await finishScrapeRun(db, runId, {
    status: "completed",
    reportedTotal: rows.length,
    fetchedCount: fetched,
    insertedCount: inserted,
    skippedCount: fetched - inserted,
    pagesFetched: 0,
  });
  return { candidates: rows.length, inserted };
}

export function makeDaCorrectionsTask(deps: ScrapeDeps): Task {
  return async (_payload, helpers) => {
    const result = await refetchOpenCorrections(deps);
    helpers.logger.info(
      `da-corrections: ${result.candidates} candidates, ${result.inserted} changed`,
    );
  };
}
