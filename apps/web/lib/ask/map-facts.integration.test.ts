import { afterAll, describe, expect, it } from "vitest";
import { buildAskRollups, createDb, type DbSql } from "@seap/db";
import { runRows, runSpec } from "./compile";
import { assembleMapFacts, forgetMapRollup, localMapSql, mapFactsSql, mapRollupFilters, mapRollupReady, mapRows, type MapCountyFacts } from "./map-facts";
import { forgetMartColumns } from "./mart-columns";
import { predicateContext } from "./predicates";
import { forgetRollupsReady } from "./rollups";
import type { AskSpec } from "./spec";
import { testDatabaseUrl, withAskFixture } from "./test-fixture";

/*
 * F5, the map's county facts (plan §4.4, §6.2; map final §3.7–§3.11): the
 * seat split, the largest buyer and record and the local administrations'
 * counties read from agg_map_year equal the live grouping of the records, to
 * the leu; the seat split adds up to the county; a county's drawer filtered by
 * the seat holds the facts' records; the map's answer and its facts agree. A
 * dedicated seap_test_* database, one transaction rolled back.
 */

const testUrl = testDatabaseUrl("F5 map facts fixtures");
const connection = testUrl ? createDb(testUrl) : null;
afterAll(async () => { forgetMartColumns(); forgetRollupsReady(); forgetMapRollup(); await connection?.sql.end(); });

/**
 * Institutions: 1 a hospital in Cluj, 2 a commune in Cluj, 3 the town hall of Iasi, 4 a county council seated in
 * București (the map of the local administrations places it at Ilfov). Firms: 10 seated in Cluj, 11 in București,
 * 12 in Iasi, 13 foreign, 14 without a seat; one DA has no firm.
 */
async function fill(q: DbSql) {
  await q`insert into marts.national_stats (kind,year) values ('da',2024),('da',2025),('award',2024),('award',2025)`;
  await q`insert into marts.entity_profile (entity_id,role,name_display,county,is_foreign,seat_county,seat_source,n_das,n_contracts) values
    (1,'authority','Spitalul Cluj','Cluj',false,null,null,0,0),(2,'authority','Comuna Feleacu','Cluj',false,null,null,0,0),
    (3,'authority','Municipiul Iasi','Iasi',false,null,null,0,0),(4,'authority','Judetul Ilfov','Bucuresti',false,null,null,0,0),
    (10,'supplier','Firma Cluj','Cluj',false,'Cluj','onrc',3,1),(11,'supplier','Firma Bucuresti','Bucuresti',false,'Bucuresti','onrc',3,1),
    (12,'supplier','Firma Iasi','Iasi',false,'Iasi','seap',2,0),(13,'supplier','Firma Straina','NA',true,null,'foreign',1,1),
    (14,'supplier','Firma Fara Sediu',null,false,null,null,1,0)`;
  await q`insert into core.entities (id, name_display, name_normalized, cui_valid) select entity_id, name_display, lower(name_display), true from marts.entity_profile`;
  await q.unsafe(`insert into marts.da_transactions (sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date)
    select v.id, 'DA'||v.id, v.a, 'x', v.s, 'y', v.county, v.cpv, v.cv, v.dt from (values
      (201,1,10,'Cluj','33600000-6',1000.10,'2024-03-01 10:00'), (202,1,11,'Cluj','33600000-6',2000.25,'2025-03-01 10:00'),
      (203,2,10,'Cluj','45000000-7',500.5,'2025-05-01 10:00'), (204,2,13,'Cluj','79000000-4',750.75,'2025-07-01 10:00'),
      (205,3,12,'Iasi','45233140-2',3000,'2024-06-01 10:00'), (206,3,14,'Iasi','30190000-7',2500.5,'2025-02-01 10:00'),
      (207,3,null,'Iasi',null,120,'2025-01-15 10:00'), (208,4,11,'Bucuresti','45000000-7',4000,'2025-08-01 10:00'),
      (209,4,12,'Bucuresti','33600000-6',1999999.99,'2025-09-01 10:00'), (210,4,12,'Bucuresti','33600000-6',2000000.01,'2025-09-02 10:00'),
      (211,1,10,'Cluj','33600000-6',2000.25,'2025-04-01 10:00')
    ) v(id,a,s,county,cpv,cv,dt)`);
  await q.unsafe(`insert into marts.contract_transactions (contract_id,supplier_id,authority_id,authority_name,supplier_name,county,cpv_code,closing_value,finalization_date,is_single_bidder,n_winners)
    select v.id, v.s, v.a, 'x', 'y', v.county, v.cpv, v.cv, v.dt, false, 1 from (values
      (301,10,1,'Cluj','45000000-7',90000,'2025-06-01'), (302,11,2,'Cluj','79000000-4',15000.5,'2024-09-01'),
      (303,13,4,'Bucuresti','45000000-7',250000,'2025-10-01')
    ) v(id,s,a,county,cpv,cv,dt)`);
  forgetMartColumns();
}

