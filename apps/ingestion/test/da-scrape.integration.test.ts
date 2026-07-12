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
import type { CpvCatalog } from "../src/scrape/elicitatie/cpv-catalog.js";
import { scrapeDaWindow } from "../src/scrape/elicitatie/direct-acquisitions.js";
import { refetchOpenCorrections } from "../src/scrape/elicitatie/da-corrections.js";
import { readWatermark } from "../src/scrape/watermark.js";

// Integration test — docker Postgres + mock SICAP DA server.
// Test DA ids live in the 88xxxxx range.

const { db, sql } = createDb();
const SOURCES = ["elicitatie:das", "elicitatie:da-corrections"];

async function cleanup() {
  await db
    .delete(rawDocuments)
    .where(
      and(
        eq(rawDocuments.source, "elicitatie"),
        like(rawDocuments.externalId, "da:88%"),
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

interface DaRecord {
  directAcquisitionId: number;
  finalizationDate: string;
  cpvCategoryId: number;
  cpvCodeId: number;
}

interface DaMockConfig {
  /** all records, keyed by day */
  recordsByDay: Record<string, DaRecord[]>;
  /** cap simulating the 2000-record window (small for tests) */
  cap: number;
  /** detail payload override per id */
  detailFor?: (id: number) => unknown;
}

function startDaMock(config: DaMockConfig): Promise<string> {
  server = createServer((req, res) => {
    let chunks = "";
    req.on("data", (c) => (chunks += c));
    req.on("end", () => {
      const url = req.url ?? "";
      res.setHeader("content-type", "application/json");

      if (url.startsWith("/api-pub/DirectAcquisitionCommon/GetDirectAcquisitionList/")) {
        const body = JSON.parse(chunks) as {
          finalizationDateStart: string;
          pageIndex: number;
          pageSize: number;
          cpvCategoryId: number | null;
          cpvCodeId: number | null;
        };
        let matching = config.recordsByDay[body.finalizationDateStart] ?? [];
        if (body.cpvCategoryId !== null)
          matching = matching.filter((r) => r.cpvCategoryId === body.cpvCategoryId);
        if (body.cpvCodeId !== null)
          matching = matching.filter((r) => r.cpvCodeId === body.cpvCodeId);

        if (matching.length > config.cap) {
          res.end(
            JSON.stringify({ total: config.cap, items: [], searchTooLong: true }),
          );
          return;
        }
        const start = body.pageIndex * body.pageSize;
        res.end(
          JSON.stringify({
            total: matching.length,
            items: matching.slice(start, start + body.pageSize),
            searchTooLong: false,
          }),
        );
        return;
      }

      if (url.startsWith("/api-pub/PublicDirectAcquisition/getView/")) {
        const id = Number(url.split("/").pop());
        const payload = config.detailFor?.(id) ?? {
          directAcquisitionID: id,
          closingValue: id * 10,
          isOpenForCorrection: false,
        };
        res.end(JSON.stringify(payload));
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

const catalog: CpvCatalog = {
  categories: async () => [1, 2],
  codesFor: async (categoryId) => [categoryId * 10 + 1, categoryId * 10 + 2],
};

function makeClient(baseUrl: string) {
  return createElicitatieClient({
    baseUrl,
    userAgent: "test",
    minDelayMs: 0,
    maxRetries: 0,
  });
}

function record(
  id: number,
  day: string,
  cpvCategoryId = 1,
  cpvCodeId = 11,
): DaRecord {
  return {
    directAcquisitionId: id,
    finalizationDate: `${day}T01:30:00+03:00`,
    cpvCategoryId,
    cpvCodeId,
  };
}

async function resetWatermark() {
  await db
    .delete(ingestionWatermarks)
    .where(eq(ingestionWatermarks.source, "elicitatie:das"));
}

describe("scrapeDaWindow", () => {
  it("quiet day: single slice, lists + details archived, deviation 0", async () => {
    const baseUrl = await startDaMock({
      recordsByDay: { "2026-07-05": [record(8800001, "2026-07-05"), record(8800002, "2026-07-05")] },
      cap: 100,
    });
    const outcome = await scrapeDaWindow(
      { db, client: makeClient(baseUrl), catalog },
      { window: { start: "2026-07-05", end: "2026-07-05" }, lookbackDays: 0 },
    );
    expect(outcome.status).toBe("completed");
    expect(outcome.fetched).toBe(2);
    expect(outcome.inserted).toBe(4); // 2 list + 2 detail
    expect(outcome.lostSlices).toEqual([]);

    const runs = await db
      .select()
      .from(scrapeRuns)
      .where(eq(scrapeRuns.source, "elicitatie:das"));
    expect(runs.at(-1)!.deviation).toBe(0);
  });

  it("overflow day fans out by category; totals reconcile", async () => {
    await resetWatermark();
    const day = "2026-07-01";
    const records = [
      record(8800011, day, 1, 11),
      record(8800012, day, 1, 12),
      record(8800013, day, 2, 21),
    ];
    const baseUrl = await startDaMock({
      recordsByDay: { [day]: records },
      cap: 2, // whole day (3) overflows; each category (2, 1) fits
    });
    const outcome = await scrapeDaWindow(
      { db, client: makeClient(baseUrl), catalog },
      { window: { start: day, end: day }, lookbackDays: 0 },
    );
    expect(outcome.status).toBe("completed");
    expect(outcome.fetched).toBe(3);
    expect(outcome.lostSlices).toEqual([]);
  });

  it("category overflow fans out by code", async () => {
    await resetWatermark();
    const day = "2026-07-02";
    const records = [
      record(8800021, day, 1, 11),
      record(8800022, day, 1, 11),
      record(8800023, day, 1, 12),
      record(8800024, day, 2, 21),
    ];
    const baseUrl = await startDaMock({
      recordsByDay: { [day]: records },
      cap: 2, // day (4) overflows; cat1 (3) overflows; codes (2,1) fit; cat2 (1) fits
    });
    const outcome = await scrapeDaWindow(
      { db, client: makeClient(baseUrl), catalog },
      { window: { start: day, end: day }, lookbackDays: 0 },
    );
    expect(outcome.status).toBe("completed");
    expect(outcome.fetched).toBe(4);
  });

  it("leaf overflow records data loss but other slices complete", async () => {
    await resetWatermark();
    const day = "2026-07-03";
    const records = [
      record(8800031, day, 1, 11),
      record(8800032, day, 1, 11),
      record(8800033, day, 1, 11), // code 11 overflows the cap of 2
      record(8800034, day, 2, 21),
    ];
    const baseUrl = await startDaMock({
      recordsByDay: { [day]: records },
      cap: 2,
    });
    const outcome = await scrapeDaWindow(
      { db, client: makeClient(baseUrl), catalog },
      { window: { start: day, end: day }, lookbackDays: 0 },
    );
    expect(outcome.status).toBe("failed");
    expect(outcome.lostSlices).toEqual(["c1:k11"]);
    expect(outcome.error).toContain("data loss");
    // the healthy slice still archived
    expect(outcome.fetched).toBeGreaterThanOrEqual(1);

    const runs = await db
      .select()
      .from(scrapeRuns)
      .where(eq(scrapeRuns.source, "elicitatie:das"));
    expect(runs.at(-1)!.error).toContain("c1:k11");
  });

  it("lookback re-covers trailing days idempotently", async () => {
    await resetWatermark();
    const baseUrl = await startDaMock({
      recordsByDay: {
        "2026-07-04": [record(8800041, "2026-07-04")],
        "2026-07-05": [record(8800001, "2026-07-05"), record(8800002, "2026-07-05")],
      },
      cap: 100,
    });
    // window start 2026-07-05 with lookback 1 → covers 07-04 too;
    // 07-05 records already archived by the first test → skipped
    const outcome = await scrapeDaWindow(
      { db, client: makeClient(baseUrl), catalog },
      { window: { start: "2026-07-05", end: "2026-07-05" }, lookbackDays: 1 },
    );
    expect(outcome.status).toBe("completed");
    expect(outcome.fetched).toBe(3);
    expect(outcome.inserted).toBe(2); // only 8800041 list+detail are new
    expect(outcome.skipped).toBe(4);

    const cursor = await readWatermark(db, "elicitatie:das");
    expect(cursor!.day).toBe("2026-07-06");
  });

  it("corrections: open-flagged detail re-fetched, changed payload archived as new version", async () => {
    // seed: archive a detail with isOpenForCorrection=true via a scrape
    await resetWatermark();
    const day = "2026-07-06";
    let servedValue = 111;
    const baseUrl = await startDaMock({
      recordsByDay: { [day]: [record(8800061, day)] },
      cap: 100,
      detailFor: (id) => ({
        directAcquisitionID: id,
        closingValue: servedValue,
        isOpenForCorrection: true,
      }),
    });
    const client = makeClient(baseUrl);
    await scrapeDaWindow(
      { db, client, catalog },
      { window: { start: day, end: day }, lookbackDays: 0 },
    );

    // correction closes with a different value
    servedValue = 222;
    const result = await refetchOpenCorrections({ db, client }, { days: 7 });
    expect(result.candidates).toBe(1);
    expect(result.inserted).toBe(1);

    const versions = await db
      .select()
      .from(rawDocuments)
      .where(
        and(
          eq(rawDocuments.externalId, "da:8800061"),
          eq(rawDocuments.endpointVersion, "da-detail:v1"),
        ),
      );
    expect(versions).toHaveLength(2);
  });
});
