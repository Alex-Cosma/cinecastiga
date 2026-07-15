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
import { scrapeDasByAuthority } from "../src/scrape/elicitatie/direct-acquisitions.js";
import { refetchOpenCorrections } from "../src/scrape/elicitatie/da-corrections.js";

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
  contractingAuthorityId: number;
}

interface DaMockConfig {
  records: DaRecord[];
  /** cap simulating the 2000-record window (small for tests) */
  cap: number;
  detailFor?: (id: number) => unknown;
}

function startDaMock(config: DaMockConfig): Promise<string> {
  server = createServer((req, res) => {
    let chunks = "";
    req.on("data", (c) => (chunks += c));
    req.on("end", () => {
      const url = req.url ?? "";
      res.setHeader("content-type", "application/json");

      if (
        url.startsWith("/api-pub/DirectAcquisitionCommon/GetDirectAcquisitionList/")
      ) {
        const body = JSON.parse(chunks) as {
          finalizationDateStart: string;
          finalizationDateEnd: string;
          pageIndex: number;
          pageSize: number;
          contractingAuthorityId: number | null;
        };
        const start = body.finalizationDateStart.slice(0, 10);
        const endDay = body.finalizationDateEnd.slice(0, 10);
        const matching = config.records.filter((r) => {
          const day = r.finalizationDate.slice(0, 10);
          if (day < start || day > endDay) return false;
          if (
            body.contractingAuthorityId !== null &&
            r.contractingAuthorityId !== body.contractingAuthorityId
          )
            return false;
          return true;
        });
        if (matching.length > config.cap) {
          res.end(
            JSON.stringify({ total: config.cap, items: [], searchTooLong: true }),
          );
          return;
        }
        const from = body.pageIndex * body.pageSize;
        res.end(
          JSON.stringify({
            total: matching.length,
            items: matching.slice(from, from + body.pageSize),
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

function makeClient(baseUrl: string) {
  return createElicitatieClient({
    baseUrl,
    userAgent: "test",
    minDelayMs: 0,
    maxRetries: 0,
  });
}

function record(id: number, day: string, authorityId: number): DaRecord {
  return {
    directAcquisitionId: id,
    finalizationDate: `${day}T01:30:00+03:00`,
    contractingAuthorityId: authorityId,
  };
}

const auth = (id: number): number => id; // inject authority ids directly
const FULL_YEAR = { start: "2025-01-01", end: "2025-12-31" };

async function resetState() {
  await db
    .delete(ingestionWatermarks)
    .where(eq(ingestionWatermarks.source, "elicitatie:das"));
}

async function daCursor(): Promise<{ lastId: number } | null> {
  const [row] = await db
    .select()
    .from(ingestionWatermarks)
    .where(eq(ingestionWatermarks.source, "elicitatie:das"));
  return row ? JSON.parse(row.cursor) : null;
}

describe("scrapeDasByAuthority", () => {
  it("scans authorities; lists archived; cursor advances", async () => {
    await resetState();
    const baseUrl = await startDaMock({
      records: [
        record(8800001, "2025-03-02", 501),
        record(8800002, "2025-06-10", 501),
        record(8800003, "2025-09-20", 502),
      ],
      cap: 100,
    });
    const outcome = await scrapeDasByAuthority(
      { db, client: makeClient(baseUrl) },
      { window: FULL_YEAR, authorities: [auth(501), auth(502)] },
    );
    expect(outcome.status).toBe("completed");
    expect(outcome.fetched).toBe(3);
    expect(outcome.inserted).toBe(3); // list-only (fetchDetail defaults off)
    expect(outcome.authoritiesRemaining).toBe(0);
    expect(await daCursor()).toEqual({ lastId: 502 });
  });

  it("authority overflow bisects the window by date until every leaf fits", async () => {
    await resetState();
    const baseUrl = await startDaMock({
      records: [
        record(8800011, "2025-02-15", 601),
        record(8800012, "2025-11-20", 601), // whole-year (2) overflows cap 1; halves fit
      ],
      cap: 1,
    });
    const outcome = await scrapeDasByAuthority(
      { db, client: makeClient(baseUrl) },
      { window: FULL_YEAR, authorities: [auth(601)] },
    );
    expect(outcome.status).toBe("completed");
    expect(outcome.fetched).toBe(2);
    expect(outcome.lost).toEqual([]);
  });

  it("a single day still over the cap for one authority is recorded as loss", async () => {
    await resetState();
    const day = "2025-05-05";
    const baseUrl = await startDaMock({
      records: [
        record(8800021, day, 701),
        record(8800022, day, 701),
        record(8800023, day, 701), // 3 on one day > cap 2, unrecoverable
      ],
      cap: 2,
    });
    const outcome = await scrapeDasByAuthority(
      { db, client: makeClient(baseUrl) },
      { window: FULL_YEAR, authorities: [auth(701)] },
    );
    expect(outcome.status).toBe("failed");
    expect(outcome.lost).toEqual(["701@2025-05-05"]);
    expect(outcome.error).toContain("data loss");
  });

  it("resumes from the watermark across chunked runs", async () => {
    await resetState();
    const baseUrl = await startDaMock({
      records: [
        record(8800031, "2025-04-01", 801),
        record(8800032, "2025-04-02", 802),
      ],
      cap: 100,
    });
    const client = makeClient(baseUrl);
    const authorities = [auth(801), auth(802)];

    const first = await scrapeDasByAuthority(
      { db, client },
      { window: FULL_YEAR, authorities, maxAuthoritiesPerRun: 1 },
    );
    expect(first.authoritiesProcessed).toBe(1);
    expect(first.authoritiesRemaining).toBe(1);
    expect(await daCursor()).toEqual({ lastId: 801 });

    const second = await scrapeDasByAuthority(
      { db, client },
      { window: FULL_YEAR, authorities, maxAuthoritiesPerRun: 1 },
    );
    expect(second.authoritiesProcessed).toBe(1);
    expect(second.authoritiesRemaining).toBe(0);
    expect(await daCursor()).toEqual({ lastId: 802 });
  });

  it("fetchDetail archives per-DA detail too", async () => {
    await resetState();
    const baseUrl = await startDaMock({
      records: [record(8800041, "2025-07-07", 901)],
      cap: 100,
    });
    const outcome = await scrapeDasByAuthority(
      { db, client: makeClient(baseUrl) },
      { window: FULL_YEAR, authorities: [auth(901)], fetchDetail: true },
    );
    expect(outcome.status).toBe("completed");
    expect(outcome.inserted).toBe(2); // 1 list + 1 detail
  });

  it("corrections: open-flagged detail re-fetched, changed payload archived as new version", async () => {
    await resetState();
    let servedValue = 111;
    const baseUrl = await startDaMock({
      records: [record(8800061, "2025-08-08", 1001)],
      cap: 100,
      detailFor: (id) => ({
        directAcquisitionID: id,
        closingValue: servedValue,
        isOpenForCorrection: true,
      }),
    });
    const client = makeClient(baseUrl);
    await scrapeDasByAuthority(
      { db, client },
      { window: FULL_YEAR, authorities: [auth(1001)], fetchDetail: true },
    );

    servedValue = 222; // correction closes with a different value
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