const SPECS: [string, AskSpec, readonly string[] | null][] = [
  ["every year", { block: "map", measure: "value", filters: {} }, null],
  ["2025", { block: "map", measure: "value", filters: { yearFrom: 2025, yearTo: 2025 } }, null],
  ["works", { block: "map", measure: "value", filters: { purchaseKind: "lucrari" } }, null],
  ["direct acquisitions", { block: "map", dataset: "da", measure: "value", filters: {} }, null],
  ["hospitals", { block: "map", measure: "value", filters: { authorityKind: "spital" } }, ["1"]],
  ["without the hospital", { block: "map", measure: "value", filters: {}, population: { operator: "and", groups: [{ operator: "and", conditions: [{ field: "authority", op: "not_in", values: ["1"], labels: ["Spitalul Cluj"] }] }] } }, null],
];

const ctxOf = (q: DbSql, spec: AskSpec, kindIds: readonly string[] | null) =>
  predicateContext(q, spec, {}, { dataset: spec.dataset ?? "all", yearFrom: spec.filters.yearFrom ?? null, yearTo: spec.filters.yearTo ?? null, kindIds, seat: true });

async function facts(q: DbSql, spec: AskSpec, kindIds: readonly string[] | null, rolled: boolean): Promise<Record<string, MapCountyFacts>> {
  const ctx = ctxOf(q, spec, kindIds), dataset = spec.dataset ?? "all";
  const filters = rolled ? mapRollupFilters(ctx, dataset) : null;
  if (rolled && !filters) throw new Error("agg_map_year does not answer this selection");
  return assembleMapFacts(await q`${mapFactsSql(q, mapRows(q, { ctx, dataset, rolled: filters, seat: true, local: null }))}` as never, true);
}

