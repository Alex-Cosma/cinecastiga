import { afterAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { runCoverage } from "./coverage.js";
import { TED_NORMALIZATION_VERSION } from "./ted.js";

const { sql } = createDb();
afterAll(() => sql.end());
let fixtureSequence = 0;

/** Qualified writes can only reach unique fixture schemas in an uncommitted
 * outer transaction. No production tables, rows or sequences are modified.
 * Nested runCoverage transactions become savepoints at the same isolation.
 */
function isolatedSql(connection: DbSql, prefix: string): DbSql {
  const rewrite = (text: string) => text.replace(/\b(core|marts)\./g, `${prefix}_$1.`);
  const scoped = ((chunks: TemplateStringsArray, ...values: unknown[]) => {
    const mapped = chunks.map(rewrite);
    Object.defineProperty(mapped, "raw", { value: chunks.raw.map(rewrite) });
    return connection(mapped as unknown as TemplateStringsArray, ...values as never[]);
  }) as unknown as DbSql;
  Object.assign(scoped, {
    begin: (options: string, run: (q: DbSql) => Promise<unknown>) => {
      expect(options).toBe("isolation level repeatable read");
      return (connection as unknown as { savepoint: (fn: (q: DbSql) => Promise<unknown>) => Promise<unknown> })
        .savepoint(q => run(isolatedSql(q, prefix)));
    },
  });
  return scoped;
}

async function fixture(run: (q: DbSql) => Promise<void>) {
  const prefix = `coverage_fixture_${process.pid}_${Date.now()}_${++fixtureSequence}`;
  const rollback = new Error("ROLL BACK COVERAGE FIXTURE");
  try {
    await sql.begin("isolation level repeatable read", async (transaction) => {
      await transaction.unsafe(`create schema ${prefix}_core`);
      await transaction.unsafe(`create schema ${prefix}_marts`);
      const q = isolatedSql(transaction as unknown as DbSql, prefix);
      await q`create table core.direct_acquisitions (
        state text, closing_value numeric, finalization_date timestamptz, cpv_code text, raw_id bigint)`;
      await q`create table core.contracts (contract_date timestamptz, cpv_code text, currency text)`;
      await q`create table core.ted_notices (publication_date timestamptz, cpv_code text, normalization_version int)`;
      await q`create table core.ted_lot_results (tenders_received int)`;
      await q`create table marts.da_transactions (closing_value numeric)`;
      await q`create table marts.contract_transactions (contract_id bigint, closing_value numeric default 1)`;
      await q`create table marts.data_coverage (dataset text primary key, observation jsonb not null, calculated_at timestamptz not null)`;
      await run(q);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  const remaining = await sql`select nspname from pg_namespace where nspname like ${`${prefix}_%`}`;
  expect(remaining).toHaveLength(0);
}

async function inventory(q: DbSql): Promise<Record<string, { observation: unknown; kind: string }>> {
  const rows = await q`select dataset, observation, jsonb_typeof(observation) kind from marts.data_coverage order by dataset`;
  return Object.fromEntries(rows.map(row => [String(row["dataset"]), { observation: row["observation"], kind: String(row["kind"]) }]));
}

describe("runCoverage (isolated rollback fixtures)", () => {
  it("publishes JSON objects, separates source/mart populations and preserves year aliases", async () => {
    await fixture(async q => {
      // Three accepted source records qualify, but only two have reached the
      // query mart. Available and included deliberately describe different sets.
      await q`insert into core.direct_acquisitions values
        ('Oferta acceptata', 10, '2020-01-01T12:00:00Z', '03000000-1', 1),
        ('Oferta acceptata', 20, '2020-12-31T12:00:00Z', '03000000-1', 2),
        ('Oferta acceptata', 30, '2021-01-01T12:00:00Z', null, null),
        ('Oferta refuzata', 40, null, null, null)`;
      await q`insert into marts.da_transactions values (10), (20), (0), (-1), (null), (2000001)`;
      await q`insert into core.contracts values
        ('2020-05-01T12:00:00Z', '45000000-7', 'RON'),
        ('2021-06-01T12:00:00Z', null, null), (null, null, 'EUR')`;
      await q`insert into marts.contract_transactions (contract_id) values (100), (100), (100), (200)`;
      await q`insert into marts.contract_transactions values (300, 0), (400, -1)`;
      await q`insert into core.ted_notices values
        ('2020-03-01T12:00:00Z', '45000000-7', ${TED_NORMALIZATION_VERSION}),
        ('2021-03-01T12:00:00Z', null, ${TED_NORMALIZATION_VERSION - 1}),
        (null, null, null)`;
      await q`insert into core.ted_lot_results values (1), (2), (0), (null)`;
      await runCoverage(q);
      const actual = await inventory(q);
      expect(Object.keys(actual)).toEqual(["contracts", "da", "ted", "years"]);
      expect(actual["da"]?.kind).toBe("object");
      expect(actual["contracts"]?.kind).toBe("object");
      expect(actual["ted"]?.kind).toBe("object");
      expect(actual["da"]?.observation).toEqual({ available: "4", included: "2", missing_date: "1", missing_cpv: "2",
        missing_raw: "2", date_from: "2020-01-01", date_to: "2021-01-01" });
      expect(actual["contracts"]?.observation).toEqual({ available: "3", included: "2", allocations: "4", missing_date: "1",
        missing_cpv: "2", missing_currency: "1", date_from: "2020-05-01", date_to: "2021-06-01" });
      expect(actual["ted"]?.observation).toEqual({ available: "3", results: "4", unknown_competition: "1", unverified: "2",
        missing_date: "1", missing_cpv: "2", date_from: "2020-03-01", date_to: "2021-03-01" });
      expect(actual["years"]).toEqual({ kind: "array", observation: [
        { src: "contracts", year: 2020, n: "1" }, { src: "contracts", year: 2021, n: "1" },
        { src: "da", year: 2020, n: "2" }, { src: "da", year: 2021, n: "1" },
        { src: "ted", year: 2020, n: "1" }, { src: "ted", year: 2021, n: "1" },
      ] });
      const [generation] = await q`select count(distinct calculated_at)::int n from marts.data_coverage`;
      expect(generation?.["n"]).toBe(1);
    });
  });

  it("keeps empty dataset observations as objects with unknown dates and an empty year array", async () => {
    await fixture(async q => {
      await runCoverage(q);
      const actual = await inventory(q);
      for (const dataset of ["da", "contracts", "ted"]) {
        expect(actual[dataset]?.kind).toBe("object");
        expect(actual[dataset]?.observation).toMatchObject({ available: "0", missing_date: "0", missing_cpv: "0", date_from: null, date_to: null });
      }
      expect(actual["years"]).toEqual({ kind: "array", observation: [] });
    });
  });

  it("rolls back every earlier upsert if the final year observation fails", async () => {
    await fixture(async q => {
      await runCoverage(q);
      const before = await inventory(q);
      await q`insert into core.direct_acquisitions values ('Oferta acceptata', 1, '2026-01-01T12:00:00Z', null, null)`;
      await q`insert into marts.da_transactions values (1)`;
      // NOT VALID retains the previous years snapshot but rejects its next update.
      await q`alter table marts.data_coverage add constraint fixture_reject_final_years check (dataset <> 'years') not valid`;
      await expect(runCoverage(q)).rejects.toThrow("fixture_reject_final_years");
      expect(await inventory(q)).toEqual(before);
    });
  });
});
