import { afterAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { getSignalSources, numericSourceIds } from "./signal-sources";

describe("signal source identifiers", () => {
  it("accepts recorded decimal strings and deduplicates identical IDs", () => {
    expect(numericSourceIds(["12", "9", "12", 9, null, {}, "1 OR 1=1", "-7", "1.5", "", "1234567890123456789"])).toEqual(["12", "9"]);
    expect(numericSourceIds({ source_ids: ["12"] })).toEqual([]);
  });
  it.each(["", "-1", "1.1", "1 OR 1=1", "1234567890123456789", "Infinity"])("rejects malformed finding ID %s before querying", async (id) => {
    const fail = (() => { throw new Error("Database should not be queried"); }) as unknown as DbSql;
    await expect(getSignalSources(id, 0, fail)).resolves.toBeNull();
  });
});

type Fixture = {
  evidence?: Record<string, unknown>;
  /** Inject a JSON numeric literal without allowing JavaScript to round it first. */
  recordedNumericTotal?: string;
  das?: Record<string, unknown>[];
  contracts?: Record<string, unknown>[];
  competition?: Record<string, unknown>[];
  lots?: Record<string, unknown>[];
  notices?: Record<string, unknown>[];
};
let connection: DbSql | undefined;
afterAll(async () => { await connection?.end(); });

/**
 * Run the production SQL against CTE fixtures. Every query is SELECT-only and
 * the enclosing PostgreSQL transaction explicitly forbids writes. No temporary
 * tables or production-table rows are created/read/changed.
 * Opt in with: SEAP_READONLY_TESTS=1 pnpm --filter web exec vitest run lib/signal-sources.test.ts
 */
async function withFixture<T>(fixture: Fixture, run: (sql: DbSql) => Promise<T>): Promise<T> {
  connection ??= createDb().sql;
  return await connection.begin("isolation level repeatable read read only", async (transaction) => {
    const q = transaction as unknown as DbSql;
    const flag = [{ id: "99", flag_code: "da_split", period: "2022", methodology_version: "rf-2026.5", triggered: true,
      evidence: fixture.evidence ?? { source_ids: ["11", "22"], count: 2, total: "30.01", ceiling: "270120" } }];
    let flagJson = JSON.stringify(flag);
    if (fixture.recordedNumericTotal) {
      if (!/^\d+(\.\d+)?$/.test(fixture.recordedNumericTotal)) throw new Error("Unsafe fixture numeric literal");
      flagJson = flagJson.replace('"__RAW_TOTAL__"', fixture.recordedNumericTotal);
    }
    const sourceMap: Record<string, string> = {
      "core.flags": "fixture_flags", "core.direct_acquisitions": "fixture_das", "core.contracts": "fixture_contracts",
      "marts.contract_competition": "fixture_competition", "core.ted_lot_results": "fixture_lots", "core.ted_notices": "fixture_notices",
    };
    const adapter = ((chunks: TemplateStringsArray, ...params: unknown[]) => {
      const translated = chunks.map(chunk => chunk.replace(/\b(core\.(?:flags|direct_acquisitions|contracts|ted_lot_results|ted_notices)|marts\.contract_competition)\b/g,
        name => sourceMap[name]!));
      const statement = translated.join("?");
      if (/\b(insert|update|delete|truncate|drop|alter|create)\b/i.test(statement) || !/^\s*(select|with)\b/i.test(statement)) {
        throw new Error("Only SELECT queries are permitted in signal-source fixtures");
      }
      Object.defineProperty(translated, "raw", { value: translated.slice() });
      const query = (q as unknown as (strings: TemplateStringsArray, ...args: unknown[]) => ReturnType<DbSql>)(translated as unknown as TemplateStringsArray, ...params);
      return q`
        with fixture_flags as (select * from jsonb_to_recordset(${flagJson}::jsonb) as r(
          id bigint, flag_code text, period text, methodology_version text, triggered boolean, evidence jsonb)),
        fixture_das as (select * from jsonb_to_recordset(${JSON.stringify(fixture.das ?? [])}::jsonb) as r(
          id bigint, sicap_da_id bigint, da_code text, finalization_date timestamptz, publication_date timestamptz,
          closing_value numeric, cpv_code text, acquisition_type text, authority_entity_id bigint, supplier_entity_id bigint)),
        fixture_contracts as (select * from jsonb_to_recordset(${JSON.stringify(fixture.contracts ?? [])}::jsonb) as r(
          id bigint, ca_notice_contract_id bigint, contract_value numeric, currency text)),
        fixture_competition as (select * from jsonb_to_recordset(${JSON.stringify(fixture.competition ?? [])}::jsonb) as r(
          contract_id bigint, ted_lot_result_id bigint, tenders_received int, is_single_bidder boolean, match_score real)),
        fixture_lots as (select * from jsonb_to_recordset(${JSON.stringify(fixture.lots ?? [])}::jsonb) as r(
          id bigint, ted_notice_id bigint, lot_id text, tenders_received int)),
        fixture_notices as (select * from jsonb_to_recordset(${JSON.stringify(fixture.notices ?? [])}::jsonb) as r(
          id bigint, publication_number text))
        select * from (${query}) fixture_result
      `;
    }) as unknown as DbSql;
    Object.assign(adapter, { begin: async (_options: string, callback: (sql: DbSql) => Promise<unknown>) => callback(adapter) });
    return run(adapter);
  }) as T;
}

const da = (id: string, value: string, date = "2022-10-01") => ({ id, sicap_da_id: id, da_code: `DA${id}`,
  finalization_date: `${date}T10:00:00Z`, closing_value: value, cpv_code: "03111800-9",
  authority_entity_id: "1", supplier_entity_id: "2" });

describe.runIf(process.env["SEAP_READONLY_TESTS"] === "1")("signal evidence production SQL with isolated read-only fixtures", () => {
  it("uses the recorded membership, excluding extra transactions from the same pair/year", async () => {
    await withFixture({ das: [da("11", "10.005"), da("22", "20.005"), da("33", "999999")] }, async sql => {
      const result = await getSignalSources("99", 0, sql);
      expect(result?.sourceIds).toEqual(["11", "22"]);
      expect(result?.records.map(row => row.id)).toEqual(["11", "22"]);
      expect(result?.totalExact).toBe("30.010");
      expect(result?.found).toBe(2);
      expect(result?.reconciled).toBe(true);
    });
  });

  it("detects missing sources without silently substituting unrelated pair/year rows", async () => {
    await withFixture({ das: [da("11", "10.005"), da("33", "20.005")] }, async sql => {
      const result = await getSignalSources("99", 0, sql);
      expect(result?.sourceIds).toEqual(["11", "22"]);
      expect(result?.found).toBe(1);
      expect(result?.totalExact).toBe("10.005");
      expect(result?.reconciled).toBe(false);
      expect(result?.records.some(row => row.id === "33")).toBe(false);
      expect(result?.records.find(row => row.id === "22")).toMatchObject({ available: false, value: null });
    });
  });

  it("detects a corrected source amount despite an unchanged count", async () => {
    await withFixture({ das: [da("11", "10.005"), da("22", "20.006")] }, async sql => {
      const result = await getSignalSources("99", 0, sql);
      expect(result?.found).toBe(2);
      expect(result?.totalExact).toBe("30.011");
      expect(result?.reconciled).toBe(false);
    });
  });

  it("reconciles source and recorded numeric precision without JavaScript-number conversion", async () => {
    await withFixture({ evidence: { source_ids: ["11", "22"], count: 2, total: "__RAW_TOTAL__" }, recordedNumericTotal: "9007199254740993.03",
      das: [da("11", "9007199254740993.01"), da("22", "0.02")] }, async sql => {
      const result = await getSignalSources("99", 0, sql);
      expect(result?.totalExact).toBe("9007199254740993.03");
      expect(result?.recordedTotalExact).toBe("9007199254740993.03");
      expect(result?.reconciled).toBe(true);
    });
  });

  it("never calls a partially malformed membership reconciled", async () => {
    await withFixture({ evidence: { source_ids: ["11", "garbage"], count: 1, total: "10.005" }, das: [da("11", "10.005")] }, async sql => {
      const result = await getSignalSources("99", 0, sql);
      expect(result?.reconciled).toBe(false);
      expect(result?.records.map(row => row.id)).toEqual(["11"]);
    });
  });

  it("paginates stable recorded membership and clamps invalid or excessive pages", async () => {
    const ids = Array.from({ length: 51 }, (_, i) => String(i + 1));
    await withFixture({ evidence: { source_ids: ids, count: 51, total: "51" }, das: ids.map(id => da(id, "1")) }, async sql => {
      const first = await getSignalSources("99", Number.NaN, sql);
      const last = await getSignalSources("99", 999999, sql);
      expect(first?.page).toBe(0);
      expect(first?.records).toHaveLength(50);
      expect(last?.page).toBe(1);
      expect(last?.records.map(row => row.id)).toEqual(["51"]);
      expect(last?.totalExact).toBe("51");
      expect(last?.reconciled).toBe(true);
    });
  });

  it("handles malformed contract evidence without crashing", async () => {
    await withFixture({ evidence: { contracts: [null, 1, "bad", { contract_id: "1 OR 1=1", ted_lot_result_id: "3" }] } }, async sql => {
      const result = await getSignalSources("99", 0, sql);
      expect(result?.contracts).toEqual([]);
    });
  });

  it("preserves the exact recorded contract/lot pairs when current links have swapped", async () => {
    await withFixture({ evidence: { contracts: [
      { contract_id: "101", ted_lot_result_id: "201", tenders_received: 1 },
      { contract_id: "102", ted_lot_result_id: "202", tenders_received: 1 },
    ] }, contracts: [
      { id: "1", ca_notice_contract_id: "101", contract_value: "123.456789", currency: "RON" },
      { id: "2", ca_notice_contract_id: "102", contract_value: "456.01", currency: "EUR" },
    ], competition: [
      { contract_id: "1", ted_lot_result_id: "202", match_score: 0.95 },
      { contract_id: "2", ted_lot_result_id: "201", match_score: 0.95 },
    ], lots: [
      { id: "201", ted_notice_id: "301", lot_id: "LOT-1", tenders_received: 1 },
      { id: "202", ted_notice_id: "302", lot_id: "LOT-2", tenders_received: 1 },
    ], notices: [{ id: "301", publication_number: "111-2026" }, { id: "302", publication_number: "222-2026" }] }, async sql => {
      const result = await getSignalSources("99", 0, sql);
      expect(result?.contracts).toMatchObject([
        { id: "101", lot: "LOT-1", tedPublication: "111-2026", linked: false, available: true, value: "123.456789", currency: "RON" },
        { id: "102", lot: "LOT-2", tedPublication: "222-2026", linked: false, available: true, value: "456.01", currency: "EUR" },
      ]);
    });
  });

  it("retains missing contract IDs and exposes corrected lot counts", async () => {
    await withFixture({ evidence: { contracts: [
      { contract_id: "101", ted_lot_result_id: "201", tenders_received: 1 },
      { contract_id: "102", ted_lot_result_id: "202", tenders_received: 1 },
    ] }, contracts: [{ id: "1", ca_notice_contract_id: "101", contract_value: "40.01", currency: "RON" }],
      competition: [{ contract_id: "1", ted_lot_result_id: "201", match_score: 0.9 }],
      lots: [{ id: "201", ted_notice_id: "301", lot_id: "LOT-1", tenders_received: 2 }],
      notices: [{ id: "301", publication_number: "111-2026" }] }, async sql => {
      const result = await getSignalSources("99", 0, sql);
      expect(result?.contracts).toMatchObject([
        { id: "101", linked: true, available: true, tenders: 2 }, // Inclusive real 0.9 boundary; changed count remains visible.
        { id: "102", linked: false, available: false, value: null, tedPublication: null, tenders: null },
      ]);
    });
  });

  it("paginates missing membership IDs so their original SEAP links remain reachable", async () => {
    const ids = Array.from({ length: 51 }, (_, i) => String(i + 1));
    await withFixture({ evidence: { source_ids: ids, count: 51, total: "51" }, das: [da("1", "1")] }, async sql => {
      const result = await getSignalSources("99", 1, sql);
      expect(result?.page).toBe(1);
      expect(result?.found).toBe(1);
      expect(result?.records).toMatchObject([{ id: "51", available: false, value: null }]);
      expect(result?.reconciled).toBe(false);
    });
  });
});