describe.runIf(Boolean(connection))("F5: the map's county facts (dedicated rollback fixture)", () => {
  it("read from agg_map_year equal the live grouping, add up to the county and to the answer", async () => {
    await withAskFixture(connection!.sql, "f5_map", fill, async (q) => {
      const live = new Map<string, Record<string, MapCountyFacts>>();
      for (const [name, spec, ids] of SPECS) live.set(name, await facts(q, spec, ids, false));
      // Live, before the rollup: 2,000,000.01 lei is over the DA ceiling, a DA without firm is of an unknown seat.
      expect(live.get("every year")!.Cluj).toMatchObject({
        value: 111252.35, count: 7, buyers: 2, buyer: { id: "1", name: "Spitalul Cluj", value: 95000.6, count: 4 }, record: { value: 90000, src: "contracts" },
        seat: { same: { value: 93500.85, count: 4 }, other: { value: 17000.75, count: 2 }, bucuresti: { value: 17000.75, count: 2 }, foreign: { value: 750.75, count: 1 }, unknown: { value: 0, count: 0 } },
      });
      expect(live.get("every year")!.Iasi!.seat).toMatchObject({ same: { value: 3000, count: 1 }, unknown: { value: 2620.5, count: 2 } });
      forgetMapRollup();
      const report = await buildAskRollups(q);
      expect(report.rows.agg_map_year).toBeGreaterThan(0);
      expect(await mapRollupReady(q)).toBe(true);
      // Marts audit 2: the probe reads the build's comment (agg_cpv_year's oid), not the rows; a table of another build is not read.
      const [comment] = await q`select obj_description(to_regclass('marts.agg_map_year'), 'pg_class') d, to_regclass('marts.agg_cpv_year')::oid::text oid` as unknown as { d: string; oid: string }[];
      expect(comment!.d).toBe(`agg_cpv_year ${comment!.oid}`);
      await q.unsafe(`comment on table marts.agg_map_year is 'agg_cpv_year ${Number(comment!.oid) + 1}'`);
      forgetMapRollup();
      expect(await mapRollupReady(q)).toBe(false);
      await q.unsafe(`comment on table marts.agg_map_year is '${comment!.d}'`);
      forgetMapRollup();
      expect(await mapRollupReady(q)).toBe(true);
      for (const [name, spec, ids] of SPECS) {
        const rolled = await facts(q, spec, ids, true);
        expect([name, rolled]).toEqual([name, live.get(name)]);
        for (const [county, f] of Object.entries(rolled)) {
          const s = f.seat!;
          expect([name, county, Math.round((s.same.value + s.other.value + s.foreign.value + s.unknown.value) * 100)]).toEqual([name, county, Math.round(f.value * 100)]);
          expect([name, county, s.same.count + s.other.count + s.foreign.count + s.unknown.count]).toEqual([name, county, f.count]);
        }
        // The answer's counties are the facts' (runSpec's own path: the bare marts, a rollup or live).
        // A kind is a list the fixture does not classify; every year on both channels reads agg_map_county, built by the
        // transactions stage outside this fixture (its seat columns: agg-map-county.ts).
        if (spec.filters.authorityKind || name === "every year") continue;
        const answer = await runSpec(q, spec, {});
        if ("error" in answer || answer.data.block !== "map") throw new Error(name);
        expect([name, Object.fromEntries(answer.data.counties.map((c) => [c.county, [c.value, c.count]]))])
          .toEqual([name, Object.fromEntries(Object.entries(rolled).map(([c, f]) => [c, [f.value, f.count]]))]);
      }
    });
  }, 120000);

  it("opens a county's records of one seat, as many and as much as the card says", async () => {
    await withAskFixture(connection!.sql, "f5_map_rows", fill, async (q) => {
      const spec: AskSpec = { block: "map", measure: "value", filters: {} };
      const card = (await facts(q, spec, null, false)).Cluj!;
      for (const [seat, part] of [["same", card.seat!.same], ["other", card.seat!.other], ["abroad", card.seat!.foreign]] as const) {
        const rows = await runRows(q, { ...spec, filters: { firmSeat: seat } }, {}, 0, { scope: { county: "Cluj" }, limit: 100 });
        if ("error" in rows) throw new Error(rows.error);
        expect([seat, rows.sourceTotal, Number(rows.sourceValue)]).toEqual([seat, part.count, part.value]);
      }
    });
  }, 120000);

  it("groups the local administrations by the county each administers, from the rollup as live", async () => {
    await withAskFixture(connection!.sql, "f5_map_local", fill, async (q) => {
      // The strict list as per-capita.ts reads it: the town hall of Iasi, and the council seated in București at Ilfov.
      const local = { ids: ["3", "4"], counties: ["Iasi", "Ilfov"] };
      const spec: AskSpec = { block: "map", measure: "value_per_capita", filters: { authorityKind: "local_admin" } };
      const ctx = ctxOf(q, spec, local.ids);
      const read = async (rolled: boolean) => (await q`${localMapSql(q, { ctx, dataset: "all", rolled: rolled ? mapRollupFilters(ctx, "all") : null, local })}` as unknown as { c: string; v: string; n: string }[])
        .map((r) => [r.c, Number(r.v), Number(r.n)]);
      const live = await read(false);
      expect(live).toEqual([["Ilfov", 2253999.99, 3], ["Iasi", 5620.5, 3]]);
      await buildAskRollups(q);
      expect(await read(true)).toEqual(live);
    });
  }, 120000);
});
