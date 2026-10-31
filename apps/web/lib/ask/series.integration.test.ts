import { afterAll, describe, expect, it } from "vitest";
import { buildAskRollups, createDb, type DbSql } from "@seap/db";
import { runRows, runSpec, type BlockData } from "./compile";
import { ground } from "./ground";
import { barFacts, forgetAnswerFacts, MIX_LIVE, mixFacts } from "./answer-facts";
import { forgetFacets } from "./facets";
import type { BarsResult, MixResult } from "./facet-parts";
import { forgetAuthorityKinds } from "./authority-kind";
import { forgetRollupsReady } from "./rollups";
import { forgetMixEmployeesReady, forgetMixRollupReady, mixEmployeesReady, mixRollupReady } from "./series-rollups";
import { forgetMartColumns } from "./mart-columns";
import { sumDecimalStrings } from "./evidence";
import { VALUE_RANGES } from "./purchase";
import type { AskSpec } from "./spec";
import { ENGINE_GLOBAL_TABLES, ENGINE_MARTS_TABLES, testDatabaseUrl, withAskFixture } from "./test-fixture";

/*
 * F3-rows on a synthetic fixture (plan §4.1–§4.3, §6.2): the evolution's
 * options (month by month, split by channel or domain, the same months) add up
 * to the answer they split and give its sources; agg_months and
 * agg_national_mix give the live answers to the leu; a row of „Din care” is the
 * answer after „Doar acestea ›” and its sources; a bar's largest record and its
 * contracts above the 1 bn lei cap; the employees of a ranking of firms are a
 * group (CÂȘTIGĂTORII, table:employees-2): the list narrows to the band, the
 * total stays the selection's. A dedicated seap_test_* database, rolled back.
 */

const testUrl = testDatabaseUrl("Series fixtures");
const connection = testUrl ? createDb(testUrl) : null;
afterAll(async () => { await connection?.sql.end(); });

