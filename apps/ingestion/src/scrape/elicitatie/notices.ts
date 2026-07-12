import type { Task } from "graphile-worker";
import type { Db } from "@seap/db";
import {
  getNoticeContracts,
  getNoticeDetail,
  listNotices,
  noticeIdOf,
  NOTICE_TYPE_IDS,
  type ElicitatieClient,
  type ListEnvelope,
  type NoticeContractItem,
  type NoticeListItem,
} from "@seap/scraper-clients";
import {
  archiveDocuments,
  finishScrapeRun,
  startScrapeRun,
  type ArchivableDocument,
} from "../archive.js";
import { readWatermark, writeWatermark } from "../watermark.js";
import {
  addDays,
  bucharestDayOf,
  closedWindow,
  eachDay,
  inWindow,
  isoDaysAgo,
  type DateWindow,
} from "../window.js";

export type NoticeFamily = "tenders" | "awards";

const FAMILY_CONFIG = {
  tenders: {
    source: "elicitatie:tenders",
    prefix: "tender",
    typeIds: NOTICE_TYPE_IDS.participation,
  },
  awards: {
    source: "elicitatie:awards",
    prefix: "award",
    typeIds: NOTICE_TYPE_IDS.award,
  },
} as const;

export interface ScrapeDeps {
  db: Db;
  client: ElicitatieClient;
  log?: (msg: string) => void;
}

export interface NoticeScrapeOutcome {
  status: "completed" | "failed";
  fetched: number;
  inserted: number;
  skipped: number;
  pages: number;
  /** eForms (v2) notices archived list-only — detail endpoint differs, deferred. */
  v2Deferred: number;
  /** Individual detail fetches dead-lettered (non-retryable errors). */
  detailFailures: number;
  error?: string;
}

/** Envelope + window invariants (DEC-008). Violation must NOT advance cursors. */
function validateEnvelope(
  envelope: ListEnvelope<NoticeListItem>,
  day: string,
): string | null {
  if (!Array.isArray(envelope.items) || typeof envelope.total !== "number") {
    return "response shape violation: expected {total, items[]}";
  }
  if (envelope.searchTooLong) {
    return `searchTooLong on day ${day} — result window exceeded, data loss`;
  }
  // Live reality (2026-07-12): list items carry NO publicationDate — only
  // noticeStateDate, which mutates on state changes and therefore can
  // postdate publication but never precede it. An item whose state date
  // precedes the requested day proves the server ignored our date filter
  // (the "silently-ignored filter field" trap — unfiltered firehose).
  const dated = envelope.items.filter(
    (i) => typeof i.noticeStateDate === "string",
  );
  if (envelope.items.length > 0 && dated.length === 0) {
    return "shape drift: no item carries noticeStateDate";
  }
  for (const item of dated) {
    const itemDay = bucharestDayOf(item.noticeStateDate as string);
    if (itemDay < day) {
      return `filter-echo violation: item ${noticeIdOf(item)} state date ${itemDay} predates requested ${day}`;
    }
  }
  return null;
}

async function fetchAllContracts(
  client: ElicitatieClient,
  caNoticeId: number,
): Promise<ListEnvelope<NoticeContractItem>> {
  const take = 200;
  const first = await getNoticeContracts(client, { caNoticeId, skip: 0, take });
  const items = [...first.data.items];
  while (items.length < first.data.total) {
    const page = await getNoticeContracts(client, {
      caNoticeId,
      skip: items.length,
      take,
    });
    if (page.data.items.length === 0) break;
    items.push(...page.data.items);
  }
  return { total: first.data.total, items };
}

/**
 * Scrape one closed window for a notice family, day by day, page by page.
 * Cursor advances in the same transaction as each page's archive writes.
 */
