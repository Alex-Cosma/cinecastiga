import { afterAll, describe, expect, it } from "vitest";
import { buildAskRollups, createDb, TRANSACTION_MART_BUILD_INDEXES, type DbSql } from "@seap/db";
import { COMPARE_DOMAINS, profileLimitsForTests, runRows, type DrillOpts } from "./compile";
import { forgetMartColumns } from "./mart-columns";
import { networkMembersCond } from "./relations";
import { predicateContext } from "./predicates";
import { compareRecordPass, forgetRollupsReady, valueKeysReady, yearKeysReady } from "./rollups";
import type { AskSpec } from "./spec";
import type { Grounding } from "./ground";
import { testDatabaseUrl, withAskFixture } from "./test-fixture";

/*
 * S5 PRE-sources, parity: the source lists PRECOMPUTE.md kept for the marts
 * stage give, after the nightly build, exactly the drawer they gave before it
 * (count, value, period and the page's records in order): the historical
 * profiles' cohorts (totals from agg_entity_year, the page by value from
 * da_tx_value_desc_idx, and a walk too short to finish falling back to core),
 * a ranking whose selection is only a period (agg_entity_year totals), a
 * year's ranking (the page bounded by the year's keys), a lower size (its
 * direct acquisitions on the value index). Also, with no build needed: the
 * comparison's record pass against the three queries it replaces, a network
 * group's partners read once against the semi-join, and a named firm's page
 * by value from the covering index against the plain order. A dedicated
 * seap_test_* database, one transaction rolled back.
 */

const url = testDatabaseUrl("PRE-sources fixtures");
const connection = url ? createDb(url, { max: 1 }) : null;
afterAll(async () => { profileLimitsForTests(null); forgetRollupsReady(); forgetMartColumns(); await connection?.sql.end(); });

type Fragment = ReturnType<DbSql>;

/**
 * Institutions 1 (Cluj) and 2 (Iași); firms 10–12, and 13 with fewer than ten records (no risk profile);
 * 2023–2025 direct acquisitions on core with tied values, one at the 2M ceiling and one above it, a zero, a
 * cancelled one, one without an institution and one whose firm is the institution itself (no supplier, audit F12);
 * da_transactions written from them as the nightly build writes it; a few contracts; the profiles from core.
 */
