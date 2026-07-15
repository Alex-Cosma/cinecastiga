import type { Task } from "graphile-worker";
import { eq } from "drizzle-orm";
import { entitySicapIds, ingestionWatermarks, type Db } from "@seap/db";
import {
  fetchAllContractingAuthorities,
  getDirectAcquisitionDetail,
  listDirectAcquisitions,
} from "@seap/scraper-clients";
import {
  archiveDocuments,
  finishScrapeRun,
  startScrapeRun,
  type ArchivableDocument,
} from "../archive.js";
import {
  addDays,
  bucharestToday,
  type DateWindow,
  type IsoDate,
} from "../window.js";
import type { ScrapeDeps } from "./notices.js";

const SOURCE = "elicitatie:das";
/** The DA list caps a search at this many rows (searchTooLong past it). */
const MAX_WINDOW = 2000;
// The list honours pageSize up to the 2000 cap, so a whole ≤2000-DA authority
// window comes back in ONE request (bigger windows searchTooLong → date-split).
const DEFAULT_PAGE_SIZE = 2000;
/**
 * Live DA history reaches back to ~2021 (≤2020 comes from the Mongo dump).
 * Floor so per-authority all-time queries don't re-pull dump years.
 */
export const DA_LIVE_FLOOR: IsoDate = "2021-01-01";

export interface DaScrapeOutcome {
  status: "completed" | "failed";
  fetched: number;
  inserted: number;
  skipped: number;
  pages: number;
  /** Authorities processed this run. */
  authoritiesProcessed: number;
  /** Authorities still unprocessed after this run (0 ⇒ backfill complete). */
  authoritiesRemaining: number;
  /** (authorityId@window) leaves that still overflowed 2000 — data loss. */
  lost: string[];
  error?: string;
}

/**
 * Authority-scan cursor: the last authority id fully processed. Keyed by id (not
 * list index) so growth/shrinkage of the authority universe between runs never
 * resets progress — the id-sorted scan just resumes past `lastId`.
 */
interface DaCursor {
  lastId: number;
}

async function readDaCursor(db: Db): Promise<DaCursor | null> {
  const [row] = await db
    .select()
    .from(ingestionWatermarks)
    .where(eq(ingestionWatermarks.source, SOURCE));
  if (!row) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.cursor);
  } catch {
    throw new Error(`Corrupt ${SOURCE} cursor: ${row.cursor.slice(0, 80)}`);
  }
  const c = parsed as Partial<DaCursor>;
  if (typeof c.lastId !== "number") {
    // A pre-pivot day/page cursor (old CPV scraper) — start the authority scan
    // fresh rather than crash on the incompatible shape.
    return null;
  }
  return { lastId: c.lastId };
}

async function writeDaCursor(
  db: Pick<Db, "insert">,
  cursor: DaCursor,
): Promise<void> {
  await db
    .insert(ingestionWatermarks)
    .values({ source: SOURCE, cursor: JSON.stringify(cursor) })
    .onConflictDoUpdate({
      target: ingestionWatermarks.source,
      set: { cursor: JSON.stringify(cursor), updatedAt: new Date() },
    });
}

