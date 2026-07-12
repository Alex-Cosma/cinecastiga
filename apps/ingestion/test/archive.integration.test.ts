import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, rawDocuments, scrapeRuns } from "@seap/db";
import {
  archiveDocuments,
  finishScrapeRun,
  startScrapeRun,
} from "../src/scrape/archive.js";

// Integration test — requires docker Postgres with migrations applied.

const TEST_SOURCE = "test:archive";

const { db, sql } = createDb();

async function cleanup() {
  await db.delete(rawDocuments).where(eq(rawDocuments.source, TEST_SOURCE));
  await db.delete(scrapeRuns).where(eq(scrapeRuns.source, TEST_SOURCE));
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await sql.end();
});

const docs = [
  {
    source: TEST_SOURCE,
    externalId: "tender:1001",
    endpointVersion: "tender-detail:v1",
    payload: {
      caNoticeId: 1001,
      contractTitle: "Achiziție echipamente",
      assignedCAUser: { name: "Ion Popescu", email: "ion@x.ro" },
      section: { contactPerson: "Maria", value: 42 },
    },
  },
  {
    source: TEST_SOURCE,
    externalId: "da:2002",
    endpointVersion: "da-detail:v1",
    payload: { directAcquisitionID: 2002, closingValue: 4999 },
  },
];

describe("archiveDocuments", () => {
  it("inserts fresh documents", async () => {
    const result = await archiveDocuments(db, docs);
    expect(result).toEqual({ inserted: 2, skipped: 0 });
  });

  it("re-archiving identical payloads skips everything", async () => {
    const result = await archiveDocuments(db, docs);
    expect(result).toEqual({ inserted: 0, skipped: 2 });
  });

  it("changed payload inserts a new version row", async () => {
    const changed = {
      ...docs[1]!,
      payload: { directAcquisitionID: 2002, closingValue: 5100 },
    };
    const result = await archiveDocuments(db, [changed]);
    expect(result).toEqual({ inserted: 1, skipped: 0 });
  });

  it("stored payloads verifiably lack PII fields", async () => {
    const [row] = await db
      .select()
      .from(rawDocuments)
      .where(eq(rawDocuments.externalId, "tender:1001"));
    const payload = row!.payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty("assignedCAUser");
    expect(payload["section"]).not.toHaveProperty("contactPerson");
    expect((payload["section"] as Record<string, unknown>)["value"]).toBe(42);
    expect(payload["contractTitle"]).toBe("Achiziție echipamente");
  });
});

describe("scrape runs", () => {
  it("records lifecycle with deviation math", async () => {
    const id = await startScrapeRun(db, {
      source: TEST_SOURCE,
      windowStart: new Date("2026-06-12"),
      windowEnd: new Date("2026-07-12"),
    });

    await finishScrapeRun(db, id, {
      status: "completed",
      reportedTotal: 100,
      fetchedCount: 98,
      insertedCount: 90,
      skippedCount: 8,
      pagesFetched: 1,
    });

    const [run] = await db.select().from(scrapeRuns).where(eq(scrapeRuns.id, id));
    expect(run!.status).toBe("completed");
    expect(run!.deviation).toBe(2);
    expect(run!.finishedAt).toBeInstanceOf(Date);
  });

  it("null reportedTotal (searchTooLong) yields null deviation", async () => {
    const id = await startScrapeRun(db, {
      source: TEST_SOURCE,
      windowStart: new Date("2026-07-01"),
      windowEnd: new Date("2026-07-01"),
    });
    await finishScrapeRun(db, id, {
      status: "failed",
      reportedTotal: null,
      fetchedCount: 2000,
      insertedCount: 2000,
      skippedCount: 0,
      pagesFetched: 20,
      error: "searchTooLong at leaf slice",
    });
    const [run] = await db.select().from(scrapeRuns).where(eq(scrapeRuns.id, id));
    expect(run!.deviation).toBeNull();
    expect(run!.error).toContain("searchTooLong");
  });
});