export async function scrapeNoticesWindow(
  deps: ScrapeDeps,
  opts: { family: NoticeFamily; window: DateWindow; pageSize?: number },
): Promise<NoticeScrapeOutcome> {
  const { db, client } = deps;
  const log = deps.log ?? (() => {});
  const { source, prefix, typeIds } = FAMILY_CONFIG[opts.family];
  const pageSize = opts.pageSize ?? 100;

  const runId = await startScrapeRun(db, {
    source,
    windowStart: new Date(`${opts.window.start}T00:00:00+03:00`),
    windowEnd: new Date(`${opts.window.end}T23:59:59+03:00`),
  });

  let fetched = 0;
  let inserted = 0;
  let skipped = 0;
  let pages = 0;
  let reportedTotal = 0;
  let v2Deferred = 0;
  let detailFailures = 0;

  // Resume mid-window if the watermark belongs to this window
  const watermark = await readWatermark(db, source);
  let resumeDay: string | null = null;
  let resumePage = 0;
  if (watermark && watermark.windowStart === opts.window.start) {
    resumeDay = watermark.day;
    resumePage = watermark.page;
  }

  const fail = async (error: string): Promise<NoticeScrapeOutcome> => {
    await finishScrapeRun(db, runId, {
      status: "failed",
      reportedTotal: null,
      fetchedCount: fetched,
      insertedCount: inserted,
      skippedCount: skipped,
      pagesFetched: pages,
      error,
    });
    return {
      status: "failed",
      fetched,
      inserted,
      skipped,
      pages,
      v2Deferred,
      detailFailures,
      error,
    };
  };

  try {
    for (const day of eachDay(opts.window)) {
      if (resumeDay && day < resumeDay) continue;
      let pageIndex = resumeDay === day ? resumePage : 0;

      for (;;) {
        const response = await listNotices(client, {
          sysNoticeTypeIds: typeIds,
          startPublicationDate: day,
          endPublicationDate: day,
          pageIndex,
          pageSize,
        });
        const envelope = response.data;

        const violation = validateEnvelope(envelope, day);
        if (violation) return await fail(violation);

        if (pageIndex === 0) reportedTotal += envelope.total;
        if (envelope.items.length === 0) break;

        const docs: ArchivableDocument[] = [];
        for (const item of envelope.items) {
          docs.push({
            source: "elicitatie",
            externalId: `${prefix}:${noticeIdOf(item)}`,
            endpointVersion: `${prefix}-list:v1`,
            payload: item,
          });
        }

        const details = await Promise.all(
          envelope.items.map(async (item) => {
            // eForms (v2) notices 400 on the classic detail endpoint —
            // archived list-only; v2 detail mapping is a follow-up task.
            if (item.sysNoticeVersionId === 2) {
              return { item, detail: null, contracts: null, deferred: true };
            }
            try {
              const detail = await getNoticeDetail(client, noticeIdOf(item));
              const contracts =
                opts.family === "awards"
                  ? await fetchAllContracts(client, noticeIdOf(item))
                  : null;
              return { item, detail: detail.data, contracts, deferred: false };
            } catch (err) {
              // Dead-letter the record, don't fail the day (transient retries
              // already happened inside the client).
              log(
                `${source}: detail fetch failed for ${noticeIdOf(item)}: ${err instanceof Error ? err.message : err}`,
              );
              return { item, detail: null, contracts: null, deferred: false };
            }
          }),
        );
        for (const { item, detail, contracts, deferred } of details) {
          if (deferred) v2Deferred += 1;
          else if (detail === null) detailFailures += 1;
          if (detail !== null) {
            docs.push({
              source: "elicitatie",
              externalId: `${prefix}:${noticeIdOf(item)}`,
              endpointVersion: `${prefix}-detail:v1`,
              payload: detail,
            });
          }
          if (contracts) {
            docs.push({
              source: "elicitatie",
              externalId: `${prefix}:${noticeIdOf(item)}`,
              endpointVersion: `${prefix}-contracts:v1`,
              payload: { caNoticeId: noticeIdOf(item), ...contracts },
            });
          }
        }

        fetched += envelope.items.length;
        pages += 1;
        const nextCursor = { windowStart: opts.window.start, day, page: pageIndex + 1 };
        const result = await db.transaction(async (tx) => {
          const archived = await archiveDocuments(tx, docs);
          await writeWatermark(tx, source, nextCursor);
          return archived;
        });
        inserted += result.inserted;
        skipped += result.skipped;
        log(`${source} ${day} page ${pageIndex}: +${result.inserted}/${result.skipped} skipped`);

        if ((pageIndex + 1) * pageSize >= envelope.total) break;
        pageIndex += 1;
      }

      // Day complete — move cursor to next day so resume never repeats it
      await writeWatermark(db, source, {
        windowStart: opts.window.start,
        day: addDays(day, 1),
        page: 0,
      });
    }
  } catch (err) {
    return await fail(err instanceof Error ? err.message : String(err));
  }

  const warnings: string[] = [];
  if (v2Deferred > 0) warnings.push(`${v2Deferred} v2 details deferred`);
  if (detailFailures > 0) warnings.push(`${detailFailures} detail fetches failed`);

  await finishScrapeRun(db, runId, {
    status: "completed",
    reportedTotal,
    fetchedCount: fetched,
    insertedCount: inserted,
    skippedCount: skipped,
    pagesFetched: pages,
    ...(warnings.length > 0 ? { error: `warning: ${warnings.join("; ")}` } : {}),
  });
  return {
    status: "completed",
    fetched,
    inserted,
    skipped,
    pages,
    v2Deferred,
    detailFailures,
  };
}

/**
 * Worker task factory. Computes the window from the watermark (incremental)
 * or a default trailing window, capped at `maxDaysPerRun`; re-enqueues
 * itself when more window remains.
 */
export function makeScrapeNoticesTask(
  deps: ScrapeDeps,
  family: NoticeFamily,
  opts: { maxDaysPerRun?: number; sampleDays?: number } = {},
): Task {
  const { source } = FAMILY_CONFIG[family];
  const maxDays = opts.maxDaysPerRun ?? 7;

  return async (_payload, helpers) => {
    const yesterday = isoDaysAgo(1);
    const watermark = await readWatermark(deps.db, source);

    let start: string;
    if (watermark && watermark.day <= yesterday) {
      start = watermark.day;
    } else if (watermark) {
      helpers.logger.info(`${source}: up to date (watermark ${watermark.day})`);
      return;
    } else {
      start = closedWindow(opts.sampleDays ?? 30).start;
    }

    const cappedEnd =
      addDays(start, maxDays - 1) < yesterday
        ? addDays(start, maxDays - 1)
        : yesterday;
    const window = { start, end: cappedEnd };

    helpers.logger.info(`${source}: scraping ${window.start}..${window.end}`);
    const outcome = await scrapeNoticesWindow(
      { ...deps, log: (m) => helpers.logger.info(m) },
      { family, window },
    );
    if (outcome.status === "failed") {
      throw new Error(`${source} run failed: ${outcome.error}`);
    }

    if (cappedEnd < yesterday) {
      await helpers.addJob(
        family === "tenders" ? "scrape_tenders" : "scrape_awards",
        {},
        { jobKey: `${source}:chain` },
      );
    }
  };
}