async function load(q: DbSql) {
  await q`insert into marts.national_stats (kind,year) values ('da',2024),('da',2025),('award',2024),('award',2025)`;
  await q`insert into marts.spend_by_county (county) values ('Cluj'),('Iasi')`;
  await q`insert into marts.entity_profile (entity_id,role,name_display,county,employees,is_foreign,n_das,n_contracts) values
    (1,'authority','Spitalul Judetean Cluj','Cluj',null,false,0,0),(2,'authority','Comuna Feleacu','Cluj',null,false,0,0),
    (3,'authority','Municipiul Iasi','Iasi',null,false,0,0),(4,'authority','Spitalul Clinic Iasi','Iasi',null,false,0,0),
    (5,'authority','Autoritate fara judet',null,null,false,0,0),
    (10,'supplier','Furnizor A','Bucuresti',5,false,0,0),(11,'supplier','Furnizor B','Cluj',50,false,0,0),(12,'supplier','Furnizor C','Iasi',3,false,0,0),
    (13,'supplier','Furnizor D',null,null,false,0,0),(14,'supplier','Furnizor E','Ilfov',0,false,0,0)`;
  await q`insert into core.entities (id, name_display, name_normalized, cui_valid) select entity_id, name_display, lower(name_display), true from marts.entity_profile`;
  const names = `(select entity_id, name_display from marts.entity_profile)`;
  // Every kind of code and one without; a DA at and one above the 2 mil. lei ceiling, a zero; every size range; months across both years.
  await q.unsafe(`insert into marts.da_transactions (sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date)
    select v.id, 'DA'||v.id, v.a, an.name_display, v.s, sn.name_display, v.county, v.cpv, v.cv, v.dt
    from (values
      (101,1,10,'Cluj','33600000-6',1000.10,'2024-03-01 10:00'),
      (102,1,10,'Cluj','33600000-6',2000.25,'2025-03-01 10:00'),
      (103,1,11,'Cluj','45000000-7',50000.5,'2025-05-01 10:00'),
      (104,2,11,'Cluj','45233140-2',3000,'2024-06-01 10:00'),
      (105,2,12,'Cluj','79100000-0',750.75,'2025-07-01 10:00'),
      (106,3,12,'Iasi','33600000-6',150000,'2024-02-01 10:00'),
      (107,3,13,'Iasi','30190000-7',2500.5,'2025-02-01 10:00'),
      (108,4,13,'Iasi','48000000-8',4000,'2025-08-01 10:00'),
      (109,4,10,'Iasi','33600000-6',1999999.99,'2025-09-01 10:00'),
      (110,4,10,'Iasi','33600000-6',2000000.01,'2025-09-02 10:00'),
      (111,5,14,null,'45000000-7',800,'2024-11-01 10:00'),
      (112,3,13,'Iasi',null,120,'2025-01-15 10:00'),
      (113,1,14,'Cluj','90000000-7',0,'2025-01-01 10:00'),
      (114,2,12,'Cluj','90900000-6',2000000,'2025-10-01 10:00'),
      (115,3,14,'Iasi','33600000-6',333.33,'2024-04-04 10:00')
    ) v(id,a,s,county,cpv,cv,dt)
    left join ${names} an on an.entity_id = v.a left join ${names} sn on sn.entity_id = v.s`);
  // Every procedure class, a consortium, offers known (one, several) and unknown.
  await q.unsafe(`insert into marts.contract_transactions (contract_id,contract_no,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date,ca_notice_id,n_winners,contract_value_full,procedure_type,is_single_bidder)
    select v.id, 'C'||v.id, v.a, an.name_display, v.s, sn.name_display, v.county, v.cpv, v.cv, v.dt, 900+v.id, v.nw, v.vfull, v.pt, v.sb
    from (values
      (201,1,11,'Cluj','45000000-7',3000000,'2025-04-01',1,3000000,'Licitatie deschisa',true),
      (202,3,10,'Iasi','45233140-2',600000,'2024-09-01',2,1200000,'Licitatie deschisa accelerata',false),
      (202,3,12,'Iasi','45233140-2',600000,'2024-09-01',2,1200000,'Licitatie deschisa accelerata',false),
      (203,4,13,'Iasi','33600000-6',90000,'2025-06-01',1,90000,'Procedura simplificata',null),
      (204,5,11,null,'30190000-7',7000,'2025-12-01',1,7000,'Negociere fara publicare prealabila',null),
      (205,2,14,'Cluj',null,65000,'2025-03-03',1,65000,'Licitatie restransa',false),
      (206,1,12,'Cluj','79100000-0',5000,'2024-05-05',1,5000,'',true)
    ) v(id,a,s,county,cpv,cv,dt,nw,vfull,pt,sb)
    left join ${names} an on an.entity_id = v.a left join ${names} sn on sn.entity_id = v.s`);
  for (const role of ["authority", "supplier"] as const) {
    const id = role === "authority" ? "authority_id" : "supplier_id";
    await q.unsafe(`update marts.entity_profile ep set
        total_ron_split = coalesce((select sum(d.closing_value) from marts.da_transactions d where d.${id} = ep.entity_id and d.closing_value > 0 and d.closing_value <= 2000000), 0)
          + coalesce((select sum(c.closing_value) from marts.contract_transactions c where c.${id} = ep.entity_id and c.closing_value > 0), 0),
        n_das = (select count(*) from marts.da_transactions d where d.${id} = ep.entity_id and d.closing_value > 0 and d.closing_value <= 2000000),
        n_contracts = (select count(*) from marts.contract_transactions c where c.${id} = ep.entity_id and c.closing_value > 0)
      where ep.role = '${role}'`);
  }
  // Two source contracts above the 1 bn lei cap: in March 2025, and at 22:30 UTC on 30 June 2024 (1 July in Romania).
  await q`insert into core.awards (raw_id, ca_notice_id, notice_no, authority_entity_id, cpv_code, procedure_type) values (1, 990001, 'CAN1', 3, '45233140-2', 'Licitatie deschisa')`;
  await q`insert into core.contracts (id, raw_id, ca_notice_contract_id, ca_notice_id, contract_no, contract_date, contract_value, currency, title) values
    (99001, 1, 99001, 990001, 'X1', '2025-03-10T09:00:00Z', 6626404001, 'RON', 'Autostradă'),
    (99002, 1, 99002, 990001, 'X2', '2024-06-30T22:30:00Z', 4729755332.14, 'RON', 'Varianta ocolitoare')`;
  await q`insert into core.contract_winners (contract_id, entity_id) values (99001, 10), (99002, 12)`;
}

