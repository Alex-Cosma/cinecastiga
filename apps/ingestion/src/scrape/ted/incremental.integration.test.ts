import { readFileSync } from "node:fs";
import { createDb, detectOperationalAlerts } from "@seap/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { archiveDocumentsSql } from "../archive.js";
import {
  createTedIncrementalClient,
  runTedIncremental,
  TED_INCREMENTAL_DEFAULTS,
  type TedIncrementalConfig,
  type TedRequestMeter,
} from "./incremental.js";

// Writes raw/core rows: only a dedicated seap_test_* database, never the default.
const url = process.env.TEST_DATABASE_URL;
if (url && !/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1))) throw Error("Dedicated test database required");
const connection = url ? createDb(url, { max: 4 }) : null;

const FIXTURE = readFileSync(new URL("../../../test/fixtures/ted-298320-2026.xml", import.meta.url), "utf8");
const xmlFor = (pubnum: string, day: string) => {
  const [n, y] = pubnum.split("-");
  return FIXTURE.replace("00298320-2026", `${n!.padStart(8, "0")}-${y}`).replace("2026-04-30+02:00", `${day}+02:00`);
};

type Behaviour = number | { status: number; retryAfter?: string } | "mismatch";

/** Offline TED: search per publication day + per-notice XML. Never reaches the network. */
function mockTed(days: Record<string, string[]>) {
  const searches: string[] = [];
  const xml: string[] = [];
  const failSearch: Behaviour[] = [];
  const failXml = new Map<string, Behaviour>();
  const respond = (b: Behaviour) => typeof b === "number"
    ? new Response("error", { status: b })
    : b === "mismatch" ? null : new Response("error", { status: b.status, headers: b.retryAfter ? { "retry-after": b.retryAfter } : {} });
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const u = new URL(String(input));
    if (u.host === "api.ted.europa.eu" && u.pathname === "/v3/notices/search") {
      const body = JSON.parse(String(init?.body)) as { query: string; page: number; limit: number };
      const d = /publication-date>=(\d{4})(\d{2})(\d{2})/.exec(body.query)!;
      const day = `${d[1]}-${d[2]}-${d[3]}`;
      searches.push(`${day}#${body.page}`);
      const fail = failSearch.shift();
      if (fail !== undefined) return respond(fail)!;
      const all = days[day] ?? [];
      const page = all.slice((body.page - 1) * body.limit, body.page * body.limit);
      return Response.json({
        totalNoticeCount: all.length,
        notices: page.map((p) => ({ "publication-number": p, "publication-date": `${day}+02:00`, "notice-type": "can-standard" })),
      });
    }
    const m = /^\/en\/notice\/(\d+-\d{4})\/xml$/.exec(u.pathname);
    if (u.host === "ted.europa.eu" && m) {
      const pubnum = m[1]!;
      xml.push(pubnum);
      const day = Object.entries(days).find(([, list]) => list.includes(pubnum))?.[0] ?? "2026-01-01";
      const fail = failXml.get(pubnum);
      if (fail === "mismatch") return new Response(xmlFor("999999-2026", day));
      if (fail !== undefined) return respond(fail)!;
      return new Response(xmlFor(pubnum, day));
    }
    throw Error(`unexpected request ${u}`);
  };
  return { fetch, searches, xml, failSearch, failXml };
}

const config = (o: Partial<TedIncrementalConfig> = {}): TedIncrementalConfig =>
  ({ ...TED_INCREMENTAL_DEFAULTS, enabled: true, delayMs: 0, ...o });

async function runOnce(ted: ReturnType<typeof mockTed>, today: string, o: Partial<TedIncrementalConfig> = {}) {
  const meter: TedRequestMeter = { requests: 0, retryAfterMs: null };
  const cfg = config(o);
  const client = createTedIncrementalClient(cfg, meter, { userAgent: "seap-test", fetch: ted.fetch });
  const sleeps: number[] = [];
  const outcome = await runTedIncremental({
    sql: connection!.sql, client, meter, config: cfg,
    now: () => new Date(`${today}T03:00:00Z`), sleep: async (ms) => { sleeps.push(ms); },
  });
  return { outcome, sleeps };
}

const watermark = async () => (await connection!.sql`select cursor::jsonb->>'day' as day from core.ingestion_watermarks where source='ted:incremental'`)[0]?.day ?? null;
const archived = async () => (await connection!.sql`select external_id from raw.raw_documents where source='ted' order by external_id`).map((r) => String(r.external_id));
const runs = async () => connection!.sql`select status,error,inserted_count from core.scrape_runs where source='ted:incremental' order by id`;
const tedAlerts = async () => (await detectOperationalAlerts(connection!.sql, "https://example.invalid")).filter((a) => a.kind === "ted-import-failing");