/** Inclusive day span, e.g. same-day ⇒ 1. */
function windowDays(w: DateWindow): number {
  const ms =
    Date.parse(`${w.end}T00:00:00Z`) - Date.parse(`${w.start}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

/** Split a multi-day window roughly in half by date. */
function splitWindow(w: DateWindow): [DateWindow, DateWindow] {
  const mid = addDays(w.start, Math.floor(windowDays(w) / 2) - 1);
  return [
    { start: w.start, end: mid },
    { start: addDays(mid, 1), end: w.end },
  ];
}

interface CollectResult {
  docs: ArchivableDocument[];
  pages: number;
  lost: string[];
}

/**
 * All DAs for ONE authority within `window`. If the window overflows 2000
 * (searchTooLong) it is bisected by date until every leaf is under the cap — a
 * single day that still overflows for one authority is recorded as loss (in
 * practice impossible). Complete by construction: every DA has exactly one
 * authority and each leaf window is fully paged.
 */
async function collectAuthorityDas(
  deps: ScrapeDeps,
  authorityId: number,
  window: DateWindow,
  pageSize: number,
  fetchDetail: boolean,
): Promise<CollectResult> {
  const { client } = deps;
  const probe = await listDirectAcquisitions(client, {
    finalizationDateStart: window.start,
    finalizationDateEnd: window.end,
    pageIndex: 0,
    pageSize,
    contractingAuthorityId: authorityId,
  });
  const env = probe.data;

  if (env.searchTooLong) {
    if (window.start === window.end) {
      return { docs: [], pages: 1, lost: [`${authorityId}@${window.start}`] };
    }
    const [a, b] = splitWindow(window);
    const left = await collectAuthorityDas(deps, authorityId, a, pageSize, fetchDetail);
    const right = await collectAuthorityDas(deps, authorityId, b, pageSize, fetchDetail);
    return {
      docs: [...left.docs, ...right.docs],
      pages: 1 + left.pages + right.pages,
      lost: [...left.lost, ...right.lost],
    };
  }

  // Truthful total (≤ MAX_WINDOW). Page through all of it.
  const items = [...env.items];
  let pages = 1;
  for (let pageIndex = 1; pageIndex * pageSize < env.total; pageIndex += 1) {
    const { data } = await listDirectAcquisitions(client, {
      finalizationDateStart: window.start,
      finalizationDateEnd: window.end,
      pageIndex,
      pageSize,
      contractingAuthorityId: authorityId,
    });
    items.push(...data.items);
    pages += 1;
    if (data.items.length === 0) break;
  }

  const docs: ArchivableDocument[] = items.map((item) => ({
    source: "elicitatie",
    externalId: `da:${item.directAcquisitionId}`,
    endpointVersion: "da-list:v1",
    payload: item,
  }));
  if (fetchDetail && items.length > 0) {
    const details = await Promise.all(
      items.map((item) =>
        getDirectAcquisitionDetail(client, item.directAcquisitionId).then(
          (r) => ({ id: item.directAcquisitionId, payload: r.data }),
        ),
      ),
    );
    for (const d of details) {
      docs.push({
        source: "elicitatie",
        externalId: `da:${d.id}`,
        endpointVersion: "da-detail:v1",
        payload: d.payload,
      });
    }
  }
  return { docs, pages, lost: [] };
}

/**
 * The authority universe to scan: the LIVE registered list (GetParticipants,
 * ~23.6k) UNIONED with every authority SEAP id already in core
 * (entity_sicap_ids — from the 2018-20 dump + 2021-26 notices). The union
 * recovers deregistered/historical authorities that dropped off the live list
 * but still have DAs (live-verified: old dump ids still return 2021-26 DAs).
 */
export async function buildAuthorityUniverse(
  db: Db,
  client: Parameters<typeof fetchAllContractingAuthorities>[0],
): Promise<number[]> {
  const registered = (await fetchAllContractingAuthorities(client)).map(
    (a) => a.id,
  );
  const rows = await db
    .select({ id: entitySicapIds.sicapId })
    .from(entitySicapIds)
    .where(eq(entitySicapIds.namespace, "authority"));
  const core = rows.map((r) => r.id);
  return Array.from(new Set([...registered, ...core])).sort((a, b) => a - b);
}

export interface ScrapeDasByAuthorityOpts {
  /** finalizationDate window; defaults to DA_LIVE_FLOOR..today. */
  window?: DateWindow;
  /** Inject the authority id list (tests / reuse a cached universe). */
  authorities?: number[];
  /** Process at most this many authorities before returning (chunked runs). */
  maxAuthoritiesPerRun?: number;
  pageSize?: number;
  /** Also fetch per-DA detail (getView). Off by default — the list carries the
   *  economically relevant fields and detail is one extra request per DA. */
  fetchDetail?: boolean;
}

/**
 * Scrape direct acquisitions by iterating the COMPLETE contracting-authority
 * partition. Replaces the CPV-slice fan-out, which could silently miss codes
 * hidden past the 2000 cap. Resumable by authority index; a run processes up to
 * `maxAuthoritiesPerRun` authorities then returns `authoritiesRemaining` so a
 * driver can loop until it hits 0.
 *
 * Completeness: the authority list is enumerated whole (fetchAll reconciles vs
 * the reported total), every DA belongs to exactly one authority, and each
 * authority's window is bisected by date until every leaf is under the 2000
 * cap — so the union is provably all DAs.
 */
export async function scrapeDasByAuthority(
  deps: ScrapeDeps,
  opts: ScrapeDasByAuthorityOpts = {},
): Promise<DaScrapeOutcome> {
  const { db, client } = deps;
  const log = deps.log ?? (() => {});
  const window: DateWindow = opts.window ?? {
    start: DA_LIVE_FLOOR,
    end: bucharestToday(),
  };
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const fetchDetail = opts.fetchDetail ?? false;

  const authorities = (
    opts.authorities ?? (await buildAuthorityUniverse(db, client))
  )
    .slice()
    .sort((a, b) => a - b);

  const runId = await startScrapeRun(db, {
    source: SOURCE,
    windowStart: new Date(`${window.start}T00:00:00+03:00`),
    windowEnd: new Date(`${window.end}T23:59:59+03:00`),
  });

  let fetched = 0;
  let inserted = 0;
  let skipped = 0;
  let pages = 0;
  const lost: string[] = [];

  const cursor = await readDaCursor(db);
  let startIndex = 0;
  if (cursor) {
    const idx = authorities.findIndex((id) => id > cursor.lastId);
    startIndex = idx < 0 ? authorities.length : idx;
  }
  const limit = opts.maxAuthoritiesPerRun ?? authorities.length;
  const end = Math.min(startIndex + limit, authorities.length);

  const finish = async (
    status: "completed" | "failed",
    error?: string,
  ): Promise<DaScrapeOutcome> => {
    await finishScrapeRun(db, runId, {
      status,
      reportedTotal: null,
      fetchedCount: fetched,
      insertedCount: inserted,
      skippedCount: skipped,
      pagesFetched: pages,
      ...(error ? { error } : {}),
    });
    return {
      status,
      fetched,
      inserted,
      skipped,
      pages,
      authoritiesProcessed: status === "failed" ? 0 : end - startIndex,
      authoritiesRemaining:
        authorities.length - (status === "failed" ? startIndex : end),
      lost,
      ...(error ? { error } : {}),
    };
  };

  try {
    for (let i = startIndex; i < end; i += 1) {
      const authId = authorities[i]!;
      const res = await collectAuthorityDas(
        deps,
        authId,
        window,
        pageSize,
        fetchDetail,
      );
      lost.push(...res.lost);
      pages += res.pages;
      const listDocs = res.docs.filter(
        (d) => d.endpointVersion === "da-list:v1",
      ).length;
      fetched += listDocs;

      const archived = await db.transaction(async (tx) => {
        const r = await archiveDocuments(tx, res.docs);
        await writeDaCursor(tx, { lastId: authId });
        return r;
      });
      inserted += archived.inserted;
      skipped += archived.skipped;
      log(
        `${SOURCE} auth ${authId} (${i + 1}/${authorities.length}): +${archived.inserted} (${listDocs} DAs)`,
      );
    }
  } catch (err) {
    return finish("failed", err instanceof Error ? err.message : String(err));
  }

  if (lost.length > 0) {
    return finish(
      "failed",
      `data loss: single-day authority windows over ${MAX_WINDOW} [${lost.join(", ")}]`,
    );
  }
  return finish("completed");
}

/** Worker task: chunked authority scan, re-enqueues until the list is done. */
export function makeScrapeDasTask(
  deps: ScrapeDeps,
  opts: { maxAuthoritiesPerRun?: number } = {},
): Task {
  const maxAuthoritiesPerRun = opts.maxAuthoritiesPerRun ?? 200;
  return async (_payload, helpers) => {
    const outcome = await scrapeDasByAuthority(
      { ...deps, log: (m) => helpers.logger.info(m) },
      { maxAuthoritiesPerRun },
    );
    if (outcome.status === "failed") {
      throw new Error(`${SOURCE} run failed: ${outcome.error}`);
    }
    if (outcome.authoritiesRemaining > 0) {
      await helpers.addJob("scrape_das", {}, { jobKey: `${SOURCE}:chain` });
    }
  };
}