const Y: AskSpec["filters"] = { yearFrom: 2024, yearTo: 2025 };
const series = (filters: AskSpec["filters"] = Y, timeseries?: AskSpec["timeseries"], extra: Partial<AskSpec> = {}): AskSpec =>
  ({ block: "timeseries", measure: "value", filters, ...(timeseries ? { timeseries } : {}), ...extra });
const stat = (filters: AskSpec["filters"] = Y, extra: Partial<AskSpec> = {}): AskSpec => ({ block: "stat", measure: "value", filters, ...extra });
const cents = (n: number) => Math.round(n * 100) / 100;

async function answer(q: DbSql, spec: AskSpec): Promise<BlockData> {
  const r = await runSpec(q, spec, await ground(q, spec.filters, spec.population));
  if ("error" in r) throw new Error(`${JSON.stringify(spec)}: ${r.error}`);
  return r.data;
}
async function points(q: DbSql, spec: AskSpec) {
  const d = await answer(q, spec);
  if (d.block !== "timeseries") throw new Error(d.block);
  return d;
}
async function total(q: DbSql, spec: AskSpec): Promise<{ n: number; value: number }> {
  const d = await answer(q, spec);
  if (d.block !== "stat") throw new Error(d.block);
  return { n: d.stat.count, value: cents(d.stat.value) };
}
async function sources(q: DbSql, spec: AskSpec): Promise<{ n: number; value: number }> {
  const r = await runRows(q, spec, await ground(q, spec.filters, spec.population), 0);
  if ("error" in r) throw new Error(r.error);
  return { n: r.sourceTotal, value: cents(Number(r.sourceValue)) };
}
const mixOf = (r: MixResult | object): MixResult => { if (!("part" in r) || r.part !== "mix") throw new Error(JSON.stringify(r)); return r as MixResult; };
const barsOf = (r: BarsResult | object): BarsResult => { if (!("part" in r) || r.part !== "bars") throw new Error(JSON.stringify(r)); return r as BarsResult; };
const strip = <T extends { tookMs: number; checkpoint: string | null }>(r: T) => { const { tookMs: _t, checkpoint: _c, ...core } = r; return core; };

/** „Doar acestea ›” on a row of „Din care”: the condition its window writes (StatMix.tsx mixOnly), or none (records without a code). */
function only(draft: AskSpec, tab: "kind" | "procedure" | "size", value: string): AskSpec | null {
  const f = draft.filters;
  if (tab === "kind") return value === "none" ? null : stat({ ...f, purchaseKind: value as "lucrari" });
  if (tab === "procedure") return value === "da" ? stat(f, { dataset: "da" }) : stat({ ...f, procedure: value as "deschisa" }, { dataset: "contracts" });
  const { purchaseValueMin: min, purchaseValueMax: max } = VALUE_RANGES[Number(value)]!;
  return stat({ ...f, ...(min !== undefined ? { purchaseValueMin: min } : {}), ...(max !== undefined ? { purchaseValueMax: max } : {}) });
}
/** Every tab adds up to the total; every row is the answer after „Doar acestea ›”, and that answer's sources. */
async function expectMix(q: DbSql, draft: AskSpec, mix: MixResult): Promise<void> {
  const whole = await total(q, draft);
  expect([mix.total.n, cents(mix.total.value_ron)]).toEqual([whole.n, whole.value]);
  for (const tab of ["kind", "procedure", "size"] as const) {
    expect([tab, mix[tab].reduce((t, r) => t + r.n, 0), cents(mix[tab].reduce((t, r) => t + r.value_ron, 0))]).toEqual([tab, whole.n, whole.value]);
    for (const row of mix[tab]) {
      const chosen = only(draft, tab, row.value);
      if (!chosen) continue;
      const [after, rows] = [await total(q, chosen), await sources(q, chosen)];
      expect([tab, row.value, row.n, cents(row.value_ron)]).toEqual([tab, row.value, after.n, after.value]);
      expect([tab, row.value, rows]).toEqual([tab, row.value, after]);
    }
  }
}

