import type { Db } from "@seap/db";
import {
  fetchTedNoticeXml,
  searchTedNotices,
  tedCountryWindowQuery,
  tedPublicationNumber,
  type TedClient,
} from "@seap/scraper-clients";
import {
  archiveDocuments,
  finishScrapeRun,
  startScrapeRun,
  type ArchivableDocument,
} from "../archive.js";
import type { DateWindow } from "../window.js";

/**
 * TED raw ingester — archives above-threshold RO notices as their canonical
 * eForms XML. Runs fully in parallel with the e-licitatie crawlers (different
 * host, no rate limit, separate budget). No entity/detail parsing here — raw is
 * a faithful copy; the eForms→core mapping + SICAP reconciliation come later.
 *
 * Completeness: TED's search paginates the whole window; each result's full XML
 * is fetched and stored under `source='ted'`, external id = TED publication number.
 */

export interface TedScrapeDeps {
  db: Db;
  client: TedClient;
  log?: (m: string) => void;
}

export interface TedScrapeOutcome {
  status: "completed" | "failed";
  reportedTotal: number;
  fetched: number;
  inserted: number;
  skipped: number;
  pages: number;
  error?: string;
}

export interface ScrapeTedOpts {
  window: DateWindow;
  /** ISO-3 country, default "ROU". */
  country?: string;
  /** eForms notice type, default "can-standard" (contract award notice). */
  noticeType?: string;
  /** Notices per search page. */
  pageSize?: number;
}

// TED caps the reachable result window; a scrape window that exceeds this many
// hits should be split by the caller into smaller date windows.
const MAX_REACHABLE = 9000;

export async function scrapeTedNotices(
  deps: TedScrapeDeps,
  opts: ScrapeTedOpts,
): Promise<TedScrapeOutcome> {
  const { db, client } = deps;
  const log = deps.log ?? (() => {});
  const country = opts.country ?? "ROU";
  const noticeType = opts.noticeType ?? "can-standard";
  const pageSize = opts.pageSize ?? 50;
  const query = tedCountryWindowQuery({
    country,
    noticeType,
    start: opts.window.start,
    end: opts.window.end,
  });

  const source = `ted:${noticeType}`;
  const runId = await startScrapeRun(db, {
    source,
    windowStart: new Date(`${opts.window.start}T00:00:00Z`),
    windowEnd: new Date(`${opts.window.end}T23:59:59Z`),
  });

  let fetched = 0;
  let inserted = 0;
  let skipped = 0;
  let pages = 0;
  let reportedTotal = 0;

  const finish = async (
    status: "completed" | "failed",
    error?: string,
  ): Promise<TedScrapeOutcome> => {
    await finishScrapeRun(db, runId, {
      status,
      reportedTotal,
      fetchedCount: fetched,
      insertedCount: inserted,
      skippedCount: skipped,
      pagesFetched: pages,
      ...(error ? { error } : {}),
    });
    return { status, reportedTotal, fetched, inserted, skipped, pages, ...(error ? { error } : {}) };
  };

  try {
    let page = 1;
    for (;;) {
      const res = await searchTedNotices(client, { query, page, limit: pageSize });
      if (page === 1) {
        reportedTotal = res.totalNoticeCount ?? res.notices.length;
        if (reportedTotal > MAX_REACHABLE) {
          return await finish(
            "failed",
            `window ${opts.window.start}..${opts.window.end} has ${reportedTotal} ${source} notices (> ${MAX_REACHABLE} reachable) — split into smaller date windows`,
          );
        }
        log(`${source} ${opts.window.start}..${opts.window.end}: ${reportedTotal} notices`);
      }
      if (res.notices.length === 0) break;
      pages += 1;

      // Fetch each notice's full eForms XML (the canonical raw record).
      const docs: ArchivableDocument[] = [];
      for (const n of res.notices) {
        const pubnum = tedPublicationNumber(n);
        if (!pubnum) continue;
        const xml = await fetchTedNoticeXml(client, pubnum);
        fetched += 1;
        docs.push({
          source: "ted",
          externalId: `${noticeType}:${pubnum}`,
          endpointVersion: "ted-eforms:v1",
          payload: {
            "publication-number": pubnum,
            "notice-type": noticeType,
            "publication-date": n["publication-date"] ?? null,
            "buyer-name": n["buyer-name"] ?? null,
            xml,
          },
        });
      }

      const archived = await archiveDocuments(db, docs);
      inserted += archived.inserted;
      skipped += archived.skipped;
      log(
        `${source} page ${page}: +${archived.inserted}/${archived.skipped} skipped (fetched ${fetched}/${reportedTotal})`,
      );

      if (fetched >= reportedTotal) break;
      page += 1;
    }
  } catch (err) {
    return finish("failed", err instanceof Error ? err.message : String(err));
  }

  return finish("completed");
}
