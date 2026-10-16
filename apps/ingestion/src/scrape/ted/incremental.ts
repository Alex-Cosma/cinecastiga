import type { DbSql } from "@seap/db";
import {
  createHttpClient,
  createTedClient,
  fetchTedNoticeXml,
  ScrapeError,
  searchTedNotices,
  TED_API_BASE,
  tedCountryWindowQuery,
  tedPublicationNumber,
  type TedClient,
  type TedNoticeSummary,
} from "@seap/scraper-clients";
import { extractTedNotice } from "../../normalize/ted.js";
import { archiveDocumentsSql, type ArchivableDocument } from "../archive.js";
import { addDays, bucharestToday, type IsoDate } from "../window.js";
import { tedArchiveDocument } from "./notices.js";

/**
 * Automatic, incremental TED import (Romanian contract award notices).
 *
 * Runs once per scheduled night inside the processing run, after the SEAP
 * workers are stopped and before the raw boundary is frozen, so the same
 * night's `normalize` → `reconcile` → `ted-mart` stages pick the notices up.
 *
 * TED is a different host from SEAP: this job never touches the shared SEAP
 * request gate, its budget or the proxy pool. It is polite on its own terms:
 * one request at a time, a fixed delay, a request and wall-clock budget per
 * run, and a 429 ends the night quietly (watermark unchanged, no alert unless
 * it keeps happening — see `detectOperationalAlerts`).
 *
 * Watermark (`core.ingestion_watermarks`, source `ted:incremental`): the last
 * TED publication day whose search results were ALL archived. It advances only
 * per fully successful day, in the same transaction as that day's raw inserts.
 * Without a watermark, the baseline is the latest publication day already in
 * raw. Each run re-searches `overlapDays` ending at the watermark (late TED
 * indexing); notices already archived are not fetched again, and the raw
 * content hash keeps any repeat insert idempotent.
 */

export const TED_INCREMENTAL_SOURCE = "ted:incremental";
const NOTICE_TYPE = "can-standard";
const COUNTRY = "ROU";
// Safety stop: a single TED publication day has a few hundred RO awards at most.
const MAX_PAGES_PER_DAY = 20;

export interface TedIncrementalConfig {
  /** Kill switch. Off unless TED_INCREMENTAL=on. */
  enabled: boolean;
  /** Days ending at the watermark that are searched again. */
  overlapDays: number;
  /** New publication days a run may add beyond the watermark. */
  maxDaysPerRun: number;
  /** HTTP attempts per run, retries included. */
  maxRequests: number;
  /** Wall-clock budget; no request starts after it. */
  maxRuntimeMs: number;
  /** Minimum delay between request starts (sequential). */
  delayMs: number;
  requestTimeoutMs: number;
  pageSize: number;
  /** A 429 asking for a longer wait than this ends the run instead of waiting. */
  maxRetryAfterMs: number;
}

export const TED_INCREMENTAL_DEFAULTS: TedIncrementalConfig = {
  enabled: false,
  overlapDays: 3,
  maxDaysPerRun: 14,
  maxRequests: 500,
  maxRuntimeMs: 10 * 60_000,
  delayMs: 1200,
  requestTimeoutMs: 30_000,
  pageSize: 100,
  maxRetryAfterMs: 60_000,
};

function intEnv(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return n;
}

export function tedIncrementalConfig(env: NodeJS.ProcessEnv = process.env): TedIncrementalConfig {
  const d = TED_INCREMENTAL_DEFAULTS;
  return {
    enabled: (env["TED_INCREMENTAL"] ?? "").trim().toLowerCase() === "on",
    overlapDays: intEnv(env, "TED_INCREMENTAL_OVERLAP_DAYS", d.overlapDays, 0, 14),
    maxDaysPerRun: intEnv(env, "TED_INCREMENTAL_MAX_DAYS", d.maxDaysPerRun, 1, 62),
    maxRequests: intEnv(env, "TED_INCREMENTAL_MAX_REQUESTS", d.maxRequests, 1, 5000),
    maxRuntimeMs: intEnv(env, "TED_INCREMENTAL_MAX_MINUTES", d.maxRuntimeMs / 60_000, 1, 60) * 60_000,
    delayMs: intEnv(env, "TED_INCREMENTAL_DELAY_MS", d.delayMs, 500, 60_000),
    requestTimeoutMs: d.requestTimeoutMs,
    pageSize: d.pageSize,
    maxRetryAfterMs: d.maxRetryAfterMs,
  };
}

