import { afterAll, describe, expect, it } from "vitest";
import { buildAskRollups, createDb, type DbSql } from "@seap/db";
import { runRows, runSpec, type BlockData } from "./compile";
import { evidenceCsv, sumDecimalStrings } from "./evidence";
import { withExclusion } from "./filters/exclusions";
import { forgetMartColumns } from "./mart-columns";
import { forgetRollupsReady, rollupsReady } from "./rollups";
import type { AskSpec } from "./spec";
import { testDatabaseUrl, withAskFixture } from "./test-fixture";

/*
 * F4, „Scoate din calcul” (plan §2.5, §4.2, §4.7, §4.13, §6.2): an entity of
 * the answer's rows leaves the selection. The national ranking's fast path
 * (agg_top_entities less the rows, agg_national less their sums; an id
 * outside the precomputed ranking counted on its index) gives the rows and
 * totals of the live grouping and of the rollups; the sources and their CSV
 * hold the answer's records (answer = sources = CSV), with their totals from
 * agg_entity_year once it is built; „Cine conduce?” crowns the next one; a
 * trend and a map lose that entity's records. A dedicated seap_test_*
 * database, one transaction rolled back.
 */

const url = testDatabaseUrl("F4 exclusion fixtures");
const connection = url ? createDb(url, { max: 1 }) : null;
afterAll(async () => { forgetRollupsReady(); forgetMartColumns(); await connection?.sql.end(); });

type Engine = Awaited<ReturnType<typeof runSpec>>;
const data = (r: Engine): BlockData => { if ("error" in r) throw new Error(r.error); return r.data; };
const drawer = async (q: DbSql, spec: AskSpec) => {
  const r = await runRows(q, spec, {}, 0, { limit: 100 });
  if ("error" in r) throw new Error(r.error);
  return r;
};
const out = (spec: AskSpec, field: "authority" | "supplier", id: number, label: string): AskSpec =>
  ({ ...spec, population: withExclusion(spec.population, { field, value: String(id), label }) });
/** The same question through the grouping: an id of the other role that exists nowhere is left out too (no fast path). */
const grouped = (spec: AskSpec): AskSpec => out(spec, spec.dim === "supplier" ? "authority" : "supplier", 999_999_999, "Nimeni");

/**
 * Institutions 1 (Cluj), 2 (Iași), 3 (Cluj). Firms 10 > 11 > 12 > 13 > 14 by value; 14, the smallest, is left out of
 * the precomputed ranking (outside its first 2,000 on the real data). A DA above the 2M ceiling, a zero, a record
 * without a firm, a contract won by two firms (its value split), years 2024 and 2025.
 */