/** The evolutions of the fixture, each checked live and then from agg_months. */
const SERIES: { name: string; spec: AskSpec }[] = [
  { name: "years", spec: series() },
  { name: "by channel", spec: series(Y, { split: "channel" }) },
  { name: "by domain", spec: series(Y, { split: "domain" }) },
  { name: "by domain, records", spec: series(Y, { split: "domain" }, { measure: "count" }) },
  { name: "month by month", spec: series(Y, { grain: "month" }) },
  { name: "month by month, Cluj, by channel", spec: series({ ...Y, county: "Cluj" }, { grain: "month", split: "channel" }) },
  { name: "month by month, works", spec: series({ ...Y, purchaseKind: "lucrari" }, { grain: "month" }) },
  { name: "February–May", spec: series(Y, { months: [2, 5] }) },
  { name: "February–May, direct acquisitions, by domain", spec: series(Y, { months: [2, 5], split: "domain" }, { dataset: "da" }) },
  { name: "from March 2024 to August 2025, month by month", spec: series({ ...Y, monthFrom: 3, monthTo: 8 }, { grain: "month" }) },
];

describe.runIf(Boolean(connection))("F3-rows: the evolution's options, „Din care”, the bars' facts and the ranked firms' employees (dedicated rollback fixture)", () => {
  it("add up, give their sources and the rollups' answers to the leu", async () => {
    await withAskFixture(connection!.sql, "series_fixture", load, async (q) => {
      forgetAuthorityKinds(); forgetRollupsReady(); forgetMixRollupReady(); forgetMixEmployeesReady(); forgetMartColumns(); forgetFacets(); forgetAnswerFacts();
      expect([await mixRollupReady(q), await mixEmployeesReady(q)]).toEqual([false, false]);

      // 1. Live: every series of the fixture.
      const live = new Map<string, Extract<BlockData, { block: "timeseries" }>>();
      for (const c of SERIES) live.set(c.name, await points(q, c.spec));
      const years = live.get("years")!.series;
      // 2024: five DAs and three contract rows; 2025: eight DAs (one above the ceiling and a zero left out) and four contracts.
      expect(years.map((p) => [p.year, cents(p.value), p.count])).toEqual([[2024, 1360133.43, 8], [2025, 7221371.99, 12]]);
      // A split's parts add up to the bar it splits, and each channel is the channel's own evolution.
      const byYear = new Map(years.map((p) => [p.year, p]));
      for (const name of ["by channel", "by domain"]) for (const p of live.get(name)!.series) {
        const parts = Object.values(p.parts!);
        expect([name, p.year, cents(p.value), p.count]).toEqual([name, p.year, cents(byYear.get(p.year)!.value), byYear.get(p.year)!.count]);
        expect([name, p.year, sumDecimalStrings(parts.map((x) => String(x.value))), parts.reduce((t, x) => t + x.count, 0)])
          .toEqual([name, p.year, sumDecimalStrings([String(p.value)]), p.count]);
      }
      for (const channel of ["da", "contracts"] as const) {
        const own = await points(q, series(Y, undefined, { dataset: channel }));
        expect([channel, live.get("by channel")!.series.map((p) => cents(p.parts?.[channel]?.value ?? 0))]).toEqual([channel, own.series.map((p) => cents(p.value))]);
      }
      // The domains: Medicale, Construcții and the rest (records without a code, the small divisions) on top.
      expect(live.get("by domain")!.parts!.map((p) => p.key)).toEqual(["45", "33", "90", "other"]);
      // Month by month adds up to the years; every month bar is its records (the sources of the bar's month).
      const months = live.get("month by month")!;
      expect(months.grain).toBe("month");
      for (const year of [2024, 2025]) {
        const of = months.series.filter((p) => p.year === year);
        expect([year, cents(of.reduce((t, p) => t + p.value, 0)), of.reduce((t, p) => t + p.count, 0)]).toEqual([year, cents(byYear.get(year)!.value), byYear.get(year)!.count]);
      }
      for (const p of months.series.slice(0, 4))
        expect([p.year, p.month, await sources(q, stat({ yearFrom: p.year, yearTo: p.year, monthFrom: p.month!, monthTo: p.month! }))])
          .toEqual([p.year, p.month, { n: p.count, value: cents(p.value) }]);
      // The same months: each year on February–May, the months' bars added, the trend's two years on the same months.
      const same = live.get("February–May")!;
      expect(same.months).toEqual({ from: 2, to: 5, mode: "chosen" });
      for (const p of same.series) {
        const of = months.series.filter((m) => m.year === p.year && m.month! >= 2 && m.month! <= 5);
        expect([p.year, cents(p.value), p.count]).toEqual([p.year, cents(of.reduce((t, m) => t + m.value, 0)), of.reduce((t, m) => t + m.count, 0)]);
      }
      const trend = await answer(q, { block: "trend", dim: "supplier", measure: "value", topN: 10, filters: Y, trend: { months: [2, 5] } });
      if (trend.block !== "trend") throw new Error("trend expected");
      expect([cents(trend.composition!.all!.valueA), cents(trend.composition!.all!.valueB)]).toEqual(same.series.map((p) => cents(p.value)));
      // A bar's sources on the same months: its records.
      expect(await sources(q, series({ yearFrom: 2025, yearTo: 2025 }, { months: [2, 5] })))
        .toEqual({ n: same.series[1]!.count, value: cents(same.series[1]!.value) });

      // 2. „Din care”, live on an anchored selection (a county); nationally it waits on agg_national_mix (PRECOMPUTE.md).
      const draft = stat(), cluj = stat({ ...Y, county: "Cluj" });
      const whole = await total(q, draft);
      expect(await mixFacts(q, draft)).toEqual({ precompute: MIX_LIVE });
      const mixCluj = mixOf(await mixFacts(q, cluj));
      await expectMix(q, cluj, mixCluj);
      expect(mixCluj.kind.map((r) => r.value)).toEqual(["lucrari", "servicii", "produse", "none"]);
      // The offers of Cluj's contracts: one (201, 206), several (205).
      expect(mixCluj.offers!.rows.map((r) => [r.value, r.n])).toEqual([["one", 2], ["several", 1]]);
      // S6 over-bar: of firms of a size, live on a county; nationally it waits on agg_mix_employees (step 5).
      const band = { minEmployees: 1, maxEmployees: 9 };
      const clujBand = stat({ ...Y, county: "Cluj", ...band }), draftBand = stat(band);
      expect(await mixFacts(q, draftBand)).toEqual({ precompute: MIX_LIVE });
      const mixClujBand = mixOf(await mixFacts(q, clujBand));
      await expectMix(q, clujBand, mixClujBand);
      // The totals by a size of the ranges, a procedure, the single bidder: live here, from agg_national_mix after step 5
      // (S4 review: national, under 10.000 lei in 2025, 2.4–3.3 s live).
      const MIXED: AskSpec[] = [stat({ ...Y, purchaseValueMin: 1_000_000 }), stat({ ...Y, purchaseValueMax: 10_000 }), stat({ purchaseValueMin: 10_000, purchaseValueMax: 100_000 }),
        stat({ ...Y, procedure: "deschisa" }, { dataset: "contracts" }), stat({ ...Y, singleBidder: true }, { dataset: "contracts" }), stat({ ...Y, purchaseValueMin: 1_000_000 }, { dataset: "da" })];
      const mixedLive: { n: number; value: number }[] = [];
      for (const spec of MIXED) mixedLive.push(await total(q, spec));
      expect(mixedLive.filter((t) => t.n > 0).length).toBeGreaterThan(3);

      // 3. The bars' facts, live: an anchored selection reads its largest records; nationally they wait on the rollup.
      const largest = async (filters: string) => Object.fromEntries((await q.unsafe(`
        select k, max(v)::text v from (
          select substr(finalization_date, 1, 4) k, closing_value v from marts.da_transactions where closing_value > 0 and closing_value <= 2000000 ${filters}
          union all select substr(finalization_date, 1, 4), closing_value from marts.contract_transactions where closing_value > 0 ${filters}
        ) x where k between '2024' and '2025' group by 1`) as unknown as { k: string; v: string }[]).map((r) => [r.k, Number(r.v)]));
      const barsCluj = barsOf(await barFacts(q, series({ ...Y, county: "Cluj" })));
      expect(Object.fromEntries(Object.entries(barsCluj.max!).map(([k, m]) => [k, m.value]))).toEqual(await largest("and county = 'Cluj'"));
      expect(barsOf(await barFacts(q, series())).max).toBeNull();
      // The contracts above the cap, by the bar's period in Romania: 2025-03 and 2024-07 (22:30 UTC on 30 June).
      const monthly = barsOf(await barFacts(q, series(Y, { grain: "month" })));
      expect(Object.fromEntries(Object.entries(monthly.above!).map(([k, a]) => [k, [a.n, a.rows.map((r) => r.natId)]]))).toEqual({ "2024-07": [1, ["99002"]], "2025-03": [1, ["99001"]] });
      // A firm's: its own contract only; Cluj (the awarding authority is in Iași): none.
      const firm = barsOf(await barFacts(q, series({ ...Y, supplierId: 10, supplierName: "Furnizor A" })));
      expect(Object.keys(firm.above!)).toEqual(["2025"]);
      expect(barsCluj.above).toEqual({});
      // F4: the winner's seat against the awarding authority's county (Iași): 12 (Iași) won in its county, 10 (București)
      // in another, none abroad; before the review every seat listed both contracts.
      await q`update core.entities set county = 'Iasi' where id = 3`;
      const seated = async (firmSeat: "same" | "other" | "abroad") => Object.keys(barsOf(await barFacts(q, series({ ...Y, firmSeat }))).above!);
      expect([await seated("same"), await seated("other"), await seated("abroad")]).toEqual([["2024"], ["2025"], []]);
      await q`update core.entities set county = null where id = 3`;

      // 4. The ranked firms' employees (CÂȘTIGĂTORII, table:employees-2): the list narrows to the band, the total and
      // „% din total” stay the selection's, the band's figures are those of a total over the same firms.
      const rankingLive = await answer(q, { block: "table", dim: "supplier", measure: "value", topN: 10, filters: { ...Y, ...band } });
      const checkRanking = async (d: BlockData, label: string) => {
        if (d.block !== "table") throw new Error("table expected");
        const banded = await total(q, stat({ ...Y, ...band }));
        expect([label, d.rows.map((r) => r.entityId).sort()]).toEqual([label, ["10", "12"]]);
        expect([label, d.totals && cents(d.totals.value), d.totals?.count]).toEqual([label, whole.value, whole.n]);
        expect([label, d.group && cents(d.group.value), d.group?.count, d.group?.entities]).toEqual([label, banded.value, banded.n, 2]);
      };
      await checkRanking(rankingLive, "live");
      const pagedLive = await answer(q, { block: "table", dim: "supplier", measure: "value", filters: { ...Y, ...band } });
      if (pagedLive.block !== "table") throw new Error("table expected");
      expect([pagedLive.total, pagedLive.rows.length]).toEqual([2, 2]);

      // 5. The rollups: agg_months and agg_national_mix give every answer above to the leu.
      const report = await buildAskRollups(q);
      expect([report.rows.agg_months! > 0, report.rows.agg_national_mix! > 0]).toEqual([true, true]);
      forgetRollupsReady(); forgetMixRollupReady(); forgetMixEmployeesReady(); forgetFacets(); forgetAnswerFacts();
      expect([await mixRollupReady(q), await mixEmployeesReady(q), report.rows.agg_mix_employees > 0]).toEqual([true, true, true]);
      for (const c of SERIES) expect([c.name, await points(q, c.spec)]).toEqual([c.name, live.get(c.name)]);
      expect(strip(mixOf(await mixFacts(q, cluj)))).toEqual(strip(mixCluj));
      // Nationally from agg_national_mix: each row is its answer and its sources too.
      const mixNational = mixOf(await mixFacts(q, draft));
      await expectMix(q, draft, mixNational);
      expect([mixNational.total.n, cents(mixNational.total.value_ron)]).toEqual([whole.n, whole.value]);
      expect(mixNational.kind.map((r) => r.value)).toEqual(["lucrari", "produse", "servicii", "none"]);
      // The offers of the contracts: one (201, 206), several (the two winners of 202, and 205), unknown (203, 204).
      expect(mixNational.offers!.rows.map((r) => [r.value, r.n])).toEqual([["one", 2], ["several", 3], ["unknown", 2]]);
      // Of firms of a size: from agg_mix_employees, the county's the same as live, the country's each row its answer and
      // sources; a range off the kit's bands still waits.
      expect(strip(mixOf(await mixFacts(q, clujBand)))).toEqual(strip(mixClujBand));
      const mixNationalBand = mixOf(await mixFacts(q, draftBand));
      await expectMix(q, draftBand, mixNationalBand);
      expect(mixNationalBand.total.n).toBeGreaterThan(0);
      expect(mixNationalBand.total.n).toBeLessThan(mixNational.total.n);
      expect(await mixFacts(q, stat({ minEmployees: 2, maxEmployees: 9 }))).toEqual({ precompute: MIX_LIVE });
      // The totals by a size of the ranges, a procedure, the single bidder: from agg_national_mix now (the marts emptied
      // change none of them), the live ones.
      await q.unsafe("savepoint mixed_only");
      await q`delete from marts.da_transactions`;
      await q`delete from marts.contract_transactions`;
      for (const [i, spec] of MIXED.entries()) expect([i, await total(q, spec)]).toEqual([i, mixedLive[i]]);
      await q.unsafe("rollback to savepoint mixed_only");
      // A size typed in (not the ranges of the rollup) is read live, the same as the answer.
      const typed = stat({ ...Y, purchaseValueMin: 50_000, purchaseValueMax: 250_000 });
      expect(await mixFacts(q, typed)).toEqual({ precompute: MIX_LIVE });
      const barsRolled = barsOf(await barFacts(q, series({ ...Y, county: "Cluj" })));
      expect(barsRolled.max).toEqual(barsCluj.max);
      // Nationally now: each year's largest record and its channel.
      const national = barsOf(await barFacts(q, series()));
      expect(Object.fromEntries(Object.entries(national.max!).filter(([k]) => k >= "2024").map(([k, m]) => [k, m.value]))).toEqual(await largest(""));
      expect(national.max!["2025"]).toEqual({ value: 3000000, src: "contracts" });
      await checkRanking(await answer(q, { block: "table", dim: "supplier", measure: "value", topN: 10, filters: { ...Y, ...band } }), "rollups");
      // Without the mix rollups (a build before F3-rows): the live answers, the same.
      await q`drop table marts.agg_months, marts.agg_national_mix`;
      forgetMixRollupReady(); forgetMixEmployeesReady(); forgetAnswerFacts();
      expect(await mixEmployeesReady(q)).toBe(false);
      for (const c of SERIES.slice(0, 3)) expect([c.name, await points(q, c.spec)]).toEqual([c.name, live.get(c.name)]);
      expect(strip(mixOf(await mixFacts(q, cluj)))).toEqual(strip(mixCluj));
    }, {
      // The contract identity tables, core.awards and core.contract_winners are the engine's own since F6a's verification.
      marts: ENGINE_MARTS_TABLES,
      globals: [...ENGINE_GLOBAL_TABLES, "app.monitoring_refreshes"],
    });
  });
});