async function load(q: DbSql) {
  await q`insert into marts.national_stats (kind,year) values ('da',2023),('da',2024),('da',2025),('award',2024),('award',2025)`;
  await q`insert into core.entities (id, name_display, name_normalized) values
    (1,'Primaria Unu','primaria unu'),(2,'Spitalul Doi','spitalul doi'),(3,'Scoala Trei','scoala trei'),(4,'Muzeul Patru','muzeul patru'),
    (10,'Alfa SRL','alfa srl'),(11,'Beta SRL','beta srl'),(12,'Gama SA','gama sa'),(13,'Delta SRL','delta srl')`;
  await q`insert into core.direct_acquisitions (id, sicap_da_id, da_code, authority_entity_id, supplier_entity_id, state, closing_value, cpv_code, finalization_date)
    select i, 1000 + i, 'DA' || (1000 + i), 1 + i % 2, 10 + i % 3, 'Oferta acceptata', (i * 37 % 500) + 0.25,
           case when i % 4 = 0 then '45000000-7' else '33600000-6' end,
           timestamptz '2023-01-01 10:00+02' + make_interval(days => i * 11 % 1000)
    from generate_series(1, 150) i`;
  await q`insert into core.direct_acquisitions (id, sicap_da_id, da_code, authority_entity_id, supplier_entity_id, state, closing_value, cpv_code, finalization_date) values
    (201, 2201, 'DA2201', 1, 10, 'Oferta acceptata', 2000000, '33600000-6', '2025-05-05 10:00+03'),
    (202, 2202, 'DA2202', 2, 11, 'Oferta acceptata', 2000000.01, '33600000-6', '2025-05-06 10:00+03'),
    (203, 2203, 'DA2203', 2, 12, 'Oferta acceptata', 0, '33600000-6', '2024-05-06 10:00+03'),
    (204, 2204, 'DA2204', 1, 11, 'Oferta anulata', 900, '33600000-6', '2024-05-07 10:00+03'),
    (205, 2205, 'DA2205', null, 12, 'Oferta acceptata', 450.25, '33600000-6', '2024-06-07 10:00+03'),
    (206, 2206, 'DA2206', 1, 1, 'Oferta acceptata', 470.25, '33600000-6', '2024-06-08 10:00+03'),
    (207, 2207, 'DA2207', 2, 13, 'Oferta acceptata', 1500000, '45000000-7', '2024-07-08 10:00+03'),
    (208, 2208, 'DA2208', 2, 13, 'Oferta acceptata', 499.25, '45000000-7', '2025-12-31 23:30+02'),
    (209, 2209, 'DA2209', 3, 10, 'Oferta acceptata', 310.5, '33600000-6', '2023-03-01 10:00+02'),
    (210, 2210, 'DA2210', 4, 10, 'Oferta acceptata', 320.5, '33600000-6', '2025-03-01 10:00+02')`;
  // As transaction-marts.ts writes it: every accepted DA, the supplier unless equal to the institution, the day in Bucharest.
  await q`insert into marts.da_transactions (sicap_da_id, da_code, authority_id, authority_name, supplier_id, supplier_name, county, cpv_code, closing_value, finalization_date)
    select da.sicap_da_id, da.da_code, da.authority_entity_id, a.name_display, nullif(da.supplier_entity_id, da.authority_entity_id), s.name_display,
           case when da.authority_entity_id is null then null when da.authority_entity_id = 2 then 'Iasi' else 'Cluj' end, da.cpv_code, da.closing_value,
           to_char(da.finalization_date at time zone 'Europe/Bucharest', 'YYYY-MM-DD HH24:MI')
    from core.direct_acquisitions da left join core.entities a on a.id = da.authority_entity_id left join core.entities s on s.id = da.supplier_entity_id
    where da.state = 'Oferta acceptata'`;
  await q`insert into marts.contract_transactions (contract_id, contract_no, authority_id, authority_name, supplier_id, supplier_name, county, cpv_code, closing_value, finalization_date, ca_notice_id, n_winners, contract_value_full, is_single_bidder) values
    (301,'C301',1,'Primaria Unu',10,'Alfa SRL','Cluj','45000000-7',30000,'2024-04-01',901,1,30000,true),
    (302,'C302',2,'Spitalul Doi',11,'Beta SRL','Iasi','45000000-7',450.25,'2025-02-01',902,2,900.5,null),
    (302,'C302',2,'Spitalul Doi',10,'Alfa SRL','Iasi','45000000-7',450.25,'2025-02-01',902,2,900.5,null),
    (303,'C303',1,'Primaria Unu',12,'Gama SA','Cluj',null,1200000,'2023-09-01',903,1,1200000,false)`;
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
  // The profiles as runFlagMarts counts them: core's accepted DAs with 0 < value <= 2M, the supplier unless the institution.
  await q`insert into marts.entity_flags (entity_id, role, name_display, county, n_das, total_ron, cri, n_flags, flags)
    select g.eid, g.role, e.name_display, null, g.n, g.v, 0.5, 1, '[]'::jsonb from (
      select authority_entity_id eid, 'authority' role, count(*) n, sum(closing_value) v from core.direct_acquisitions
      where authority_entity_id is not null and state = 'Oferta acceptata' and closing_value > 0 and closing_value <= 2000000 group by 1
      union all
      select supplier_entity_id, 'supplier', count(*), sum(closing_value) from core.direct_acquisitions
      where supplier_entity_id is not null and supplier_entity_id <> authority_entity_id and state = 'Oferta acceptata' and closing_value > 0 and closing_value <= 2000000 group by 1
    ) g join core.entities e on e.id = g.eid`;
  forgetMartColumns();
}