/** Publication days to search, or null when the watermark already reached yesterday. */
export function planTedWindow(
  through: IsoDate,
  today: IsoDate,
  cfg: Pick<TedIncrementalConfig, "overlapDays" | "maxDaysPerRun">,
): { start: IsoDate; end: IsoDate } | null {
  const yesterday = addDays(today, -1);
  if (through >= yesterday) return null;
  const limit = addDays(through, cfg.maxDaysPerRun);
  return { start: addDays(through, 1 - cfg.overlapDays), end: limit < yesterday ? limit : yesterday };
}

// ── HTTP: sequential, metered, never through the SEAP gate ───────────────

/** Counts every HTTP attempt and remembers the last Retry-After. */
export interface TedRequestMeter {
  requests: number;
  retryAfterMs: number | null;
}

function retryAfterMs(header: string | null, now: number): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

/** A dedicated TED client: one in flight, no client-side retries (handled per run). */
export function createTedIncrementalClient(
  cfg: TedIncrementalConfig,
  meter: TedRequestMeter,
  opts: { userAgent: string; fetch?: typeof fetch },
): TedClient {
  const base = opts.fetch ?? fetch;
  const transport: typeof fetch = async (input, init) => {
    meter.requests += 1;
    meter.retryAfterMs = null;
    const response = await base(input, { ...init, signal: AbortSignal.timeout(cfg.requestTimeoutMs) });
    meter.retryAfterMs = retryAfterMs(response.headers.get("retry-after"), Date.now());
    return response;
  };
  return createTedClient({
    userAgent: opts.userAgent,
    httpClient: createHttpClient({
      baseUrl: TED_API_BASE,
      userAgent: opts.userAgent,
      transport,
      maxConcurrency: 1,
      minDelayMs: cfg.delayMs,
      maxRetries: 0,
      circuitThreshold: 0,
    }),
  });
}

class BudgetExhausted extends Error {}
class RateLimited extends Error {}

const DEFAULT_RATE_LIMIT_WAIT_MS = 30_000;
const TRANSIENT_WAIT_MS = 5_000;

/**
 * Wraps one logical TED call. Budget is checked before every attempt. A 429
 * is retried at most once, only when its Retry-After fits both the cap and the
 * remaining time; otherwise the run stops for tonight. A network error/5xx is
 * retried once after a short pause. Everything else fails the run.
 */
export function tedRequester(opts: {
  cfg: Pick<TedIncrementalConfig, "maxRequests" | "maxRetryAfterMs">;
  meter: TedRequestMeter;
  deadline: number;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}) {
  const { cfg, meter, deadline, now, sleep } = opts;
  const check = () => {
    if (meter.requests >= cfg.maxRequests) throw new BudgetExhausted(`request budget (${cfg.maxRequests}) reached`);
    if (now() >= deadline) throw new BudgetExhausted("time budget reached");
  };
  return async function request<T>(fn: () => Promise<T>): Promise<T> {
    let rateLimitRetries = 0;
    let transientRetries = 0;
    for (;;) {
      check();
      try {
        return await fn();
      } catch (err) {
        const status = err instanceof ScrapeError ? err.status : undefined;
        if (status === 429) {
          const wait = meter.retryAfterMs ?? DEFAULT_RATE_LIMIT_WAIT_MS;
          if (rateLimitRetries < 1 && wait <= cfg.maxRetryAfterMs && now() + wait < deadline) {
            rateLimitRetries += 1;
            await sleep(wait);
            continue;
          }
          throw new RateLimited(`TED answered 429 (Retry-After ${meter.retryAfterMs === null ? "absent" : `${Math.round(meter.retryAfterMs / 1000)}s`}); deferred to the next night`);
        }
        if ((status === null || (status !== undefined && status >= 500)) && transientRetries < 1) {
          transientRetries += 1;
          await sleep(TRANSIENT_WAIT_MS);
          continue;
        }
        throw err;
      }
    }
  };
}

// ── baseline + watermark ─────────────────────────────────────────────────

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Latest TED publication day already archived as an eForms award notice, from data. */
export async function latestArchivedTedDay(sql: DbSql): Promise<IsoDate | null> {
  // Publication numbers increase with the OJ S issue; the newest numbers carry
  // the newest day. Bulk-imported rows have the date only inside the XML.
  const [row] = await sql`select max(coalesce(left(payload->>'publication-date',10),
      substring(payload->>'xml' from '<efbc:PublicationDate>([0-9]{4}-[0-9]{2}-[0-9]{2})'))) as day
    from (select payload from raw.raw_documents
      where source='ted' and endpoint_version='ted-eforms:v1' and external_id ~ '^can-standard:[0-9]+-[0-9]{4}$'
      order by split_part(split_part(external_id,':',2),'-',2)::int desc,
               split_part(split_part(external_id,':',2),'-',1)::int desc
      limit 50) latest`;
  const day = row?.day == null ? null : String(row.day);
  return day && ISO.test(day) ? day : null;
}

