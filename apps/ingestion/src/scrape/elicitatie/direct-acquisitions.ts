import type { Task } from "graphile-worker";
import {
  getDirectAcquisitionDetail,
  listDirectAcquisitions,
  type DirectAcquisitionListItem,
  type ListEnvelope,
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
  isoDaysAgo,
  type DateWindow,
  type IsoDate,
} from "../window.js";
import { resolveLeafSlices, sliceKey, type DaSlice } from "./da-slicer.js";
import { SicapCpvCatalog, type CpvCatalog } from "./cpv-catalog.js";
import type { ScrapeDeps } from "./notices.js";

const SOURCE = "elicitatie:das";

export interface DaScrapeOutcome {
  status: "completed" | "failed";
  fetched: number;
  inserted: number;
  skipped: number;
  pages: number;
  /** Leaf slices that still overflowed the 2000 window — data loss (DEC-004). */
  lostSlices: string[];
  error?: string;
}

function validateDaEnvelope(
  envelope: ListEnvelope<DirectAcquisitionListItem>,
  day: IsoDate,
): string | null {
  if (!Array.isArray(envelope.items) || typeof envelope.total !== "number") {
    return "response shape violation: expected {total, items[]}";
  }
  const dated = envelope.items.filter(
    (i) => typeof i.finalizationDate === "string",
  );
  if (envelope.items.length > 0 && dated.length === 0) {
    return "shape drift: no item carries finalizationDate";
  }
  for (const item of dated) {
    const itemDay = bucharestDayOf(item.finalizationDate as string);
    if (itemDay !== day) {
      return `filter-echo violation: DA ${item.directAcquisitionId} finalized ${itemDay}, requested ${day}`;
    }
  }
  return null;
}

/**
 * Scrape direct acquisitions for a closed window, with a trailing lookback
 * (late finalizations; DEC-003). Adaptive slicing per DEC-004; leaf-level
 * searchTooLong is recorded as data loss but does not stop other slices.
 */
