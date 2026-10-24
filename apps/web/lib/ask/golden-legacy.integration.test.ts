import { afterAll, describe, expect, it, vi } from "vitest";

// The routes append every request to the dev-session log unless it is off.
vi.hoisted(() => { process.env["SEAP_DEVLOG"] = "off"; });
// Vitest has no "@/" alias here: the ask route's modules, by their relative paths.
vi.mock("@/lib/ask/spec", () => import("./spec"));
vi.mock("@/lib/ask/question-ui", () => import("./question-ui"));
vi.mock("@/lib/ask/ground", () => import("./ground"));
vi.mock("@/lib/ask/compile", () => import("./compile"));
vi.mock("@/lib/ask/pills", () => import("./pills"));
vi.mock("@/lib/ask/llm", () => import("./llm"));
vi.mock("@/lib/ask/resolved-spec", () => import("./resolved-spec"));
vi.mock("@/lib/devlog", () => import("../devlog"));
vi.mock("@/lib/ask/features", () => import("./features"));

import { readFile, writeFile } from "node:fs/promises";
import { createDb, type DbSql } from "@seap/db";
import { POST as ask } from "../../app/api/ask/route";
import { POST as rows } from "../../app/api/ask/rows/route";
import { POST as csv } from "../../app/api/ask/rows/csv/route";
import { BLOCKS } from "./spec";
import type { BlockData } from "./compile";
import { inSavepoint, testDatabaseUrl, withAskFixture } from "./test-fixture";
import { legacyCorpus } from "./fixtures/legacy-corpus";
import { FIXTURE_IDENTITIES, seedGoldenFixture } from "./fixtures/golden-fixture";
import { GOLDEN_FORMAT, goldenJson, goldenRecord, type GoldenRecord, type SendRoute } from "./fixtures/golden-run";

/**
 * Plan §2.6, §6.2: the legacy-link corpus keeps its answers. Every entry runs
 * through /api/ask, /api/ask/rows and /api/ask/rows/csv on the synthetic
 * fixture; answers, sources and CSV must equal fixtures/golden-legacy.json.
 * A stage that changes a result on purpose regenerates the file
 * (GOLDEN_UPDATE=1, on a seap_test_* database) and the diff shows each change
 * next to its answer version. Never regenerate to make an unexplained diff pass.
 */

const url = testDatabaseUrl("Golden legacy links");
const connection = url ? createDb(url, { max: 1 }) : null;
afterAll(async () => { await connection?.sql.end(); });
const GOLDEN = new URL("./fixtures/golden-legacy.json", import.meta.url);
const g = globalThis as typeof globalThis & { __seapAskSql?: DbSql };
const handlers = { ask, rows, csv };

async function corpusRecords(): Promise<GoldenRecord[]> {
  return withAskFixture(connection!.sql, "golden_legacy", seedGoldenFixture, async (q) => {
    // Each request in its own savepoint: an engine error answers that request and leaves the fixture usable.
    const send: SendRoute = (route, body) => inSavepoint(q, async (db) => {
      g.__seapAskSql = db;
      const response = await handlers[route](new Request(`http://fixture/api/ask/${route}`, { method: "POST", body: JSON.stringify(body) }));
      return { status: response.status, headers: response.headers, text: await response.text() };
    });
    try {
      const records: GoldenRecord[] = [];
      for (const entry of legacyCorpus(FIXTURE_IDENTITIES)) records.push(await goldenRecord(entry, send));
      return records;
    } finally { delete g.__seapAskSql; }
  });
}

describe.runIf(Boolean(connection))("legacy links keep their answers (golden corpus, rollback fixture)", () => {
  let records: GoldenRecord[] = [];
  it("answers, sources and CSV of every corpus entry equal the golden file", async () => {
    records = await corpusRecords();
    if (process.env["GOLDEN_UPDATE"] === "1") {
      await writeFile(GOLDEN, goldenJson({ format: GOLDEN_FORMAT, fixture: "lib/ask/fixtures/golden-fixture.ts", records }) + "\n");
      return;
    }
    const golden = JSON.parse(await readFile(GOLDEN, "utf8")) as { format: string; records: GoldenRecord[] };
    expect(golden.format).toBe(GOLDEN_FORMAT);
    expect(records.map((r) => r.id)).toEqual(golden.records.map((r) => r.id));
    for (const record of records) expect.soft(record, record.id).toEqual(golden.records.find((r) => r.id === record.id));
  }, 240_000);

  it("covers all thirteen questions, and answer = sources = CSV wherever the answer counts its records", () => {
    const answered = records.filter((r) => r.answer["ok"] === true);
    expect(new Set(answered.map((r) => (r.answer["data"] as BlockData).block))).toEqual(new Set(BLOCKS));
    for (const r of answered) {
      const data = r.answer["data"] as BlockData;
      if (r.request.rows?.scope || r.sources["ok"] !== true) continue;
      const counted = data.block === "stat" ? data.stat.count
        : data.block === "fact_check" ? data.fact.count
        : data.block === "timeseries" ? data.series.reduce((n, p) => n + p.count, 0)
        : data.block === "map" ? data.counties.reduce((n, p) => n + p.count, 0)
        : data.block === "breakdown" ? data.slices.reduce((n, p) => n + p.count, 0) + data.other.count
        : null;
      if (counted !== null) expect.soft(r.sources["sourceTotal"], `${r.id}: records`).toBe(counted);
      if (r.csv["status"] === 200 && !r.request.rows) {
        expect.soft(r.csv["x-source-rows"], `${r.id}: CSV rows`).toBe(String(r.sources["sourceTotal"]));
        expect.soft(r.csv["x-source-value"], `${r.id}: CSV value`).toBe(r.sources["sourceValue"]);
      }
    }
  });
});
