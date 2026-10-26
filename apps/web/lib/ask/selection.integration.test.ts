import { afterAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { runRows, runSpec } from "./compile";
import { evidenceCsv, sumDecimalStrings } from "./evidence";
import type { Grounding } from "./ground";
import { VALUE_RANGES } from "./purchase";
import { resolvedSpec } from "./resolved-spec";
import type { AskSpec } from "./spec";
import { scoped, testDatabaseUrl } from "./test-fixture";

/*
 * F3's common selection (plan §3, §4.1, §6.2): the purchase kind, the procedure
 * and the size of a purchase give the same figures in the answer, its sources
 * and their CSV (one predicate, lib/ask/predicates.ts); the ranges of a size
 * add up to the total; a ranking of firms by their size alone reads their
 * profiles and equals the live grouping. A dedicated seap_test_* database,
 * one transaction rolled back.
 */

const testUrl = testDatabaseUrl("F3 selection fixtures");
const connection = testUrl ? createDb(testUrl) : null;
afterAll(async () => { await connection?.sql.end(); });

type Engine = Awaited<ReturnType<typeof runSpec>>;
const stat = (r: Engine) => { if ("error" in r || r.data.block !== "stat") throw new Error("error" in r ? r.error : r.data.block); return r.data.stat; };
const table = (r: Engine) => { if ("error" in r || r.data.block !== "table") throw new Error("error" in r ? r.error : r.data.block); return r.data; };
const rows = async (q: DbSql, spec: AskSpec, grounding: Grounding = {}) => {
  const r = await runRows(q, spec, grounding, 0, { limit: 100 });
  if ("error" in r) throw new Error(r.error);
  return r;
};

describe.runIf(Boolean(connection))("F3: the kind, the procedure and the size (dedicated rollback fixture)", () => {
  it("gives the answer's figures to its sources and their CSV, and leaves out a kind the domain lacks", async () => {
    const sql = connection!.sql, prefix = `f3_fixture_${process.pid}_${Date.now()}`;
    const rollback = new Error("rollback F3 fixture");
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(`create schema ${prefix}`);
        for (const t of ["da_transactions", "contract_transactions", "national_stats", "entity_profile", "entity_flags", "agg_top_entities", "agg_national"])
          await tx.unsafe(`create table ${prefix}.${t} as table marts.${t} with no data`);
        const q = scoped(tx as unknown as DbSql, prefix);
        await q`insert into marts.national_stats (kind,year) values ('da',2024),('da',2025),('award',2024),('award',2025)`;
        // Works (45), goods (33, 48), services (79), one record without a code; a direct acquisition at the 1 mil. lei edge.
        await q`insert into marts.da_transactions (sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date) values
          (11,'DA11',1,'Authority A',10,'Supplier A','Cluj','45233140-2',9999.99,'2025-01-01'),
          (12,'DA12',1,'Authority A',10,'Supplier A','Cluj','33600000-6',10000,'2025-01-02'),
          (13,'DA13',2,'Authority B',11,'Supplier B','Cluj','79000000-4',1000000,'2025-02-01'),
          (14,'DA14',2,'Authority B',11,'Supplier B','Cluj','48000000-8',250,'2024-03-01'),
          (15,'DA15',1,'Authority A',10,'Supplier A','Cluj',null,70,'2024-05-01')`;
        // A contract won by three firms: each share is small, the whole contract is 3 mil. lei.
        await q`insert into marts.contract_transactions (contract_id,contract_no,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date,ca_notice_id,n_winners,contract_value_full,procedure_type) values
          (21,'CT21',1,'Authority A',10,'Supplier A','Cluj','45000000-7',1000000,'2025-01-02',901,3,3000000,'Licitatie deschisa'),
          (21,'CT21',1,'Authority A',11,'Supplier B','Cluj','45000000-7',1000000,'2025-01-02',901,3,3000000,'Licitatie deschisa'),
          (21,'CT21',1,'Authority A',12,'Supplier C','Cluj','45000000-7',1000000,'2025-01-02',901,3,3000000,'Licitatie deschisa'),
          (22,'CT22',2,'Authority B',12,'Supplier C','Cluj','33600000-6',80000,'2025-03-01',902,1,80000,'Licitatie deschisa accelerata'),
          (23,'CT23',2,'Authority B',10,'Supplier A','Cluj','79000000-4',55000,'2024-06-01',903,1,55000,'Negociere fara publicare prealabila'),
          (24,'CT24',1,'Authority A',11,'Supplier B','Cluj','45000000-7',400000,'2024-07-01',904,1,400000,'Procedura simplificata'),
          (25,'CT25',2,'Authority B',12,'Supplier C','Cluj','90000000-7',7000,'2025-04-01',905,1,7000,'Licitatie restransa')`;
        // Both years named: an unfiltered total would read agg_national, empty here.
        const all: AskSpec = { block: "stat", measure: "value", filters: { yearFrom: 2024, yearTo: 2025 } };
        const total = stat(await runSpec(q, all, {}));
        expect([Math.round(total.value * 100) / 100, total.count]).toEqual([4562319.99, 12]);

        // Every key: the answer = its sources = their CSV.
        const cases: [string, AskSpec, Grounding, number, number][] = [
          ["works", { ...all, filters: { purchaseKind: "lucrari" } }, {}, 3409999.99, 5],
          ["goods", { ...all, filters: { purchaseKind: "produse" } }, {}, 90250, 3],
          ["services", { ...all, filters: { purchaseKind: "servicii" } }, {}, 1062000, 3],
          ["works of a domain", { ...all, filters: { purchaseKind: "lucrari", cpvTerm: "4523" } }, { cpv: { term: "4523", prefixes: ["4523"], matchedNames: [], method: "code" } }, 9999.99, 1],
          ["open tender", { ...all, dataset: "contracts", filters: { procedure: "deschisa" } }, {}, 3080000, 4],
          ["negotiation", { ...all, dataset: "contracts", filters: { procedure: "negociere_fara_publicare" } }, {}, 55000, 1],
          ["other procedures", { ...all, dataset: "contracts", filters: { procedure: "altele" } }, {}, 7000, 1],
          // The whole contract, not a share: CT21's three shares of 1 mil. lei are a purchase of 3 mil. lei.
          ["over 1 mil.", { ...all, filters: { purchaseValueMin: 1_000_000 } }, {}, 4000000, 4],
          ["under 10.000", { ...all, filters: { purchaseValueMax: 10_000 } }, {}, 17319.99, 4],
          ["direct, 10.000–1 mil.", { ...all, dataset: "da", filters: { purchaseValueMin: 10_000, purchaseValueMax: 1_000_000 } }, {}, 10000, 1],
        ];
        for (const [name, spec, grounding, value, count] of cases) {
          const answer = stat(await runSpec(q, spec, grounding));
          expect([name, Math.round(answer.value * 100) / 100, answer.count]).toEqual([name, value, count]);
          const sources = await rows(q, spec, grounding);
          expect([name, Number(sources.sourceValue), sources.sourceTotal]).toEqual([name, value, count]);
          expect([name, Number(sumDecimalStrings(sources.rows.map((r) => r.valueExact)))]).toEqual([name, value]);
          expect(evidenceCsv(sources.rows).trim().split("\n")).toHaveLength(count + 1);
        }

        // The procedures add up to the contracts; the kinds to every record with a code; the ranges to the total.
        const contracts = stat(await runSpec(q, { ...all, dataset: "contracts" }, {}));
        let procedures = 0;
        for (const procedure of ["deschisa", "simplificata", "negociere_fara_publicare", "altele"] as const)
          procedures += stat(await runSpec(q, { ...all, dataset: "contracts", filters: { procedure } }, {})).value;
        expect(Math.round(procedures * 100) / 100).toBe(Math.round(contracts.value * 100) / 100);
        let kinds = 0;
        for (const purchaseKind of ["lucrari", "produse", "servicii"] as const) kinds += stat(await runSpec(q, { ...all, filters: { purchaseKind } }, {})).value;
        expect(Math.round(kinds * 100) / 100).toBe(Math.round((total.value - 70) * 100) / 100);
        let ranges = 0, counted = 0;
        for (const { label: _label, ...range } of VALUE_RANGES) {
          const part = stat(await runSpec(q, { ...all, filters: { ...range } as AskSpec["filters"] }, {}));
          ranges += part.value; counted += part.count;
        }
        expect([Math.round(ranges * 100) / 100, counted]).toEqual([Math.round(total.value * 100) / 100, total.count]);

        // A ranking: the same rows and totals in its sources.
        const ranking: AskSpec = { block: "table", dim: "supplier", measure: "value", topN: 10, filters: { purchaseKind: "lucrari", purchaseValueMin: 1_000_000 } };
        const ranked = table(await runSpec(q, ranking, {}));
        expect(ranked.rows.map((r) => [r.entityId, r.value])).toEqual([["10", 1000000], ["11", 1000000], ["12", 1000000]]);
        expect(ranked.totals).toEqual({ value: 3000000, count: 3, entities: 3 });
        const rankedSources = await rows(q, ranking);
        expect([rankedSources.sourceTotal, Number(rankedSources.sourceValue)]).toEqual([3, 3000000]);

        // A domain without codes of the kind: the kind is left out, said in the caveat, and the question returned has none.
        const asphalt: Grounding = { cpv: { term: "asfaltare", prefixes: ["45233"], matchedNames: [], method: "synonym" } };
        const goodsAsphalt: AskSpec = { ...all, filters: { cpvTerm: "asfaltare", purchaseKind: "produse" } };
        const left = await runSpec(q, goodsAsphalt, asphalt);
        expect(stat(left)).toEqual(stat(await runSpec(q, { ...all, filters: { cpvTerm: "asfaltare" } }, asphalt)));
        if ("error" in left) throw new Error(left.error);
        expect(left.caveats).toContain("„asfaltare” nu are coduri de produse: am numărat domeniul întreg, fără tipul ales.");
        expect(resolvedSpec(goodsAsphalt, asphalt).filters).toEqual({ cpvTerm: "asfaltare" });
        expect((await rows(q, goodsAsphalt, asphalt)).scopeNotes).toContain("„asfaltare” nu are coduri de produse: am numărat domeniul întreg, fără tipul ales.");

        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    expect(await sql`select nspname from pg_namespace where nspname=${prefix}`).toHaveLength(0);
  }, 60000);

  it("ranks firms by their size alone from their profiles, as the live grouping does", async () => {
    const sql = connection!.sql, prefix = `f3_size_${process.pid}_${Date.now()}`;
    const rollback = new Error("rollback F3 size fixture");
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(`create schema ${prefix}`);
        for (const t of ["da_transactions", "contract_transactions", "national_stats", "entity_profile", "entity_flags", "agg_top_entities", "agg_national"])
          await tx.unsafe(`create table ${prefix}.${t} as table marts.${t} with no data`);
        const q = scoped(tx as unknown as DbSql, prefix);
        await q`insert into marts.national_stats (kind,year) values ('da',2024),('da',2025),('award',2024),('award',2025)`;
        await q`insert into marts.da_transactions (sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date) values
          (31,'DA31',1,'Authority A',10,'Ten',null,'45000000-7',100,'2024-01-01'), (32,'DA32',1,'Authority A',10,'Ten',null,'45000000-7',50.5,'2025-01-01'),
          (33,'DA33',1,'Authority A',11,'Eleven',null,'45000000-7',300,'2025-01-01'), (34,'DA34',1,'Authority A',12,'Twelve',null,'45000000-7',900,'2025-01-01'),
          (35,'DA35',1,'Authority A',13,'Thirteen',null,'45000000-7',150.5,'2025-02-01')`;
        await q`insert into marts.contract_transactions (contract_id,contract_no,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date,ca_notice_id,n_winners,contract_value_full,procedure_type) values
          (41,'CT41',1,'Authority A',11,'Eleven',null,'45000000-7',0.25,'2025-03-01',941,1,0.25,'Licitatie deschisa')`;
        // Their profiles: the same sums and counts (the nightly build's), Ten and Eleven with 1–9 employees, Twelve with 30, Thirteen without a filing.
        await q`insert into marts.entity_profile (entity_id,role,n_contracts,n_das,total_ron_full,total_ron_split,name_display,county,employees) values
          (10,'supplier',0,2,150.5,150.5,'Ten','Cluj',3), (11,'supplier',1,1,300.25,300.25,'Eleven','Ilfov',9),
          (12,'supplier',0,1,900,900,'Twelve','Cluj',30), (13,'supplier',0,1,150.5,150.5,'Thirteen',null,null)`;
        const small: AskSpec = { block: "table", dim: "supplier", measure: "value", topN: 10, filters: { minEmployees: 1, maxEmployees: 9 } };
        // Every year of the fixture, named: the live grouping of the same records.
        const live = table(await runSpec(q, { ...small, filters: { ...small.filters, yearFrom: 2024, yearTo: 2025 } }, {}));
        const fast = table(await runSpec(q, small, {}));
        expect(fast.rows).toEqual(live.rows);
        expect(fast.totals).toEqual(live.totals);
        expect(fast.rows.map((r) => [r.entityId, r.name, r.value, r.count])).toEqual([["11", "Eleven", 300.25, 2], ["10", "Ten", 150.5, 2]]);
        expect(fast.totals).toEqual({ value: 450.75, count: 4, entities: 2 });
        // In records, ties broken by id, and paged with its count.
        const byCount = table(await runSpec(q, { ...small, measure: "count" }, {}));
        expect(byCount.rows.map((r) => r.entityId)).toEqual(["10", "11"]);
        const { topN: _top, ...whole } = small;
        const paged = table(await runSpec(q, whole, {}));
        expect([paged.total, paged.rows.length]).toEqual([2, 2]);
        // "0 angajați" holds no firm here, and a firm without a filing is in no band.
        expect(table(await runSpec(q, { ...small, filters: { minEmployees: 0, maxEmployees: 0 } }, {})).rows).toEqual([]);
        expect(table(await runSpec(q, { ...small, filters: { minEmployees: 0 } }, {})).rows.map((r) => r.entityId)).toEqual(["12", "11", "10"]);
        // The sources are the records of the band's firms, as the answer's total says.
        const smallSources = await rows(q, small);
        expect([smallSources.sourceTotal, Number(smallSources.sourceValue)]).toEqual([4, 450.75]);
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    expect(await sql`select nspname from pg_namespace where nspname=${prefix}`).toHaveLength(0);
  }, 60000);
});
