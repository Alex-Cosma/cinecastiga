import { and, desc, eq, inArray } from "drizzle-orm";
import type { Task } from "graphile-worker";
import { rawDocuments } from "@seap/db";
import {
  getNoticeContracts,
  getNoticeDetail,
  listNotices,
  NOTICE_TYPE_IDS,
  type NoticeListItem,
} from "@seap/scraper-clients";
import {
  archiveDocuments,
  finishScrapeRun,
  startScrapeRun,
  type ArchivableDocument,
} from "../archive.js";
import { closedWindow, eachDay } from "../window.js";
import type { ScrapeDeps } from "./notices.js";

const SOURCE = "elicitatie:state-rescan";

/**
 * Notice state changes (suspension, cancellation, award) mutate
 * sysNoticeState/noticeStateDate WITHOUT changing publicationDate, so the
 * incremental publication cursor never re-surfaces them (DEC-003). This
 * job re-lists a trailing publication window (cheap: list-only) and
 * re-fetches details only where noticeStateDate moved.
 */
export async function rescanNoticeStates(
  deps: ScrapeDeps,
  opts: { days?: number } = {},
): Promise<{ checked: number; changed: number }> {
  const { db, client } = deps;
  const window = closedWindow(opts.days ?? 45);

  const runId = await startScrapeRun(db, {
    source: SOURCE,
    windowStart: new Date(`${window.start}T00:00:00+03:00`),
    windowEnd: new Date(`${window.end}T23:59:59+03:00`),
  });

  let checked = 0;
  let changed = 0;
  let pages = 0;
  let inserted = 0;
  let skipped = 0;

  try {
    for (const familyKey of ["tenders", "awards"] as const) {
      const prefix = familyKey === "tenders" ? "tender" : "award";
      const typeIds =
        familyKey === "tenders"
          ? NOTICE_TYPE_IDS.participation
          : NOTICE_TYPE_IDS.award;

      for (const day of eachDay(window)) {
        let pageIndex = 0;
        for (;;) {
          const { data: envelope } = await listNotices(client, {
            sysNoticeTypeIds: typeIds,
            startPublicationDate: day,
            endPublicationDate: day,
            pageIndex,
            pageSize: 100,
          });
          if (envelope.items.length === 0) break;
          pages += 1;
          checked += envelope.items.length;

          const changedItems = await findChangedItems(
            deps,
            prefix,
            envelope.items,
          );
          changed += changedItems.length;

          if (changedItems.length > 0) {
            const docs: ArchivableDocument[] = [];
            for (const item of changedItems) {
              docs.push({
                source: "elicitatie",
                externalId: `${prefix}:${item.caNoticeId}`,
                endpointVersion: `${prefix}-list:v1`,
                payload: item,
              });
              const detail = await getNoticeDetail(client, item.caNoticeId);
              docs.push({
                source: "elicitatie",
                externalId: `${prefix}:${item.caNoticeId}`,
                endpointVersion: `${prefix}-detail:v1`,
                payload: detail.data,
              });
              if (familyKey === "awards") {
                const contracts = await getNoticeContracts(client, {
                  caNoticeId: item.caNoticeId,
                  skip: 0,
                  take: 200,
                });
                docs.push({
                  source: "elicitatie",
                  externalId: `${prefix}:${item.caNoticeId}`,
                  endpointVersion: `${prefix}-contracts:v1`,
                  payload: { caNoticeId: item.caNoticeId, ...contracts.data },
                });
              }
            }
            const result = await archiveDocuments(db, docs);
            inserted += result.inserted;
            skipped += result.skipped;
          }

          if ((pageIndex + 1) * 100 >= envelope.total) break;
          pageIndex += 1;
        }
      }
    }
  } catch (err) {
    await finishScrapeRun(db, runId, {
      status: "failed",
      reportedTotal: null,
      fetchedCount: checked,
      insertedCount: inserted,
      skippedCount: skipped,
      pagesFetched: pages,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  await finishScrapeRun(db, runId, {
    status: "completed",
    reportedTotal: null,
    fetchedCount: checked,
    insertedCount: inserted,
    skippedCount: skipped,
    pagesFetched: pages,
  });
  return { checked, changed };
}

/** Items whose noticeStateDate differs from the latest archived list row. */
async function findChangedItems(
  deps: ScrapeDeps,
  prefix: string,
  items: NoticeListItem[],
): Promise<NoticeListItem[]> {
  const ids = items.map((i) => `${prefix}:${i.caNoticeId}`);
  const rows = await deps.db
    .select({
      externalId: rawDocuments.externalId,
      payload: rawDocuments.payload,
      fetchedAt: rawDocuments.fetchedAt,
    })
    .from(rawDocuments)
    .where(
      and(
        eq(rawDocuments.source, "elicitatie"),
        eq(rawDocuments.endpointVersion, `${prefix}-list:v1`),
        inArray(rawDocuments.externalId, ids),
      ),
    )
    .orderBy(desc(rawDocuments.fetchedAt));

  const latestStateDate = new Map<string, string | undefined>();
  for (const row of rows) {
    if (!latestStateDate.has(row.externalId)) {
      const payload = row.payload as { noticeStateDate?: string };
      latestStateDate.set(row.externalId, payload.noticeStateDate);
    }
  }

  return items.filter((item) => {
    const key = `${prefix}:${item.caNoticeId}`;
    if (!latestStateDate.has(key)) return true; // never archived — take it
    return latestStateDate.get(key) !== item.noticeStateDate;
  });
}

export function makeRescanTask(deps: ScrapeDeps): Task {
  return async (_payload, helpers) => {
    const result = await rescanNoticeStates(deps);
    helpers.logger.info(
      `state-rescan: checked ${result.checked}, changed ${result.changed}`,
    );
  };
}
