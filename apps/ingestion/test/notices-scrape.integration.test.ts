import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { and, eq, inArray, like } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createDb,
  ingestionWatermarks,
  rawDocuments,
  scrapeRuns,
} from "@seap/db";
import { createElicitatieClient } from "@seap/scraper-clients";
import { scrapeNoticesWindow } from "../src/scrape/elicitatie/notices.js";
import { readWatermark } from "../src/scrape/watermark.js";

// Integration test — docker Postgres + mock SICAP server.
// NOTE: resets the elicitatie:tenders/awards watermarks and deletes test
// notice ids (99xxxxx range) — a later live re-scan is idempotent/harmless.

const { db, sql } = createDb();
const WINDOW = { start: "2026-07-01", end: "2026-07-02" };
const SOURCES = ["elicitatie:tenders", "elicitatie:awards"];

async function cleanup() {
  await db
    .delete(rawDocuments)
    .where(
      and(
        eq(rawDocuments.source, "elicitatie"),
        like(rawDocuments.externalId, "%:99%"),
      ),
    );
  await db
    .delete(ingestionWatermarks)
    .where(inArray(ingestionWatermarks.source, SOURCES));
  await db.delete(scrapeRuns).where(inArray(scrapeRuns.source, SOURCES));
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await sql.end();
});

let server: Server | undefined;
afterEach(async () => {
  if (server) {
    await new Promise((resolve) => server!.close(resolve));
    server = undefined;
  }
});

interface MockConfig {
  /** items per day, keyed by IsoDate (cNoticeId mirrors live participation lists) */
  itemsByDay: Record<
    string,
    Array<{ caNoticeId?: number; cNoticeId?: number; publicationDate: string }>
  >;
  /** 500 every list request for this (day, pageIndex) */
  failAt?: { day: string; page: number } | null;
  contractsTotal?: number;
}