/** What a reader sees of a drawer: its figures, its period and its page's records in order. */
async function drawer(q: DbSql, spec: AskSpec, page = 0, opts: DrillOpts = {}, grounding: Grounding = {}) {
  const r = await runRows(q, spec, grounding, page, opts);
  if ("error" in r) throw new Error(r.error);
  return {
    total: r.total, value: r.value, sourceTotal: r.sourceTotal, sourceValue: r.sourceValue, dateFrom: r.dateFrom, dateTo: r.dateTo,
    page: r.page, rows: r.rows.map((x) => `${x.src}:${x.refId}:${x.supplierId ?? "-"}:${x.valueExact}`), reconciled: r.profileReconciled,
  };
}

const firms: AskSpec = { block: "scatter", measure: "value", dim: "supplier", filters: {} };
const institutions: AskSpec = { block: "scatter", measure: "value", dim: "authority", filters: {} };
const ranking: AskSpec = { block: "table", measure: "value", dim: "supplier", filters: {} };
const ranking2024: AskSpec = { block: "table", measure: "value", dim: "supplier", filters: { yearFrom: 2024, yearTo: 2024 } };
const size2024: AskSpec = { block: "stat", measure: "value", dim: "supplier", filters: { yearFrom: 2024, yearTo: 2024, purchaseValueMin: 400 } };
const DRAWERS: [string, AskSpec, number, DrillOpts][] = [
  ["firms' profiles", firms, 0, {}], ["firms' profiles, page 2", firms, 1, {}], ["firms' profiles, lowest first", firms, 0, { dir: "asc" }],
  ["firms' profiles by date", firms, 0, { sort: "date" }], ["institutions' profiles", institutions, 0, {}], ["institutions' profiles, page 3", institutions, 2, {}],
  ["the national ranking", ranking, 0, {}], ["the ranking of 2024", ranking2024, 0, {}], ["the ranking of 2024, page 2", ranking2024, 1, {}],
  ["at least 400 lei, 2024", size2024, 0, {}], ["at least 400 lei, 2024, page 2", size2024, 1, {}],
];

