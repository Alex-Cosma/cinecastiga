import { afterAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { runReconcile } from "./reconcile.js";

const { sql } = createDb();
afterAll(() => sql.end());
let sequence = 0;

/** Every qualified object and sequence belongs to a unique uncommitted schema.
 * The real reconciler's nested transaction is a savepoint, never a shared write. */
function isolatedSql(connection: DbSql, prefix: string): DbSql {
  const rewrite = (text: string) => text.replace(/\bcore\./g, `${prefix}.`);
  const scoped = ((chunks: TemplateStringsArray, ...values: unknown[]) => {
    const mapped = chunks.map(rewrite);
    Object.defineProperty(mapped, "raw", { value: chunks.raw.map(rewrite) });
    return connection(mapped as unknown as TemplateStringsArray, ...values as never[]);
  }) as unknown as DbSql;
  Object.assign(scoped, {
    begin: (run: (q: DbSql) => Promise<unknown>) => (connection as unknown as {
      savepoint: (fn: (q: DbSql) => Promise<unknown>) => Promise<unknown>;
    }).savepoint((q) => run(isolatedSql(q, prefix))),
  });
  return scoped;
}

async function fixture(run: (q: DbSql) => Promise<void>) {
  const prefix = `reconcile_fixture_${process.pid}_${Date.now()}_${++sequence}`;
  const rollback = new Error("ROLL BACK RECONCILIATION FIXTURE");
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(`create schema ${prefix}`);
      for (const table of ["ted_notices", "ted_lot_results", "ted_lot_winners", "awards", "contracts", "contract_winners"]) {
        await tx.unsafe(`create table ${prefix}.${table} as table core.${table} with no data`);
      }
      const q = isolatedSql(tx as unknown as DbSql, prefix);
      await q`create table core.award_links (
        id bigint generated always as identity primary key,
        ted_lot_result_id bigint, contract_id bigint, ted_notice_id bigint, ca_notice_id bigint,
        match_score real not null, match_method text not null, value_diff_pct numeric,
        date_diff_days integer, evidence jsonb, is_primary boolean not null default false,
        unique(ted_lot_result_id, contract_id))`;
      await run(q);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  expect(await sql`select nspname from pg_namespace where nspname=${prefix}`).toHaveLength(0);
}

async function pair(q: DbSql, id: number, options: {
  tedValue?: number; value?: number; currency?: string | null; tedCurrency?: string | null;
  kind?: string; eligible?: boolean; cpv?: string | null; tedCpv?: string | null;
  title?: string | null; tedTitle?: string | null; date?: string; winner?: number;
} = {}) {
  const v = { tedValue: 1000, value: 1000, currency: "RON", tedCurrency: "RON", kind: "payable",
    eligible: true, cpv: "45000000-7", tedCpv: "45000000-7", title: "Building works",
    tedTitle: "Building works", date: "2025-01-01", winner: 10, ...options };
  await q`insert into core.ted_notices (id,publication_number,buyer_entity_id) values (${id},${`fixture-${id}`},${id})`;
  await q`insert into core.ted_lot_results (id,ted_notice_id,awarded_value,contract_date,cpv_code,title,currency,amount_kind,amount_details)
    values (${id},${id},${v.tedValue},'2025-01-01',${v.tedCpv},${v.tedTitle},${v.tedCurrency},${v.kind},
      jsonb_build_object('matchEligible',${v.eligible}::boolean))`;
  await q`insert into core.ted_lot_winners (lot_result_id,entity_id) values (${id},10)`;
  await q`insert into core.awards (id,ca_notice_id,authority_entity_id,cpv_code) values (${id},${id},${id},${v.cpv})`;
  await q`insert into core.contracts (id,ca_notice_id,contract_value,contract_date,currency,title)
    values (${id},${id},${v.value},${v.date},${v.currency},${v.title})`;
  await q`insert into core.contract_winners (contract_id,entity_id) values (${id},${v.winner})`;
}

async function links(q: DbSql) {
  return q`select ted_lot_result_id::int lot,contract_id::int contract,match_score,
    value_diff_pct::text value_diff_pct,date_diff_days,is_primary,evidence
    from core.award_links order by ted_lot_result_id,contract_id`;
}

describe("runReconcile (isolated rollback fixtures)", () => {
  it("preserves exact/adjacent matches, consortium deduplication and deterministic per-lot primary", async () => {
    await fixture(async q => {
      await pair(q, 100);
      await q`insert into core.ted_lot_winners values (100,11)`;
      await q`insert into core.contract_winners (contract_id,entity_id) values (100,11)`;
      await q`insert into core.contracts (id,ca_notice_id,contract_value,contract_date,currency,title)
        values (101,100,1000,'2025-01-01','RON','Building works'),
          (102,100,1009,'2025-01-01','RON','Building works'),
          (103,100,1020,'2025-01-01','RON','Building works'),
          (104,100,1000,'2025-02-15','RON','Building works'),
          (105,100,1000,'2025-02-16','RON','Building works')`;
      await q`insert into core.contract_winners (contract_id,entity_id) values (101,10),(102,10),(103,10),(104,10),(105,10)`;
      await q`insert into core.ted_lot_results (id,ted_notice_id,awarded_value,contract_date,cpv_code,title,currency,amount_kind,amount_details)
        select 101,ted_notice_id,awarded_value,contract_date,cpv_code,title,currency,amount_kind,amount_details
        from core.ted_lot_results where id=100`;
      await q`insert into core.ted_lot_winners (lot_result_id,entity_id) values (101,10)`;
      const report = await runReconcile(q);
      expect(report).toMatchObject({ links: 8, tedLotsMatched: 2, contractsMatched: 4, primaryLinks: 2, tedLotsMultiMatch: 2 });
      const actual = await links(q);
      expect(actual.filter(r => r["lot"]===100).map(r => r["contract"])).toEqual([100,101,102,104]);
      expect(actual.filter(r => r["is_primary"]).map(r => [r["lot"],r["contract"]])).toEqual([[100,100],[101,100]]);
      expect(actual[0]?.["match_score"]).toBe(1);
      expect(actual.find(r => r["contract"]===102)?.["value_diff_pct"]).toBe("0.892");
      expect(actual.find(r => r["contract"]===104)?.["date_diff_days"]).toBe(45);
      // A second successful run in the same connection has no leftover temp tables.
      expect(await runReconcile(q)).toEqual(report);
      expect(await links(q)).toEqual(actual);
    });
  });

  it("excludes ineligible amount/currency/identity/date rows and preserves CPV/title guards", async () => {
    await fixture(async q => {
      await pair(q,1,{kind:"contract_value"});
      await pair(q,2,{kind:"framework_ceiling"});
      await pair(q,3,{kind:"multiple_tenders"});
      await pair(q,4,{eligible:false});
      await pair(q,5,{currency:"EUR"});
      await pair(q,6,{currency:null});
      await pair(q,7,{tedCurrency:"EUR"});
      await pair(q,8,{winner:99});
      await pair(q,9,{cpv:"33000000-0"});
      await pair(q,10,{cpv:"45200000-9",value:1009,title:"zzzzzz"});
      await pair(q,11,{cpv:null,title:"zzzzzz"}); // exact value is categorical evidence
      await pair(q,12,{value:1009,title:"zzzzzz"}); // exact CPV is categorical evidence
      await pair(q,13);
      await q`update core.awards set authority_entity_id=999 where id=13`;
      await pair(q,14);
      await q`update core.ted_lot_results set contract_date=null where id=14`;
      await pair(q,15);
      await q`delete from core.ted_lot_winners where lot_result_id=15`;
      await runReconcile(q);
      expect((await links(q)).map(r=>r["lot"])).toEqual([1,11,12]);
    });
  });

  it("covers the full max-denominator tolerance and gives missing titles zero title credit", async () => {
    await fixture(async q => {
      await pair(q,1,{tedValue:144.77,value:146.23}); // old ln(1+tol) buckets were two apart
      await pair(q,2,{tedValue:990,value:1000}); // exact 1% of maximum
      await pair(q,3,{tedValue:989.99,value:1000}); // just outside the exact bound
      await pair(q,4,{title:null});
      await pair(q,5,{cpv:"45200000-9"}); // full other agreements + partial CPV => exactly .90
      const report=await runReconcile(q);
      const actual=await links(q);
      expect(actual.map(r=>r["lot"])).toEqual([1,2,4,5]);
      expect(actual.find(r=>r["lot"]===4)?.["match_score"]).toBeCloseTo(0.7,6);
      expect(actual.find(r=>r["lot"]===4)?.["evidence"]).toMatchObject({title_sim:0});
      expect(actual.find(r=>r["lot"]===5)?.["match_score"]).toBeCloseTo(0.9,6);
      expect(report.scoreBuckets.ge90).toBe(1); // stored REAL .90 is included
    });
  });

  it("restores the previous links and identity sequence if a later stage fails", async () => {
    await fixture(async q => {
      await pair(q,1);
      await runReconcile(q);
      const before=await links(q);
      await q`insert into core.award_links (ted_lot_result_id,contract_id,match_score,match_method)
        values (900,900,0.5,'previous snapshot')`;
      const [previousSequence]=await q`select max(id)::int id from core.award_links`;
      const allBefore=await links(q);
      const stop=new Error("Injected failure after replacement insert");
      await expect(runReconcile(q,{log:message=>{if(message.startsWith("marking primary"))throw stop;}})).rejects.toBe(stop);
      expect(await links(q)).toEqual(allBefore);
      const [next]=await q`insert into core.award_links (ted_lot_result_id,contract_id,match_score,match_method)
        values (901,901,0.5,'sequence check') returning id::int id`;
      expect(next?.["id"]).toBe(Number(previousSequence?.["id"])+1);
      await runReconcile(q);
      expect(await links(q)).toEqual(before);
    });
  });

  it("rejects undefined logarithmic or date tolerances before opening a transaction", async () => {
    const unavailable=(()=>{throw new Error("DB must not be touched");}) as unknown as DbSql;
    for(const valueTol of [0,-1,1,2,NaN,Infinity]) await expect(runReconcile(unavailable,{valueTol})).rejects.toThrow("valueTol");
    for(const dateTolDays of [0,-1,NaN,Infinity]) await expect(runReconcile(unavailable,{dateTolDays})).rejects.toThrow("dateTolDays");
  });
});