function startMockSicap(config: MockConfig): Promise<string> {
  server = createServer((req, res) => {
    let chunks = "";
    req.on("data", (c) => (chunks += c));
    req.on("end", () => {
      const url = req.url ?? "";
      res.setHeader("content-type", "application/json");

      if (url.startsWith("/api-pub/NoticeCommon/")) {
        const body = JSON.parse(chunks) as {
          startPublicationDate: string;
          pageIndex: number;
          pageSize: number;
        };
        const day = body.startPublicationDate;
        if (
          config.failAt &&
          config.failAt.day === day &&
          config.failAt.page === body.pageIndex
        ) {
          res.statusCode = 500;
          res.end();
          return;
        }
        const all = config.itemsByDay[day] ?? [];
        const startIdx = body.pageIndex * body.pageSize;
        const items = all.slice(startIdx, startIdx + body.pageSize);
        res.end(
          JSON.stringify({ total: all.length, items, searchTooLong: false }),
        );
        return;
      }

      if (url.startsWith("/api-pub/C_PUBLIC_CANotice/get/")) {
        const id = Number(url.split("/").pop());
        res.end(
          JSON.stringify({
            caNoticeEdit_New: { id, title: `Detail ${id}` },
            assignedCAUser: { email: "pii@x.ro" },
          }),
        );
        return;
      }

      if (url === "/api-pub/C_PUBLIC_CANotice/GetCANoticeContracts") {
        const body = JSON.parse(chunks) as { skip: number; take: number };
        const total = config.contractsTotal ?? 1;
        const count = Math.max(0, Math.min(body.take, total - body.skip));
        const items = Array.from({ length: count }, (_, i) => ({
          contractId: body.skip + i + 1,
          contractValue: 1000,
        }));
        res.end(JSON.stringify({ total, items }));
        return;
      }

      res.statusCode = 404;
      res.end("{}");
    });
  });
  return new Promise((resolve) => {
    server!.listen(0, "127.0.0.1", () => {
      const { port } = server!.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

function makeClient(baseUrl: string, maxRetries = 0) {
  return createElicitatieClient({
    baseUrl,
    userAgent: "seap-analytics-test/0.1",
    minDelayMs: 0,
    maxRetries,
  });
}

// Participation lists key items as cNoticeId (live-verified 2026-07-12)
const day1Items = [
  { cNoticeId: 9900001, publicationDate: "2026-07-01T09:00:00+03:00" },
  { cNoticeId: 9900002, publicationDate: "2026-07-01T10:00:00+03:00" },
  { cNoticeId: 9900003, publicationDate: "2026-07-01T11:00:00+03:00" },
];
const day2Items = [
  { cNoticeId: 9900004, publicationDate: "2026-07-02T09:00:00+03:00" },
];

describe("scrapeNoticesWindow", () => {
  it("archives a full window: lists + details, run completed, watermark advanced", async () => {
    const baseUrl = await startMockSicap({
      itemsByDay: { "2026-07-01": day1Items, "2026-07-02": day2Items },
    });
    const outcome = await scrapeNoticesWindow(
      { db, client: makeClient(baseUrl) },
      { family: "tenders", window: WINDOW, pageSize: 2 },
    );

    expect(outcome.status).toBe("completed");
    expect(outcome.fetched).toBe(4);
    expect(outcome.inserted).toBe(8); // 4 list rows + 4 detail rows
    expect(outcome.pages).toBe(3); // 2 + 1

    const [run] = await db
      .select()
      .from(scrapeRuns)
      .where(eq(scrapeRuns.source, "elicitatie:tenders"));
    expect(run!.status).toBe("completed");
    expect(run!.deviation).toBe(0);

    const cursor = await readWatermark(db, "elicitatie:tenders");
    expect(cursor).toEqual({
      windowStart: WINDOW.start,
      day: "2026-07-03",
      page: 0,
    });

    // PII stripped from archived detail
    const [detail] = await db
      .select()
      .from(rawDocuments)
      .where(
        and(
          eq(rawDocuments.externalId, "tender:9900001"),
          eq(rawDocuments.endpointVersion, "tender-detail:v1"),
        ),
      );
    expect(detail!.payload).not.toHaveProperty("assignedCAUser");
  });

  it("re-running the same window after watermark reset skips everything", async () => {
    await db
      .delete(ingestionWatermarks)
      .where(eq(ingestionWatermarks.source, "elicitatie:tenders"));
    const baseUrl = await startMockSicap({
      itemsByDay: { "2026-07-01": day1Items, "2026-07-02": day2Items },
    });
    const outcome = await scrapeNoticesWindow(
      { db, client: makeClient(baseUrl) },
      { family: "tenders", window: WINDOW, pageSize: 2 },
    );
    expect(outcome.status).toBe("completed");
    expect(outcome.fetched).toBe(4);
    expect(outcome.inserted).toBe(0);
    expect(outcome.skipped).toBe(8);
  });

  it("kill/resume: failure mid-window resumes from watermark with no gap", async () => {
    await db
      .delete(ingestionWatermarks)
      .where(eq(ingestionWatermarks.source, "elicitatie:tenders"));
    await db
      .delete(rawDocuments)
      .where(like(rawDocuments.externalId, "tender:99%"));

    // First run: page 1 of day 1 hard-fails
    const failingUrl = await startMockSicap({
      itemsByDay: { "2026-07-01": day1Items, "2026-07-02": day2Items },
      failAt: { day: "2026-07-01", page: 1 },
    });
    const first = await scrapeNoticesWindow(
      { db, client: makeClient(failingUrl) },
      { family: "tenders", window: WINDOW, pageSize: 2 },
    );
    expect(first.status).toBe("failed");
    expect(first.pages).toBe(1);

    let cursor = await readWatermark(db, "elicitatie:tenders");
    expect(cursor).toEqual({ windowStart: WINDOW.start, day: "2026-07-01", page: 1 });

    await new Promise((resolve) => server!.close(resolve));
    server = undefined;

    // Second run: healthy server — resumes at day1 page1
    const healthyUrl = await startMockSicap({
      itemsByDay: { "2026-07-01": day1Items, "2026-07-02": day2Items },
    });
    const second = await scrapeNoticesWindow(
      { db, client: makeClient(healthyUrl) },
      { family: "tenders", window: WINDOW, pageSize: 2 },
    );
    expect(second.status).toBe("completed");

    // No gap: every notice archived exactly once per document kind
    const rows = await db
      .select({ externalId: rawDocuments.externalId })
      .from(rawDocuments)
      .where(
        and(
          eq(rawDocuments.endpointVersion, "tender-list:v1"),
          like(rawDocuments.externalId, "tender:99%"),
        ),
      );
    const ids = rows.map((r) => r.externalId).sort();
    expect(ids).toEqual([
      "tender:9900001",
      "tender:9900002",
      "tender:9900003",
      "tender:9900004",
    ]);

    cursor = await readWatermark(db, "elicitatie:tenders");
    expect(cursor!.day).toBe("2026-07-03");
  });

  it("invariant violation aborts without advancing the cursor", async () => {
    await db
      .delete(ingestionWatermarks)
      .where(eq(ingestionWatermarks.source, "elicitatie:tenders"));
    const baseUrl = await startMockSicap({
      itemsByDay: {
        "2026-07-01": [
          // out-of-window item: filter-echo violation
          { caNoticeId: 9900009, publicationDate: "2019-05-05T09:00:00+03:00" },
        ],
      },
    });
    const outcome = await scrapeNoticesWindow(
      { db, client: makeClient(baseUrl) },
      { family: "tenders", window: WINDOW, pageSize: 2 },
    );
    expect(outcome.status).toBe("failed");
    expect(outcome.error).toContain("filter-echo violation");

    const cursor = await readWatermark(db, "elicitatie:tenders");
    expect(cursor).toBeNull();

    const runs = await db
      .select()
      .from(scrapeRuns)
      .where(eq(scrapeRuns.source, "elicitatie:tenders"));
    const failed = runs.filter((r) => r.status === "failed");
    expect(failed.some((r) => r.error?.includes("filter-echo"))).toBe(true);
  });

  it("awards fetch contracts via skip/take pagination", async () => {
    const baseUrl = await startMockSicap({
      itemsByDay: {
        "2026-07-01": [
          { caNoticeId: 9900021, publicationDate: "2026-07-01T09:00:00+03:00" },
        ],
      },
      contractsTotal: 250,
    });
    const outcome = await scrapeNoticesWindow(
      { db, client: makeClient(baseUrl) },
      { family: "awards", window: { start: "2026-07-01", end: "2026-07-01" } },
    );
    expect(outcome.status).toBe("completed");

    const [contractsRow] = await db
      .select()
      .from(rawDocuments)
      .where(
        and(
          eq(rawDocuments.externalId, "award:9900021"),
          eq(rawDocuments.endpointVersion, "award-contracts:v1"),
        ),
      );
    const payload = contractsRow!.payload as { total: number; items: unknown[] };
    expect(payload.total).toBe(250);
    expect(payload.items).toHaveLength(250); // required both skip/take calls
  });
});