export async function scrapeDaWindow(
  deps: ScrapeDeps & { catalog?: CpvCatalog },
  opts: { window: DateWindow; pageSize?: number; lookbackDays?: number },
): Promise<DaScrapeOutcome> {
  const { db, client } = deps;
  const log = deps.log ?? (() => {});
  const catalog = deps.catalog ?? new SicapCpvCatalog(client);
  const pageSize = opts.pageSize ?? 100;
  const lookback = opts.lookbackDays ?? 2;
  const window: DateWindow = {
    start: addDays(opts.window.start, -lookback),
    end: opts.window.end,
  };

  const runId = await startScrapeRun(db, {
    source: SOURCE,
    windowStart: new Date(`${window.start}T00:00:00+03:00`),
    windowEnd: new Date(`${window.end}T23:59:59+03:00`),
  });

  let fetched = 0;
  let inserted = 0;
  let skipped = 0;
  let pages = 0;
  let reportedTotal = 0;
  const lostSlices: string[] = [];

  const watermark = await readWatermark(db, SOURCE);
  const resume =
    watermark && watermark.windowStart === window.start ? watermark : null;

  const fail = async (error: string): Promise<DaScrapeOutcome> => {
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
      lostSlices,
      error,
    };
  };

  try {
    for (const day of eachDay(window)) {
      if (resume && day < resume.day) continue;

      const slices = await resolveLeafSlices(client, catalog, day);
      let sliceStartIndex = 0;
      let resumePage = 0;
      if (resume && day === resume.day && resume.slice) {
        const idx = slices.findIndex((s) => sliceKey(s) === resume.slice);
        if (idx >= 0) {
          sliceStartIndex = idx;
          resumePage = resume.page;
        }
      }

      for (let s = sliceStartIndex; s < slices.length; s += 1) {
        const slice = slices[s]!;
        const key = sliceKey(slice);
        let pageIndex = s === sliceStartIndex ? resumePage : 0;

        for (;;) {
          const { data: envelope } = await listDirectAcquisitions(client, {
            finalizationDateStart: slice.day,
            finalizationDateEnd: slice.day,
            pageIndex,
            pageSize,
            ...(slice.cpvCategoryId !== undefined
              ? { cpvCategoryId: slice.cpvCategoryId }
              : {}),
            ...(slice.cpvCodeId !== undefined
              ? { cpvCodeId: slice.cpvCodeId }
              : {}),
          });

          if (envelope.searchTooLong) {
            // Leaf overflow: unrecoverable with current slicing — record and move on
            lostSlices.push(key);
            log(`${SOURCE} ${day} ${key}: searchTooLong at leaf — data loss recorded`);
            break;
          }
          const violation = validateDaEnvelope(envelope, day);
          if (violation) return await fail(violation);

          if (pageIndex === 0) reportedTotal += envelope.total;
          if (envelope.items.length === 0) break;

          const docs: ArchivableDocument[] = [];
          for (const item of envelope.items) {
            docs.push({
              source: "elicitatie",
              externalId: `da:${item.directAcquisitionId}`,
              endpointVersion: "da-list:v1",
              payload: item,
            });
          }
          const details = await Promise.all(
            envelope.items.map((item) =>
              getDirectAcquisitionDetail(client, item.directAcquisitionId).then(
                (r) => ({ id: item.directAcquisitionId, payload: r.data }),
              ),
            ),
          );
          for (const detail of details) {
            docs.push({
              source: "elicitatie",
              externalId: `da:${detail.id}`,
              endpointVersion: "da-detail:v1",
              payload: detail.payload,
            });
          }

          fetched += envelope.items.length;
          pages += 1;
          const cursor = { windowStart: window.start, day, page: pageIndex + 1, slice: key };
          const result = await db.transaction(async (tx) => {
            const archived = await archiveDocuments(tx, docs);
            await writeWatermark(tx, SOURCE, cursor);
            return archived;
          });
          inserted += result.inserted;
          skipped += result.skipped;
          log(`${SOURCE} ${day} ${key} page ${pageIndex}: +${result.inserted}/${result.skipped} skipped`);

          if ((pageIndex + 1) * pageSize >= envelope.total) break;
          pageIndex += 1;
        }
      }

      await writeWatermark(db, SOURCE, {
        windowStart: window.start,
        day: addDays(day, 1),
        page: 0,
      });
    }
  } catch (err) {
    return await fail(err instanceof Error ? err.message : String(err));
  }

  if (lostSlices.length > 0) {
    return await fail(
      `data loss: searchTooLong at leaf slices [${lostSlices.join(", ")}]`,
    );
  }

  await finishScrapeRun(db, runId, {
    status: "completed",
    reportedTotal,
    fetchedCount: fetched,
    insertedCount: inserted,
    skippedCount: skipped,
    pagesFetched: pages,
  });
  return { status: "completed", fetched, inserted, skipped, pages, lostSlices };
}

/** Worker task: incremental from watermark, chunked (DA days are heavy). */
export function makeScrapeDasTask(
  deps: ScrapeDeps & { catalog?: CpvCatalog },
  opts: { maxDaysPerRun?: number; sampleDays?: number } = {},
): Task {
  const maxDays = opts.maxDaysPerRun ?? 2;

  return async (_payload, helpers) => {
    const yesterday = isoDaysAgo(1);
    const watermark = await readWatermark(deps.db, SOURCE);

    let start: IsoDate;
    if (watermark && watermark.day <= yesterday) {
      start = watermark.day;
    } else if (watermark) {
      helpers.logger.info(`${SOURCE}: up to date (watermark ${watermark.day})`);
      return;
    } else {
      start = closedWindow(opts.sampleDays ?? 30).start;
    }

    const cappedEnd =
      addDays(start, maxDays - 1) < yesterday
        ? addDays(start, maxDays - 1)
        : yesterday;

    helpers.logger.info(`${SOURCE}: scraping ${start}..${cappedEnd}`);
    const outcome = await scrapeDaWindow(
      { ...deps, log: (m) => helpers.logger.info(m) },
      // lookback 0 for chained chunks — the daily cron run covers lookback
      { window: { start, end: cappedEnd }, lookbackDays: 0 },
    );
    if (outcome.status === "failed") {
      throw new Error(`${SOURCE} run failed: ${outcome.error}`);
    }

    if (cappedEnd < yesterday) {
      await helpers.addJob("scrape_das", {}, { jobKey: `${SOURCE}:chain` });
    }
  };
}