async function load(q: DbSql) {
  await q`insert into marts.national_stats (kind,year) values ('da',2024),('da',2025),('award',2024),('award',2025)`;
  await q`insert into core.entities (id, name_display, name_normalized) values
    (1,'Primaria Unu','primaria unu'),(2,'Spital Doi','spital doi'),(3,'Scoala Trei','scoala trei'),
    (10,'Alfa SRL','alfa srl'),(11,'Beta SRL','beta srl'),(12,'Gama SRL','gama srl'),(13,'Delta SRL','delta srl'),(14,'Epsilon SRL','epsilon srl')`;
  await q`insert into marts.da_transactions (sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date) values
    (101,'DA101',1,'Primaria Unu',10,'Alfa SRL','Cluj','33600000-6',5000,'2024-03-01 10:00'),
    (102,'DA102',1,'Primaria Unu',10,'Alfa SRL','Cluj','33600000-6',7000.5,'2025-03-01 10:00'),
    (103,'DA103',2,'Spital Doi',11,'Beta SRL','Iasi','33600000-6',4000,'2025-04-01 10:00'),
    (104,'DA104',2,'Spital Doi',12,'Gama SRL','Iasi','45000000-7',3000,'2024-05-01 10:00'),
    (105,'DA105',3,'Scoala Trei',13,'Delta SRL','Cluj','30190000-7',900,'2025-06-01 10:00'),
    (106,'DA106',3,'Scoala Trei',14,'Epsilon SRL','Cluj','30190000-7',120.25,'2025-07-01 10:00'),
    (107,'DA107',1,'Primaria Unu',14,'Epsilon SRL','Cluj','30190000-7',80,'2024-07-01 10:00'),
    (108,'DA108',2,'Spital Doi',10,'Alfa SRL','Iasi','33600000-6',2500000,'2025-08-01 10:00'),
    (109,'DA109',2,'Spital Doi',11,'Beta SRL','Iasi','33600000-6',0,'2025-08-02 10:00'),
    (110,'DA110',3,'Scoala Trei',null,null,'Cluj','30190000-7',60,'2025-09-01 10:00')`;
  await q`insert into marts.contract_transactions (contract_id,contract_no,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date,ca_notice_id,n_winners,contract_value_full) values
    (201,'C201',2,'Spital Doi',10,'Alfa SRL','Iasi','45000000-7',20000,'2025-02-01',901,1,20000),
    (202,'C202',1,'Primaria Unu',11,'Beta SRL','Cluj','45000000-7',6000,'2024-09-01',902,2,12000),
    (202,'C202',1,'Primaria Unu',12,'Gama SRL','Cluj','45000000-7',6000,'2024-09-01',902,2,12000)`;
  // Each entity's profile as the marts build writes it: its records and sum in every Ask aggregate (DAs up to 2M).
  for (const role of ["authority", "supplier"] as const) {
    const id = role === "authority" ? q`authority_id` : q`supplier_id`;
    await q`insert into marts.entity_profile (entity_id, role, name_display, county, n_das, n_contracts, total_ron_split)
      select g.id, ${role}, e.name_display, null, g.n_das, g.n_contracts, g.v from (
        select ${id} id, count(*) filter (where src = 'da')::int n_das, count(*) filter (where src = 'contracts')::int n_contracts, sum(cv) v from (
          select authority_id, supplier_id, 'da' src, closing_value cv from marts.da_transactions where closing_value > 0 and closing_value <= 2000000
          union all select authority_id, supplier_id, 'contracts', closing_value from marts.contract_transactions where closing_value > 0
        ) x where ${id} is not null group by 1
      ) g join core.entities e on e.id = g.id`;
  }
  // The national fast paths, with the marts build's own definitions (transaction-marts.ts).
  await q`insert into marts.agg_national
    select src, coalesce(sum(cv) filter (where plaf), 0), count(*) filter (where plaf), coalesce(sum(cv), 0), count(*)
    from (select 'da'::text src, closing_value cv, (closing_value <= 2000000) plaf from marts.da_transactions where closing_value > 0
          union all select 'contracts', closing_value, true from marts.contract_transactions where closing_value > 0) x
    group by src`;
  await q`insert into marts.agg_top_entities
    with base as (
      select authority_id eid, 'authority'::text role, authority_name nm, closing_value cv, (closing_value <= 2000000) plaf from marts.da_transactions where closing_value > 0
      union all select authority_id, 'authority', authority_name, closing_value, true from marts.contract_transactions where closing_value > 0
      union all select supplier_id, 'supplier', supplier_name, closing_value, (closing_value <= 2000000) from marts.da_transactions where closing_value > 0
      union all select supplier_id, 'supplier', supplier_name, closing_value, true from marts.contract_transactions where closing_value > 0
    ), g as (
      select role, eid, max(nm) nm, coalesce(sum(cv) filter (where plaf), 0) v_plaf, count(*) filter (where plaf) n_plaf,
             coalesce(sum(cv), 0) v_all, count(*) n_all
      from base where eid is not null group by role, eid
    )
    select g.role, g.eid, g.nm, null, g.v_plaf, g.n_plaf, g.v_all, g.n_all from g`;
  // The smallest firm lies past the precomputed ranking, as most firms do on the real data.
  await q`delete from marts.agg_top_entities where role = 'supplier' and eid = 14`;
  forgetMartColumns();
}

/** Two places: past them a ranking would reach firm 14, which the precomputed ranking leaves out (on the real data, past its 2,000). */
const firms: AskSpec = { block: "table", measure: "value", dim: "supplier", topN: 2, filters: {} };
const institutions: AskSpec = { ...firms, dim: "authority", topN: 10 };