describe.runIf(Boolean(connection))("the source lists of the marts stage (dedicated rollback fixture)", () => {
  it("lists after the build exactly what the live drawers list before it", async () => {
    await withAskFixture(connection!.sql, "pre_sources", load, async (q) => {
      // A fixture's cohorts are small: every one takes the rollup path once built.
      profileLimitsForTests({ records: 1, walk: 1000 });
      forgetRollupsReady();
      expect(await valueKeysReady(q)).toBe(false);
      const before = new Map<string, Awaited<ReturnType<typeof drawer>>>();
      for (const [name, spec, page, opts] of DRAWERS) before.set(name, await drawer(q, spec, page, opts));
      // The firms' profiles (at least ten records): the 150, the one at the ceiling, the one without an institution, firm
      // 10's two at institutions 3 and 4; not the self-supply (no supplier, as core counts it) nor firm 13 (two records).
      expect(before.get("firms' profiles")!.sourceTotal).toBe(154);
      expect(before.get("at least 400 lei, 2024")!.sourceTotal).toBeGreaterThan(10);

      await buildAskRollups(q);
      for (const index of TRANSACTION_MART_BUILD_INDEXES) await q.unsafe(index.definition);
      forgetRollupsReady();
      expect([await valueKeysReady(q), await yearKeysReady(q)]).toEqual([true, true]);
      for (const [name, spec, page, opts] of DRAWERS) expect([name, await drawer(q, spec, page, opts)]).toEqual([name, before.get(name)]);
      // The rollup's totals are said in the drawer; the profiles reconcile with them as with core.
      const rolled = await runRows(q, firms, {}, 0);
      if ("error" in rolled) throw new Error(rolled.error);
      // The reconciliation is the same check as before (here false: the profiles leave out the record without an institution,
      // `supplier <> authority` being null there, which the sources count, as core does).
      expect([rolled.scopeNotes.filter((n) => n.startsWith("Numărul și suma surselor vin din")).length, rolled.profileReconciled, rolled.profileCount])
        .toEqual([1, before.get("firms' profiles")!.reconciled, 3]);
      // A walk too short for the page (a sparse cohort): the page reads core as before.
      profileLimitsForTests({ records: 1, walk: 3 });
      for (const [name, spec, page, opts] of DRAWERS.filter(([, s]) => s.block === "scatter"))
        expect([name, await drawer(q, spec, page, opts)]).toEqual([name, before.get(name)]);
      // Below the threshold: core counted live, without the note.
      profileLimitsForTests({ records: 10_000, walk: 1000 });
      const live = await runRows(q, firms, {}, 0);
      if ("error" in live) throw new Error(live.error);
      expect(live.scopeNotes.some((n) => n.startsWith("Numărul și suma surselor vin din"))).toBe(false);
      profileLimitsForTests(null);
    });
  });

  it("compares in two passes what the six queries gave, reads a network group's partners once and a firm's page from its index", async () => {
    await withAskFixture(connection!.sql, "pre_sources_passes", load, async (q) => {
      // The comparison's record pass against the three inline queries of before (streams, years, domains).
      const slim = q`(
        select authority_id, supplier_id, county, cpv_code, closing_value, finalization_date, null::boolean as is_single_bidder, 'da'::text as src
        from marts.da_transactions
        union all
        select authority_id, supplier_id, county, cpv_code, closing_value, finalization_date, is_single_bidder, 'contracts'::text
        from marts.contract_transactions
      )` as unknown as Fragment;
      for (const [dataset, source, src] of [["all", slim, q`d.src`], ["da", q`marts.da_transactions`, q`${"da"}::text`]] as const) {
        const where = (dataset === "all"
          ? q`d.closing_value > 0 and (d.src = 'contracts' or d.closing_value <= 2000000) and d.supplier_id in (${"10"}, ${"11"})`
          : q`d.closing_value > 0 and d.closing_value <= 2000000 and d.supplier_id in (${"10"}, ${"11"})`) as unknown as Fragment;
        const parts = { source: source as unknown as Fragment, where, focalRole: "supplier" as const, focalId: "10", compareId: "11" };
        const pass = await compareRecordPass(q, parts, { src: src as unknown as Fragment, singleBid: dataset !== "da", domains: COMPARE_DOMAINS });
        const singleBid = dataset === "da" ? q`0 single_bid, 0 single_known` : q`count(*) filter (where d.is_single_bidder) single_bid, count(*) filter (where d.is_single_bidder is not null) single_known`;
        const streams = await q`select d.supplier_id::text id, ${src} src, sum(d.closing_value)::text value, count(*)::int n, ${singleBid},
            coalesce(sum(d.closing_value) filter (where d.cpv_code is null), 0)::text no_cpv
          from ${source} d where ${where} group by 1, 2`;
        const years = await q`select d.supplier_id::text id, substr(d.finalization_date, 1, 4)::int y, sum(d.closing_value)::text value, count(*)::int n
          from ${source} d where ${where} and d.finalization_date is not null group by 1, 2`;
        const domains = await q`select id, g, value, groups from (
            select d.supplier_id::text id, substr(d.cpv_code, 1, 5) g, sum(d.closing_value) value,
                   row_number() over (partition by d.supplier_id order by sum(d.closing_value) desc, substr(d.cpv_code, 1, 5)) r,
                   count(*) over (partition by d.supplier_id)::int groups
            from ${source} d where ${where} and d.cpv_code is not null group by d.supplier_id, 2) x
          where r <= ${COMPARE_DOMAINS}`;
        const key = (r: Record<string, unknown>) => JSON.stringify(Object.entries(r).map(([k, v]) => [k, String(v)]).sort());
        const same = (a: readonly Record<string, unknown>[], b: readonly Record<string, unknown>[]) => expect([dataset, a.map(key).sort()]).toEqual([dataset, b.map(key).sort()]);
        same(pass.streams, [...streams]); same(pass.years, [...years]); same(pass.domains, [...domains]);
        expect(pass.streams.every((r) => typeof r.n === "number")).toBe(true);
      }

      // A network group's sources: the partners read once, the records by id, as the semi-join selected them.
      const alfa: Grounding = { supplier: { entityId: "10", nameDisplay: "Alfa SRL", query: "Alfa", county: null, alternatives: [] } };
      for (const partners of ["gone", "new", "continuing"] as const) {
        const spec: AskSpec = { block: "network", measure: "value", dim: "authority", filters: { supplierId: 10 }, network: { partners, since: 2024 } };
        const got = await drawer(q, spec, 0, { limit: 1000 }, alfa);
        const ctx = predicateContext(q, spec, alfa, { dataset: "all", yearFrom: null, yearTo: null, seat: false });
        const members = networkMembersCond(q, { ctx, dataset: "all", focalRole: "supplier", focalId: "10", group: partners, since: 2024, signals: false, every: null })!;
        const [want] = await q`select count(*)::int n, coalesce(sum(d.closing_value), 0)::text v from ${slim} d
          where d.closing_value > 0 and (d.src = 'contracts' or d.closing_value <= 2000000) and d.supplier_id = 10 and d.authority_id is not null and ${members}`;
        expect([partners, got.sourceTotal, Number(got.sourceValue).toFixed(2)]).toEqual([partners, want!["n"], Number(want!["v"]).toFixed(2)]);
        expect([partners, got.rows.length, got.rows.length > 0]).toEqual([partners, want!["n"], true]);
      }

      // A named firm's drawer by value (its default) and by date: the covering index's keys, then the records, in the plain order.
      await q.unsafe(TRANSACTION_MART_BUILD_INDEXES.find((i) => i.name === "da_tx_supplier_cover_idx")!.definition);
      await q.unsafe(TRANSACTION_MART_BUILD_INDEXES.find((i) => i.name === "da_tx_authority_cover_idx")!.definition);
      forgetRollupsReady();
      const firm: AskSpec = { block: "table", measure: "value", dim: "authority", filters: { supplierId: 10 } };
      for (const [sort, column] of [["value", "closing_value"], ["date", "finalization_date"]] as const) {
        const want = await q`select d.src, d.ref_id::text ref, d.supplier_id::text s, d.closing_value::text v from (
            select sicap_da_id ref_id, authority_id, supplier_id, closing_value, finalization_date, 'da'::text src from marts.da_transactions
            union all select contract_id, authority_id, supplier_id, closing_value, finalization_date, 'contracts' from marts.contract_transactions) d
          where d.closing_value > 0 and (d.src = 'contracts' or d.closing_value <= 2000000) and d.supplier_id = 10 and d.authority_id is not null
          order by ${q(column)} desc nulls last, d.src, d.ref_id, d.supplier_id nulls first` as unknown as { src: string; ref: string; s: string; v: string }[];
        for (const page of [0, 1, 2]) {
          const got = await runRows(q, firm, alfa, page, { sort });
          if ("error" in got) throw new Error(got.error);
          expect([sort, page, got.rows.map((r) => `${r.src}:${r.refId}:${r.supplierId}:${r.valueExact}`)])
            .toEqual([sort, page, want.slice(page * 10, page * 10 + 10).map((r) => `${r.src}:${r.ref}:${r.s}:${r.v}`)]);
        }
      }
    });
  });
});