async function cleanup() {
  const q = connection!.sql;
  await q`delete from raw.raw_documents where source='ted'`;
  await q`delete from core.ingestion_watermarks where source='ted:incremental'`;
  await q`delete from core.scrape_runs where source='ted:incremental'`;
}

/** Bulk-imported shape: the publication date only inside the XML. */
async function seedArchive(pubnum: string, day: string) {
  await archiveDocumentsSql(connection!.sql, [{
    source: "ted", externalId: `can-standard:${pubnum}`, endpointVersion: "ted-eforms:v1",
    payload: { "publication-number": pubnum, "notice-type": "can-standard", xml: xmlFor(pubnum, day) },
  }]);
}

// Publication days after the archived baseline (10 October); 11-12 is a weekend.
const DAYS: Record<string, string[]> = {
  "2026-10-08": ["90-2026"],
  "2026-10-09": ["95-2026", "96-2026"],
  "2026-10-10": ["100-2026", "101-2026"],
  "2026-10-13": ["110-2026", "111-2026", "112-2026"],
  "2026-10-14": ["120-2026"],
  "2026-10-15": ["130-2026", "131-2026"],
};

describe.skipIf(!connection)("automatic TED import", () => {
  beforeEach(async () => {
    await cleanup();
    await seedArchive("50-2026", "2026-09-01");
    for (const p of ["90-2026", "95-2026", "96-2026", "100-2026"]) await seedArchive(p, p === "90-2026" ? "2026-10-08" : p === "100-2026" ? "2026-10-10" : "2026-10-09");
  });
  afterAll(async () => { await cleanup(); await connection?.sql.end(); });

  it("starts from the latest archived publication day and advances only after full success", async () => {
    const ted = mockTed(DAYS);
    const { outcome } = await runOnce(ted, "2026-10-16");
    expect(outcome).toMatchObject({
      status: "completed", baseline: { day: "2026-10-10", from: "raw" },
      window: { start: "2026-10-08", end: "2026-10-15" }, watermark: "2026-10-15", inserted: 7, daysCompleted: 8,
    });
    // Overlap days were searched again; their archived notices were not fetched again.
    expect(ted.searches).toEqual(["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"].map((d) => `${d}#1`));
    expect(ted.xml).toEqual(["101-2026", "110-2026", "111-2026", "112-2026", "120-2026", "130-2026", "131-2026"]);
    expect(await watermark()).toBe("2026-10-15");
    expect(await runs()).toEqual([expect.objectContaining({ status: "completed", error: null, inserted_count: 7 })]);
  });

  it("is idempotent across overlapping runs and quiet once up to date", async () => {
    const ted = mockTed({ ...DAYS, "2026-10-16": ["140-2026"] });
    await runOnce(ted, "2026-10-16");
    const before = (await archived()).length;
    ted.xml.length = 0;
    const next = await runOnce(ted, "2026-10-17");
    expect(next.outcome).toMatchObject({ status: "completed", window: { start: "2026-10-13", end: "2026-10-16" }, alreadyArchived: 6, inserted: 1 });
    expect(ted.xml).toEqual(["140-2026"]);
    expect(await archived()).toHaveLength(before + 1);
    // Same night again: nothing to search, no request at all.
    ted.searches.length = 0;
    const again = await runOnce(ted, "2026-10-17");
    expect(again.outcome).toMatchObject({ status: "up-to-date", requests: 0 });
    expect(ted.searches).toEqual([]);
    // A forced re-search of archived days refetches nothing; the content hash keeps raw unique.
    await connection!.sql`update core.ingestion_watermarks set cursor='{"windowStart":"2026-10-01","day":"2026-10-10","page":0}' where source='ted:incremental'`;
    const replay = await runOnce(ted, "2026-10-17");
    expect(replay.outcome).toMatchObject({ status: "completed", inserted: 0, watermark: "2026-10-16" });
    expect(ted.xml).toEqual(["140-2026"]);
    expect(await archived()).toHaveLength(before + 1);
  });

  it("is bounded per run and converges over several nights without refetching", async () => {
    const ted = mockTed(DAYS);
    // Night 1: 3 overlap searches + XML 101 + 10-11, 10-12 + 10-13 search + XML 110 = 8; 111 is over budget.
    const first = await runOnce(ted, "2026-10-16", { maxRequests: 8 });
    expect(first.outcome).toMatchObject({ status: "bounded", watermark: "2026-10-12", requests: 8 });
    expect(await watermark()).toBe("2026-10-12");
    // The partial day's fetched notice is kept for tonight's normalize.
    expect(await archived()).toContain("can-standard:101-2026");
    expect(await archived()).toContain("can-standard:110-2026");
    expect((await runs())[0]).toMatchObject({ status: "completed", error: expect.stringMatching(/^bounded/) });
    let nights = 1, last = first.outcome.status;
    while (last !== "completed" && nights < 10) { last = (await runOnce(ted, "2026-10-16", { maxRequests: 8 })).outcome.status; nights += 1; }
    expect(last).toBe("completed");
    expect(nights).toBe(3);
    expect(await watermark()).toBe("2026-10-15");
    expect(ted.xml.sort()).toEqual(["101-2026", "110-2026", "111-2026", "112-2026", "120-2026", "130-2026", "131-2026"].sort());
  });

  it("keeps the watermark at the last complete day when a notice fails or is unreadable", async () => {
    const ted = mockTed(DAYS);
    ted.failXml.set("111-2026", 500);
    const failed = await runOnce(ted, "2026-10-16");
    expect(failed.outcome).toMatchObject({ status: "failed", watermark: "2026-10-12" });
    expect(failed.outcome.error).toMatch(/500/);
    expect(await watermark()).toBe("2026-10-12");
    expect(await archived()).toContain("can-standard:110-2026");
    expect(await archived()).not.toContain("can-standard:111-2026");
    expect((await runs()).at(-1)).toMatchObject({ status: "failed" });

    ted.failXml.set("111-2026", "mismatch");
    const unreadable = await runOnce(ted, "2026-10-16");
    expect(unreadable.outcome).toMatchObject({ status: "failed", watermark: "2026-10-12" });
    expect(unreadable.outcome.error).toMatch(/111-2026: XML carries publication number 999999-2026/);
    expect(await archived()).not.toContain("can-standard:111-2026");

    ted.failXml.clear();
    ted.xml.length = 0;
    const recovered = await runOnce(ted, "2026-10-16");
    expect(recovered.outcome).toMatchObject({ status: "completed", watermark: "2026-10-15" });
    expect(ted.xml).toEqual(["111-2026", "112-2026", "120-2026", "130-2026", "131-2026"]);
  });

  it("defers quietly on 429 and alerts only after repeated unsuccessful nights", async () => {
    const ted = mockTed(DAYS);
    ted.failSearch.push({ status: 429, retryAfter: "120" });
    const deferred = await runOnce(ted, "2026-10-16");
    expect(deferred.outcome).toMatchObject({ status: "deferred", requests: 1, watermark: null });
    expect(deferred.sleeps).toEqual([]);
    expect(await watermark()).toBeNull();
    expect(await tedAlerts()).toEqual([]);

    // A short Retry-After is honoured once, then the night completes.
    ted.failSearch.push({ status: 429, retryAfter: "2" });
    const waited = await runOnce(ted, "2026-10-16", { maxDaysPerRun: 1 });
    expect(waited.sleeps).toEqual([2_000]);
    expect(waited.outcome).toMatchObject({ status: "completed", watermark: "2026-10-11" });

    for (let i = 0; i < 3; i++) ted.failSearch.push({ status: 429 }, { status: 429 });
    for (let i = 0; i < 2; i++) expect((await runOnce(ted, "2026-10-16")).outcome.status).toBe("deferred");
    expect(await tedAlerts()).toEqual([]);
    expect((await runOnce(ted, "2026-10-16")).outcome.status).toBe("deferred");
    const alerts = await tedAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.subject).toContain("de 3 ori la rând");
    expect(alerts[0]!.body).toContain("2026-10-11");
    expect(alerts[0]!.body).toContain("TED_INCREMENTAL=off");
    // A successful night ends the streak.
    expect((await runOnce(ted, "2026-10-16")).outcome.status).toBe("completed");
    expect(await tedAlerts()).toEqual([]);
  });

  it("refuses to guess history when raw has no TED baseline", async () => {
    await cleanup();
    const ted = mockTed(DAYS);
    const { outcome } = await runOnce(ted, "2026-10-16");
    expect(outcome).toMatchObject({ status: "no-baseline", requests: 0 });
    expect(ted.searches).toEqual([]);
  });
});