describe.runIf(Boolean(connection))("F4: „Scoate din calcul” (dedicated rollback fixture)", () => {
  it("gives the grouping's rows and totals on the national ranking's fast path, and its sources and CSV the same records", async () => {
    await withAskFixture(connection!.sql, "f4_exclude", load, async (q) => {
      forgetRollupsReady();
      expect(await rollupsReady(q)).toBe(false);
      const cases: [string, AskSpec, string, number, number][] = [
        // name, spec, the id left out, the records and the value of what is left
        ["the first firm", out(firms, "supplier", 10, "Alfa SRL"), "10", 7, 20100.25],
        ["two firms", out(out(firms, "supplier", 10, "Alfa SRL"), "supplier", 12, "Gama SRL"), "12", 5, 11100.25],
        ["a firm outside the precomputed ranking", out(firms, "supplier", 14, "Epsilon SRL"), "14", 8, 51900.5],
        ["by records", { ...out(firms, "supplier", 11, "Beta SRL"), measure: "count" }, "11", 8, 42100.75],
        ["an institution", out(institutions, "authority", 2, "Spital Doi"), "2", 8, 25160.75],
        ["an id with no records", out(firms, "supplier", 77, "Nimeni"), "77", 10, 52100.75],
      ];
      for (const [name, spec, id, count, value] of cases) {
        const fast = data(await runSpec(q, spec, {}));
        const live = data(await runSpec(q, grouped(spec), {}));
        // The fast path is the grouping, to the leu: rows, order, counties and totals.
        expect([name, fast]).toEqual([name, live]);
        if (fast.block !== "table") throw new Error("table expected");
        expect([name, fast.rows.some((r) => r.entityId === id)]).toEqual([name, false]);
        expect([name, fast.totals?.count, fast.totals?.value]).toEqual([name, count, value]);
        // Its sources: the same records and value, each listed, and the CSV one line each.
        const rows = await drawer(q, spec);
        expect([name, rows.sourceTotal, Number(rows.sourceValue)]).toEqual([name, count, value]);
        expect([name, Number(sumDecimalStrings(rows.rows.map((r) => r.valueExact)))]).toEqual([name, value]);
        expect([name, rows.rows.some((r) => String(r[spec.dim === "supplier" ? "supplierId" : "authorityId"]) === id)]).toEqual([name, false]);
        expect(evidenceCsv(rows.rows).trim().split("\n")).toHaveLength(count + 1);
        expect(rows.scopeNotes.join(" ")).toMatch(/Scoase din calcul: /);
      }

      // „Cine conduce?” by value: the next one is crowned, its sources are its records.
      const leader: AskSpec = { block: "entity_card", measure: "value", dim: "supplier", rankBy: "value", filters: {} };
      const before = data(await runSpec(q, leader, {}));
      const after = data(await runSpec(q, out(leader, "supplier", 10, "Alfa SRL"), {}));
      if (before.block !== "entity_card" || after.block !== "entity_card") throw new Error("entity_card expected");
      expect([before.card.entityId, after.card.entityId, after.card.value, after.card.count]).toEqual(["10", "11", 10000, 2]);
      const crowned = await drawer(q, out(leader, "supplier", 10, "Alfa SRL"));
      expect([crowned.total, Number(crowned.sourceValue), crowned.rows.every((r) => r.supplierId === "11")]).toEqual([2, 10000, true]);

      // A trend and a map lose that entity's records.
      const trend: AskSpec = { block: "trend", measure: "value", dim: "supplier", topN: 10, filters: { yearFrom: 2024, yearTo: 2025 }, trend: { change: "all", months: "whole" } };
      const t = data(await runSpec(q, out(trend, "supplier", 10, "Alfa SRL"), {}));
      if (t.block !== "trend") throw new Error("trend expected");
      expect(t.rowsTrend.map((r) => r.entityId)).not.toContain("10");
      expect(t.composition?.all).toEqual({ count: 4, valueA: 15080, valueB: 5020.25 });
      const map = data(await runSpec(q, out({ block: "map", measure: "value", filters: {} }, "authority", 2, "Spital Doi"), {}));
      if (map.block !== "map") throw new Error("map expected");
      expect(map.counties).toEqual([{ county: "Cluj", value: 25160.75, count: 8 }]);

      // The rollups built: the ranking's sources read their totals from agg_entity_year, the same as live.
      const liveDrawers = await Promise.all([out(firms, "supplier", 10, "Alfa SRL"), out(institutions, "authority", 2, "Spital Doi")].map((spec) => drawer(q, spec)));
      await buildAskRollups(q);
      forgetRollupsReady();
      expect(await rollupsReady(q)).toBe(true);
      for (const [i, spec] of [out(firms, "supplier", 10, "Alfa SRL"), out(institutions, "authority", 2, "Spital Doi")].entries()) {
        const rolled = await drawer(q, spec), live = liveDrawers[i]!;
        const pick = (r: typeof rolled) => ({ total: r.total, value: r.value, sourceTotal: r.sourceTotal, sourceValue: Number(r.sourceValue), dateFrom: r.dateFrom, dateTo: r.dateTo, rows: r.rows.map((row) => `${row.src}:${row.refId}:${row.supplierId}`) });
        expect(pick(rolled)).toEqual(pick(live));
        // And the answer on the rollups (no fast path) equals the fast one.
        expect(data(await runSpec(q, grouped(spec), {}))).toEqual(data(await runSpec(q, spec, {})));
      }
      forgetRollupsReady();
    }, { globals: ["core.entities", "core.entity_sicap_ids", "core.entity_redirects", "core.cpv_codes", "core.direct_acquisitions", "core.contracts", "raw.raw_documents", "reference.uat", "reference.authority_uat", "reference.company_reps", "reference.cpv_synonym"] });
  }, 120_000);
});