export async function readTedWatermark(sql: DbSql): Promise<IsoDate | null> {
  const [row] = await sql`select cursor from core.ingestion_watermarks where source=${TED_INCREMENTAL_SOURCE}`;
  if (!row) return null;
  const day = (JSON.parse(String(row.cursor)) as { day?: unknown }).day;
  if (typeof day !== "string" || !ISO.test(day)) throw new Error(`Malformed ${TED_INCREMENTAL_SOURCE} watermark`);
  return day;
}

/** Same cursor shape as the other scrapers ({windowStart, day, page}); never moves back. */
async function advanceTedWatermark(tx: DbSql, windowStart: IsoDate, day: IsoDate): Promise<void> {
  const cursor = JSON.stringify({ windowStart, day, page: 0 });
  await tx`insert into core.ingestion_watermarks(source,cursor) values(${TED_INCREMENTAL_SOURCE},${cursor})
    on conflict(source) do update set cursor=excluded.cursor,updated_at=now()
    where (core.ingestion_watermarks.cursor::jsonb->>'day') < (excluded.cursor::jsonb->>'day')`;
}

// ── the run ──────────────────────────────────────────────────────────────

export type TedIncrementalStatus =
  | "disabled" // kill switch off: no DB writes, no requests
  | "no-baseline" // nothing archived yet and no watermark: refuse to guess history
  | "up-to-date" // watermark already at yesterday
  | "completed" // whole planned window archived
  | "bounded" // budget reached; watermark advanced through the last complete day
  | "deferred" // TED rate-limited us; try again next night
  | "failed";

export interface TedIncrementalOutcome {
  status: TedIncrementalStatus;
  baseline: { day: IsoDate; from: "watermark" | "raw" } | null;
  window: { start: IsoDate; end: IsoDate } | null;
  watermark: IsoDate | null;
  requests: number;
  daysCompleted: number;
  listed: number;
  alreadyArchived: number;
  inserted: number;
  skipped: number;
  error?: string;
}

export interface TedIncrementalDeps {
  sql: DbSql;
  client: TedClient;
  meter: TedRequestMeter;
  config: TedIncrementalConfig;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  log?: (m: string) => void;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 500);

/** Plans without network access (used by `--plan` and by the run itself). */
export async function planTedIncremental(sql: DbSql, cfg: TedIncrementalConfig, now: Date) {
  const watermark = await readTedWatermark(sql);
  const day = watermark ?? (await latestArchivedTedDay(sql));
  const baseline = day ? { day, from: watermark ? ("watermark" as const) : ("raw" as const) } : null;
  return { baseline, window: baseline ? planTedWindow(baseline.day, bucharestToday(now), cfg) : null };
}

export async function runTedIncremental(deps: TedIncrementalDeps): Promise<TedIncrementalOutcome> {
  const { sql, client, meter, config: cfg } = deps;
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = deps.log ?? (() => {});
  const outcome: TedIncrementalOutcome = {
    status: "disabled", baseline: null, window: null, watermark: null, requests: 0,
    daysCompleted: 0, listed: 0, alreadyArchived: 0, inserted: 0, skipped: 0,
  };
  if (!cfg.enabled) return outcome;

  const startedAt = now();
  const { baseline, window } = await planTedIncremental(sql, cfg, startedAt);
  outcome.baseline = baseline;
  outcome.window = window;
  outcome.watermark = baseline?.from === "watermark" ? baseline.day : null;
  const [run] = await sql`insert into core.scrape_runs(source,window_start,window_end,status)
    values(${TED_INCREMENTAL_SOURCE},${window ? `${window.start}T00:00:00Z` : null},${window ? `${window.end}T23:59:59Z` : null},'running')
    returning id`;
  const finish = async (status: TedIncrementalStatus, error?: string) => {
    outcome.status = status;
    outcome.requests = meter.requests;
    if (error) outcome.error = error;
    const ok = status === "completed" || status === "bounded" || status === "up-to-date";
    await sql`update core.scrape_runs set status=${ok ? "completed" : "failed"},
      reported_total=${outcome.listed},fetched_count=${outcome.inserted + outcome.skipped},
      inserted_count=${outcome.inserted},skipped_count=${outcome.skipped + outcome.alreadyArchived},
      pages_fetched=${meter.requests},deviation=null,
      error=${error ? `${status}: ${error}` : status === "bounded" ? "bounded: budget reached, continues next night" : null},
      finished_at=now() where id=${run!.id}`;
    return outcome;
  };

  if (!baseline) return finish("no-baseline", "no TED eForms award notice in raw and no watermark; seed one window with scrape-ted first");
  if (!window) return finish("up-to-date");

  const request = tedRequester({
    cfg, meter, deadline: startedAt.getTime() + cfg.maxRuntimeMs, now: () => now().getTime(), sleep,
  });
  log(`ted-incremental: ${baseline.from} ${baseline.day}; searching ${window.start}..${window.end}`);

  try {
    for (let day = window.start; day <= window.end; day = addDays(day, 1)) {
      const docs: ArchivableDocument[] = [];
      let dayError: unknown = null;
      try {
        // 1. Every RO award notice published that day (complete or the day fails).
        const listed = new Map<string, TedNoticeSummary>();
        let total: number | null = null;
        for (let page = 1; ; page += 1) {
          if (page > MAX_PAGES_PER_DAY) throw new Error(`${day}: more than ${MAX_PAGES_PER_DAY} search pages`);
          const query = tedCountryWindowQuery({ country: COUNTRY, noticeType: NOTICE_TYPE, start: day, end: day });
          const res = await request(() => searchTedNotices(client, { query, page, limit: cfg.pageSize }));
          if (page === 1) total = res.totalNoticeCount ?? null;
          for (const n of res.notices) {
            const pubnum = tedPublicationNumber(n);
            if (!pubnum) throw new Error(`${day}: search result without publication-number`);
            listed.set(pubnum, n);
          }
          const pageFull = res.notices.length >= cfg.pageSize;
          if (res.notices.length === 0 || (total !== null ? listed.size >= total : !pageFull)) break;
          if (total === null) throw new Error(`${day}: TED did not report a total for a full page`);
        }
        if (total !== null && listed.size !== total) {
          throw new Error(`${day}: TED reported ${total} notices, ${listed.size} distinct listed`);
        }
        outcome.listed += listed.size;

        // 2. Skip notices already archived (overlap days, manual imports).
        const ids = [...listed.keys()].map((p) => `${NOTICE_TYPE}:${p}`);
        const known = ids.length
          ? new Set((await sql`select distinct external_id from raw.raw_documents where source='ted' and external_id in ${sql(ids)}`).map((r) => String(r.external_id)))
          : new Set<string>();
        outcome.alreadyArchived += known.size;

        // 3. Fetch the missing XML, sequentially. Only XML the nightly parser
        // reads back with the same publication number is archived, so a TED
        // format change cannot put a record into tonight's normalize quarantine.
        for (const [pubnum, n] of listed) {
          if (known.has(`${NOTICE_TYPE}:${pubnum}`)) continue;
          const xml = await request(() => fetchTedNoticeXml(client, pubnum));
          let parsed: string | null;
          try {
            parsed = extractTedNotice(xml).publicationNumber;
          } catch (err) {
            throw new Error(`${pubnum}: XML not readable by the TED parser (${message(err)})`);
          }
          if (parsed !== pubnum) throw new Error(`${pubnum}: XML carries publication number ${parsed ?? "none"}`);
          docs.push(tedArchiveDocument(n, pubnum, NOTICE_TYPE, xml));
        }
      } catch (err) {
        dayError = err;
      }

      // 4. Archive what was fetched; advance only past a fully successful day.
      await sql.begin(async (tx) => {
        const q = tx as unknown as DbSql;
        const archived = await archiveDocumentsSql(q, docs);
        outcome.inserted += archived.inserted;
        outcome.skipped += archived.skipped;
        if (!dayError && day > baseline.day) await advanceTedWatermark(q, window.start, day);
      });
      if (dayError) throw dayError;
      outcome.daysCompleted += 1;
      if (day > baseline.day) outcome.watermark = day;
      log(`ted-incremental: ${day} complete (+${docs.length} fetched, ${meter.requests} requests so far)`);
    }
  } catch (err) {
    if (err instanceof BudgetExhausted) {
      log(`ted-incremental: ${err.message}; watermark ${outcome.watermark ?? baseline.day}, continues next night`);
      return finish("bounded");
    }
    if (err instanceof RateLimited) {
      log(`ted-incremental: ${err.message}`);
      return finish("deferred", err.message);
    }
    log(`ted-incremental: failed: ${message(err)}`);
    return finish("failed", message(err));
  }
  return finish("completed");
}
