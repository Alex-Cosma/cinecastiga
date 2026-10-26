import { afterAll, describe, expect, it } from "vitest";
import { buildAskRollups, createDb, TRANSACTION_MART_BUILD_INDEXES, type DbSql } from "@seap/db";
import { CSV_MAX_ROWS, DA_PLAFOND_RON, DATA_CHANGED, runRows, runSpec, TABLE_PAGE_SIZE, type BlockData } from "./compile";
import { employeesCond, trendGroupOf } from "./predicates";
import { trendGroupOfRow, trendListOf, trendNoun, trendPartition, trendProfiles, trendRowLabels, type TrendList } from "./trend-partition";
import { evidenceCsv, sumDecimalStrings } from "./evidence";
import { forgetTrendGroups, trendGroupStats } from "./group-ids";
import {
  compareParties, compareSharedPartners, compareTopPartners, forgetRollupsReady, planRollup, rollupBreakdown, rollupCountyTable, rollupMap,
  coverRefReady, monthRollupReady, rollupDaysReady, rollupMinimumCond, rollupSourceTotals, rollupStat, rollupsReady, rollupTable, rollupTimeseries, rollupTrendGrouped, scatterDensity, type RollupCtx, type RollupNeed,
} from "./rollups";
import { namedKind, type AskSpec } from "./spec";
import { forgetAuthorityKinds, readAuthorityKinds, type AuthorityKinds } from "./authority-kind";
import type { Grounding } from "./ground";
import type { QueryPopulation } from "./population";
import { ENGINE_GLOBAL_TABLES, scoped } from "./test-fixture";
import { forgetMixRollupReady } from "./series-rollups";

const testUrl = process.env["TEST_DATABASE_URL"];
if (testUrl && !/^seap_test_[a-z0-9_]+$/.test(new URL(testUrl).pathname.slice(1))) throw new Error("Rollup fixtures require a dedicated seap_test_* database");
const connection = testUrl ? createDb(testUrl) : null;
afterAll(async () => { await connection?.sql.end(); });

// Spitals in Cluj and Iași, a commune, a municipality, an authority without county;
// firms with 1–9, 50 and unknown employees; DAs at and above the 2M ceiling, a zero,
// one without firm or CPV; contracts with a consortium split, an undated one, one without CPV.
async function load(q: DbSql) {
  await q`insert into marts.national_stats (kind,year) values ('da',2024),('da',2025),('award',2024),('award',2025)`;
  // A firm's n_das + n_contracts are its records in every Ask aggregate (DAs up to the ceiling).
  await q`insert into marts.entity_profile (entity_id,role,name_display,county,employees,n_das,n_contracts) values
    (1,'authority','Spitalul Judetean Cluj','Cluj',null,0,0),(2,'authority','Comuna Feleacu','Cluj',null,0,0),
    (3,'authority','Municipiul Iasi','Iasi',null,0,0),(4,'authority','Spitalul Clinic Iasi','Iasi',null,0,0),
    (5,'authority','Autoritate fara judet',null,null,0,0),
    (10,'supplier','Furnizor A','Bucuresti',5,4,1),(11,'supplier','Furnizor B','Cluj',50,2,2),(12,'supplier','Furnizor C','Iasi',3,2,1),
    (13,'supplier','Furnizor D',null,null,2,1),(14,'supplier','Furnizor E','Ilfov',1,2,1)`;
  // F2's "Prima dată": the first record of firm 13 (new in 2025) is in 2025.
  await q`update marts.entity_profile set first_activity = case entity_id when 13 then '2025-02-01' else '2024-02-01' end where role = 'supplier'`;
  // The transaction marts take their names from core.entities, and so does agg_entity_year.
  await q`insert into core.entities (id, name_display, name_normalized, cui_valid) select entity_id, name_display, lower(name_display), entity_id <> 13 from marts.entity_profile`;
  const names = `(select entity_id, name_display from marts.entity_profile)`;
  await q.unsafe(`insert into marts.da_transactions (sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date)
    select v.id, 'DA'||v.id, v.a, an.name_display, v.s, sn.name_display, v.county, v.cpv, v.cv, v.dt
    from (values
      (101,1,10,'Cluj','33600000-6',1000.10,'2024-03-01 10:00'),
      (102,1,10,'Cluj','33600000-6',2000.25,'2025-03-01 10:00'),
      (103,1,11,'Cluj','45000000-7',500.5,'2025-05-01 10:00'),
      (104,2,11,'Cluj','45233140-2',3000,'2024-06-01 10:00'),
      (105,2,12,'Cluj','09100000-0',750.75,'2025-07-01 10:00'),
      (106,3,12,'Iasi','33600000-6',1500,'2024-02-01 10:00'),
      (107,3,13,'Iasi','30190000-7',2500.5,'2025-02-01 10:00'),
      (108,4,13,'Iasi','33600000-6',4000,'2025-08-01 10:00'),
      (109,4,10,'Iasi','33600000-6',1999999.99,'2025-09-01 10:00'),
      (110,4,10,'Iasi','33600000-6',2000000.01,'2025-09-02 10:00'),
      (111,5,14,null,'45000000-7',800,'2024-11-01 10:00'),
      (112,3,null,'Iasi',null,120,'2025-01-15 10:00'),
      (113,1,14,'Cluj','33600000-6',0,'2025-01-01 10:00'),
      (114,2,10,'Cluj','09100000-0',2000000,'2025-10-01 10:00'),
      (115,3,14,'Iasi','33600000-6',333.33,'2024-04-04 10:00')
    ) v(id,a,s,county,cpv,cv,dt)
    left join ${names} an on an.entity_id = v.a left join ${names} sn on sn.entity_id = v.s`);
  await q.unsafe(`insert into marts.contract_transactions (contract_id,contract_no,authority_id,authority_name,supplier_id,supplier_name,county,cpv_code,closing_value,finalization_date,ca_notice_id,n_winners,contract_value_full,is_single_bidder)
    select v.id, 'C'||v.id, v.a, an.name_display, v.s, sn.name_display, v.county, v.cpv, v.cv, v.dt, 900+v.id, v.nw, v.vfull, v.sb
    from (values
      (201,1,11,'Cluj','45000000-7',3000000,'2025-04-01',1,3000000,true),
      (202,3,10,'Iasi','45233140-2',1234.50,'2024-09-01',2,2469,null),
      (202,3,12,'Iasi','45233140-2',1234.50,'2024-09-01',2,2469,null),
      (203,4,13,'Iasi','33600000-6',5000000,null,1,5000000,false),
      (204,5,11,null,'30190000-7',700,'2025-12-01',1,700,null),
      (205,2,14,'Cluj',null,650,'2025-03-03',1,650,null)
    ) v(id,a,s,county,cpv,cv,dt,nw,vfull,sb)
    left join ${names} an on an.entity_id = v.a left join ${names} sn on sn.entity_id = v.s`);
  // A firm's total_ron_split is its sum over the same records, as the marts build writes it: the ranking of
  // firms by their size alone reads it (compile.ts firmSizeOnly, F3), the live answer of these cases.
  await q`update marts.entity_profile ep set total_ron_split =
      coalesce((select sum(d.closing_value) from marts.da_transactions d where d.supplier_id = ep.entity_id and d.closing_value > 0 and d.closing_value <= 2000000), 0)
    + coalesce((select sum(c.closing_value) from marts.contract_transactions c where c.supplier_id = ep.entity_id and c.closing_value > 0), 0)
    where ep.role = 'supplier'`;
  // Risk profiles for the scatter (n_das >= 10, a null and a zero value).
  await q`insert into marts.entity_flags (entity_id,role,name_display,county,n_das,total_ron,cri,n_flags,flags) values
    (10,'supplier','Furnizor A','Bucuresti',40,2003000.34,0.5,2,'[]'),(11,'supplier','Furnizor B','Cluj',12,3504201,0.25,1,'[]'),
    (12,'supplier','Furnizor C','Iasi',10,3485.25,0,0,'[]'),(13,'supplier','Furnizor D',null,15,null,0.75,3,'[]'),
    (14,'supplier','Furnizor E','Ilfov',11,0,1,4,'[]'),(15,'supplier','Furnizor F','Cluj',9,99,0.5,2,'[]'),
    (16,'supplier','Furnizor G','Cluj',30,0.5,null,0,'[]'),(1,'authority','Spitalul Judetean Cluj','Cluj',20,4000,0.4,2,'[]')`;
}

/** The fixture's institutions by kind (authority-kind.ts, D1), read once it is loaded. */
let fixtureKinds: AuthorityKinds | null = null;
/** predicateContext of the registry stage (lib/ask/predicates.ts), without sql, for these cases. */
const ctxOf = (spec: AskSpec, g: Grounding): RollupCtx => {
  const kind = namedKind(spec.filters.authorityKind) ?? null;
  if (spec.filters.authorityKind === "local_admin") throw new Error("local_admin is refused before the rollups");
  const dataset = spec.dataset ?? "all";
  return {
    plafond: dataset === "contracts" ? "none" : dataset === "da" ? "strict" : "da-branch",
    population: spec.population ?? null, minimumRecords: spec.minimumRecords ?? null,
    cpvPrefixes: g.cpv?.prefixes ?? [], cpvExclude: g.cpv?.excludePrefixes ?? [], county: g.county?.canonical ?? null,
    kind, kindIds: kind ? fixtureKinds!.ids[kind] : null, authorityId: g.authority?.entityId ?? null, supplierId: g.supplier?.entityId ?? null,
    uatSiruta: null, uatAuthorityIds: [], singleBidder: false,
    minEmployees: spec.filters.minEmployees ?? null, maxEmployees: spec.filters.maxEmployees ?? null,
    yearFrom: spec.filters.yearFrom ?? null, yearTo: spec.filters.yearTo ?? null,
    monthFrom: spec.filters.monthFrom ?? null, monthTo: spec.filters.monthTo ?? null, adminSupplierIds: null, comparison: null,
    trendMonths: spec.block === "trend" && Array.isArray(spec.trend?.months) ? spec.trend.months as readonly [number, number] : null,
    seriesMonths: spec.block === "timeseries" && Array.isArray(spec.timeseries?.months) ? spec.timeseries.months as readonly [number, number] : null,
    purchaseKind: spec.filters.purchaseKind ?? null, procedure: spec.filters.procedure ?? null,
    purchaseValueMin: spec.filters.purchaseValueMin ?? null, purchaseValueMax: spec.filters.purchaseValueMax ?? null,
  };
};
const needOf = (spec: AskSpec): RollupNeed => spec.block === "table" || spec.block === "trend"
  ? (spec.dim === "county" ? { by: "county" } : { by: spec.dim ?? "authority" })
  : spec.block === "breakdown" ? { by: "cpv" } : { by: "total" };

/** The engine's mapping of each live query result (compile.ts), applied to the rollup rows. */
async function fromRollups(q: DbSql, spec: AskSpec, g: Grounding, sort?: "name" | "county"): Promise<{ source: string; data: BlockData }> {
  // F3 (table:employees-2): a ranking of firms plans on its selection without the band, then keeps the band's firms.
  const band = spec.block === "table" && spec.dim === "supplier" && (spec.filters.minEmployees !== undefined || spec.filters.maxEmployees !== undefined)
    ? { min: spec.filters.minEmployees ?? null, max: spec.filters.maxEmployees ?? null } : null;
  const ctx = ctxOf(spec, g);
  const plan = planRollup(band ? { ...ctx, minEmployees: null, maxEmployees: null } : ctx, needOf(spec), { months: true });
  if ("reason" in plan) throw new Error(plan.reason);
  const source = plan.source.table === "entity" || plan.source.table === "entityMonth" ? `${plan.source.table}:${plan.source.role}` : plan.source.table;
  const num = (rows: { v: string; n: string }[]) => rows.map((r) => ({ value: Number(r.v), count: Number(r.n) }));
  switch (spec.block) {
    case "table": {
      const paged = spec.topN == null;
      const o = { measure: spec.measure === "count" ? "count" as const : "value" as const, paged, topN: spec.topN ?? 10, page: 0, pageSize: TABLE_PAGE_SIZE, ...(sort ? { sort, dir: "asc" as const } : {}) };
      const meta = (total: number | null) => (paged ? { total: total ?? 0, page: 0, pageSize: TABLE_PAGE_SIZE } : {});
      if (spec.dim === "county") {
        const r = await rollupCountyTable(q, plan, o);
        return { source, data: { block: "table", rows: r.rows.map((p, i) => ({ entityId: null, name: p.c, county: null, ...num(r.rows)[i]!, population: null })), ...meta(r.total) } };
      }
      const keep = band ? (id: ReturnType<DbSql>) => employeesCond(q, band.min, band.max, id) : null;
      const r = await rollupTable(q, plan, { ...o, dim: spec.dim ?? "authority", ...(keep ? { keep } : {}) });
      if ("reason" in r) throw new Error(r.reason);
      const first = r.rows[0];
      return { source, data: { block: "table", rows: r.rows.map((p) => ({ entityId: String(p.id), name: p.nm, county: p.co, value: Number(p.v), count: Number(p.n), population: null })),
        ...meta(r.total), ...(first?.tv !== undefined ? { totals: { value: Number(first.tv), count: Number(first.tn), entities: Number(first.te) } } : {}),
        ...(first?.gv !== undefined ? { group: { value: Number(first.gv), count: Number(first.gn), entities: Number(first.ge) } } : {}) } };
    }
    case "trend": {
      // trend-2: the partition over the rollup's grouped rows, names and counties from the profiles (the facts are read live, apart).
      const group = trendGroupOf(spec);
      const dim = spec.dim === "county" ? "county" : spec.dim ?? "authority";
      const yearA = spec.filters.yearFrom!, yearB = spec.filters.yearTo!;
      const grouped = rollupTrendGrouped(q, plan, { dim, yearA, yearB });
      if ("reason" in grouped) throw new Error(grouped.reason);
      const partition = await trendPartition(q, grouped.grouped, { group, topN: spec.topN ?? 10, first: dim === "county" ? null : { role: dim, yearB } });
      const lists = Object.entries(partition.lists) as [TrendList, { id: string; va: string; vb: string }[]][];
      const profiles = dim === "county" ? new Map() : await trendProfiles(q, [{ role: dim, ids: lists.flatMap(([, rows]) => rows.map((r) => r.id)) }]);
      const toRow = (r: { id: string; va: string; vb: string }) => dim === "county"
        ? { entityId: null, name: r.id, county: null, valueA: Number(r.va), valueB: Number(r.vb) }
        : { entityId: r.id, name: profiles.get(`${dim}:${r.id}`)?.name ?? "(fără nume)", county: profiles.get(`${dim}:${r.id}`)?.county ?? null, valueA: Number(r.va), valueB: Number(r.vb) };
      const groups = Object.fromEntries(lists.map(([list, rows]) => [list, rows.map(toRow)])) as Partial<Record<TrendList, ReturnType<typeof toRow>[]>>;
      const window = spec.trend?.months;
      return { source, data: { block: "trend", yearA, yearB, rowsTrend: groups[trendListOf(group)] ?? [], list: trendListOf(group), change: group.change,
        months: Array.isArray(window) ? { from: window[0], to: window[1], mode: "chosen" as const } : { from: 1, to: 12, mode: "whole" as const },
        groups, composition: partition.composition, noun: trendNoun(spec) } };
    }
    case "breakdown": {
      const plen = (g.cpv?.prefixes ?? []).reduce((a, p) => Math.max(a, p.length), 0);
      const r = await rollupBreakdown(q, plan, plen === 0 ? 2 : Math.min(plen + 2, 8));
      if ("reason" in r) throw new Error(r.reason);
      const top = r.rows.slice(0, 8), rest = r.rows.slice(8);
      return { source, data: { block: "breakdown", slices: top.map((t) => ({ code: t.stem, name: null, value: Number(t.v), count: Number(t.n) })),
        other: { value: rest.reduce((a, b) => a + Number(b.v), 0), count: rest.reduce((a, b) => a + Number(b.n), 0) } } };
    }
    case "stat": {
      const r = await rollupStat(q, plan);
      if (plan.filters.dataset !== "all") return { source, data: { block: "stat", stat: { value: Number(r.rows[0]?.v ?? 0), count: Number(r.rows[0]?.n ?? 0) } } };
      const byStream = r.rows.map((x) => ({ src: x.src!, value: Number(x.v), count: Number(x.n) }));
      return { source, data: { block: "stat", stat: { value: byStream.reduce((a, b) => a + b.value, 0), count: byStream.reduce((a, b) => a + b.count, 0), byStream } } };
    }
    case "timeseries": {
      const r = await rollupTimeseries(q, plan);
      return { source, data: { block: "timeseries", series: r.rows.filter((p) => /^\d{4}$/.test(p.y ?? "")).map((p) => ({ year: Number(p.y), value: Number(p.v), count: Number(p.n) })) } };
    }
    case "map": {
      const r = await rollupMap(q, plan);
      const unknown = r.rows.find((p) => p.c == null);
      return { source, data: { block: "map", counties: r.rows.filter((p): p is { c: string; v: string; n: string } => p.c != null).map((p) => ({ county: p.c, value: Number(p.v), count: Number(p.n) })),
        unknown: { value: Number(unknown?.v ?? 0), count: Number(unknown?.n ?? 0) } } };
    }
    default: throw new Error(`no rollup for ${spec.block}`);
  }
}
/** Group-by results without ORDER BY come back in any order: compare them sorted. A trend's row facts are read from
 * the transaction marts on the shown ids, whatever answers the partition, and the firms an employees band leaves
 * out without a filing come from the same grouping without the band: both are checked apart. */
const canonical = (data: BlockData) => data.block === "stat" && data.stat.byStream
  ? { ...data, stat: { ...data.stat, byStream: [...data.stat.byStream].sort((a, b) => a.src.localeCompare(b.src)) } }
  : data.block === "trend" ? { ...data, rowFacts: undefined, withoutFiling: undefined } : data;

/** A breakdown without what F3 adds for the screen (every group of the level, the channels' shares). */
const withoutLevel = (data: BlockData): BlockData => { if (data.block !== "breakdown") return data; const { base: _b, streams: _s, ...rest } = data; return rest; };
const without = (role: "authority" | "supplier", id: string): QueryPopulation => ({ operator: "and", groups: [{ operator: "and", conditions: [{ field: role, op: "not_in", values: [id] }] }] });
const base = (block: AskSpec["block"], extra: Partial<AskSpec> = {}, filters: AskSpec["filters"] = {}): AskSpec => ({ block, measure: "value", dim: "supplier", ...extra, filters });
const CLUJ: Grounding = { county: { query: "Cluj", canonical: "Cluj" } };
const Y = { yearFrom: 2024, yearTo: 2025 };
/** A trend's groups on the fixture: firms 10 and 11 grow, 13 is new (first record in 2025), 12 and 14 decrease; on direct acquisitions alone 14 is gone. */
const TREND_GROUPS: { name: string; spec: AskSpec; g?: Grounding; source: string }[] = [
  { name: "trend of firms, growths", spec: base("trend", { trend: { change: "up" } }, Y), source: "entity:supplier" },
  { name: "trend of firms, new", spec: base("trend", { trend: { change: "new" } }, Y), source: "entity:supplier" },
  { name: "trend of firms, new, first year", spec: base("trend", { trend: { change: "new", firstOnly: true } }, Y), source: "entity:supplier" },
  { name: "trend of firms, decreases", spec: base("trend", { trend: { change: "down" } }, Y), source: "entity:supplier" },
  { name: "trend of firms, gone, direct acquisitions", spec: base("trend", { dataset: "da", trend: { change: "gone" } }, Y), source: "entity:supplier" },
  { name: "trend of firms, growths in percent from 2.500 lei", spec: base("trend", { trend: { change: "up", order: "percent", minBase: 2_500 } }, Y), source: "entity:supplier" },
  { name: "trend of firms, every change, whole years", spec: base("trend", { trend: { change: "all", months: "whole" } }, Y), source: "entity:supplier" },
  { name: "trend of institutions buying from small firms, growths", spec: base("trend", { dim: "authority", trend: { change: "up" } }, { ...Y, minEmployees: 1, maxEmployees: 9 }), source: "pair" },
  // The firms' employees on a trend of firms: an attribute of the grouped firm (trend-2), the same lists as a selection.
  { name: "trend of firms with 1–9 employees, decreases", spec: base("trend", { trend: { change: "down" } }, { ...Y, minEmployees: 1, maxEmployees: 9 }), source: "entity:supplier" },
  { name: "trend of counties, growths in percent", spec: base("trend", { dim: "county", trend: { change: "up", order: "percent", minBase: 1_000 } }, Y), source: "cpv" },
  // The same months of both years, from agg_entity_month (firms 10 and 14 grow over February–May).
  { name: "trend of firms, February–May", spec: base("trend", { trend: { months: [2, 5] } }, Y), source: "entityMonth:supplier" },
  { name: "trend of firms, growths, February–May", spec: base("trend", { trend: { change: "up", months: [2, 5] } }, Y), source: "entityMonth:supplier" },
  { name: "trend of firms in Cluj, new, February–September", spec: base("trend", { trend: { change: "new", months: [2, 9] } }, { ...Y, county: "Cluj" }), g: CLUJ, source: "entityMonth:supplier" },
  { name: "trend of hospitals, January–June", spec: base("trend", { dim: "authority", trend: { months: [1, 6] } }, { ...Y, authorityKind: "spital" }), source: "entityMonth:authority" },
  // Counties on the same months, from agg_county_month (F2 review: 3–6 s live nationally).
  { name: "trend of counties, February–May", spec: base("trend", { dim: "county", trend: { months: [2, 5] } }, Y), source: "countyMonth" },
  { name: "trend of counties, decreases, March–September, direct acquisitions", spec: base("trend", { dim: "county", dataset: "da", trend: { change: "down", months: [3, 9] } }, Y), source: "countyMonth" },
];
// Bare national stat, timeseries and map (all channels) are agg_national / agg_years /
// agg_map_county today; every case here takes the live scan.
const CASES: { name: string; spec: AskSpec; g?: Grounding; source: string; sort?: "name" | "county" }[] = [
  { name: "paged national ranking", spec: base("table"), source: "entity:supplier" },
  { name: "paged ranking by records", spec: base("table", { measure: "count" }), source: "entity:supplier" },
  { name: "paged ranking sorted by name", spec: base("table"), source: "entity:supplier", sort: "name" },
  { name: "paged ranking sorted by county", spec: base("table", { dim: "authority" }), source: "entity:authority", sort: "county" },
  { name: "one firm left out", spec: base("table", { topN: 10, population: without("supplier", "10") }), source: "entity:supplier" },
  { name: "firms with 1–9 employees", spec: base("table", { topN: 10 }, { minEmployees: 1, maxEmployees: 9 }), source: "entity:supplier" },
  { name: "institutions buying from firms with 1–9 employees", spec: base("table", { topN: 10, dim: "authority" }, { minEmployees: 1, maxEmployees: 9 }), source: "pair" },
  { name: "firms selling to hospitals, 2024–2025", spec: base("table", { topN: 10 }, { authorityKind: "spital", yearFrom: 2024, yearTo: 2025 }), source: "pair" },
  { name: "institutions, firms with at least 2 records", spec: base("table", { topN: 10, dim: "authority", minimumRecords: { role: "supplier", count: 2 } }), source: "pair" },
  // Every year and channel: the threshold list from the firms' profiles (10 and 11 have 4 or more).
  { name: "institutions, firms with at least 4 records", spec: base("table", { topN: 10, dim: "authority", minimumRecords: { role: "supplier", count: 4 } }), source: "pair" },
  { name: "total of firms with at least 4 records", spec: base("stat", { minimumRecords: { role: "supplier", count: 4 } }), source: "entity:supplier" },
  { name: "firms with at least 2 records in 2025", spec: base("table", { topN: 10, minimumRecords: { role: "supplier", count: 2 } }, { yearFrom: 2025, yearTo: 2025 }), source: "entity:supplier" },
  { name: "firms, institutions with at least 3 records", spec: base("table", { topN: 10, minimumRecords: { role: "authority", count: 3 } }), source: "pair" },
  { name: "institutions with at least 3 records", spec: base("table", { topN: 10, dim: "authority", minimumRecords: { role: "authority", count: 3 } }), source: "entity:authority" },
  { name: "counties", spec: base("table", { dim: "county" }), source: "cpv" },
  { name: "firms in Cluj, DA, 2025", spec: base("table", { topN: 10, dataset: "da" }, { county: "Cluj", yearFrom: 2025, yearTo: 2025 }), g: CLUJ, source: "entity:supplier" },
  { name: "trend of firms", spec: base("trend", { topN: 10 }, { yearFrom: 2024, yearTo: 2025 }), source: "entity:supplier" },
  { name: "trend of firms in Cluj", spec: base("trend", { topN: 10 }, { county: "Cluj", yearFrom: 2024, yearTo: 2025 }), g: CLUJ, source: "entity:supplier" },
  { name: "trend of institutions buying from small firms", spec: base("trend", { topN: 10, dim: "authority" }, { minEmployees: 1, maxEmployees: 9, yearFrom: 2024, yearTo: 2025 }), source: "pair" },
  { name: "trend of firms selling to hospitals", spec: base("trend", { topN: 10 }, { authorityKind: "spital", yearFrom: 2024, yearTo: 2025 }), source: "pair" },
  { name: "trend of counties", spec: base("trend", { topN: 10, dim: "county" }, { yearFrom: 2024, yearTo: 2025 }), source: "cpv" },
  // F2: each group of the trend (trendGroupSql), its order, on every rollup source.
  ...TREND_GROUPS.map((c) => ({ ...c, spec: { ...c.spec, topN: 10 } })),
  { name: "breakdown", spec: base("breakdown"), source: "cpv" },
  { name: "breakdown, 2025", spec: base("breakdown", {}, { yearFrom: 2025, yearTo: 2025 }), source: "cpv" },
  { name: "breakdown, Cluj, contracts", spec: base("breakdown", { dataset: "contracts" }, { county: "Cluj" }), g: CLUJ, source: "cpv" },
  { name: "breakdown inside a CPV group", spec: base("breakdown", {}, { cpvTerm: "3360" }), g: { cpv: { term: "3360", prefixes: ["3360"], matchedNames: [], method: "code" } }, source: "cpv" },
  { name: "total, 2025", spec: base("stat", {}, { yearFrom: 2025, yearTo: 2025 }), source: "cpv" },
  { name: "total of direct acquisitions, 2024–2025", spec: base("stat", { dataset: "da" }, { yearFrom: 2024, yearTo: 2025 }), source: "cpv" },
  { name: "total of hospitals", spec: base("stat", {}, { authorityKind: "spital" }), source: "entity:authority" },
  { name: "total without one firm", spec: base("stat", { population: without("supplier", "10") }), source: "pair" },
  { name: "years of contracts (one undated)", spec: base("timeseries", { dataset: "contracts" }), source: "cpv" },
  { name: "years of firms with 1–9 employees", spec: base("timeseries", {}, { minEmployees: 1, maxEmployees: 9 }), source: "entity:supplier" },
  { name: "map of direct acquisitions", spec: base("map", { dataset: "da" }), source: "cpv" },
  { name: "map of hospitals", spec: base("map", {}, { authorityKind: "spital" }), source: "entity:authority" },
  { name: "map of contracts, 2025", spec: base("map", { dataset: "contracts" }, { yearFrom: 2025, yearTo: 2025 }), source: "cpv" },
];

const SOURCE_CASES: { name: string; spec: AskSpec; g?: Grounding; block: "stat" | "map" | "breakdown" | "timeseries" | "county" }[] = [
  { name: "sources of the DAs of 2025", spec: base("stat", { dataset: "da" }, { yearFrom: 2025, yearTo: 2025 }), block: "stat" },
  { name: "sources of everything", spec: base("stat"), block: "stat" },
  { name: "sources of the map of contracts, 2025", spec: base("map", { dataset: "contracts" }, { yearFrom: 2025, yearTo: 2025 }), block: "map" },
  { name: "sources of the breakdown in Cluj", spec: base("breakdown", {}, { county: "Cluj" }), g: CLUJ, block: "breakdown" },
  { name: "sources of the years of contracts (one undated)", spec: base("timeseries", { dataset: "contracts" }), block: "timeseries" },
  { name: "sources of the counties", spec: base("table", { dim: "county" }), block: "county" },
];

const THRESHOLD_SPECS: { name: string; spec: AskSpec; g?: Grounding }[] = [
  { name: "institutions, firms with at least 4 records", spec: base("table", { topN: 10, dim: "authority", minimumRecords: { role: "supplier", count: 4 } }) },
  { name: "total, institutions with at least 3 records", spec: base("stat", { minimumRecords: { role: "authority", count: 3 } }) },
  { name: "firms with at least 2 records in 2025", spec: base("table", { topN: 10, minimumRecords: { role: "supplier", count: 2 } }, { yearFrom: 2025, yearTo: 2025 }) },
];

describe.runIf(Boolean(connection))("rollups give the live answers (dedicated rollback fixture)", () => {
  it("answers every rollup case exactly as the live queries, through runSpec and runRows too, and compare and scatter as theirs", async () => {
    expect(DA_PLAFOND_RON).toBe(2_000_000);
    const sql = connection!.sql, prefix = `rollup_fixture_${process.pid}_${Date.now()}`;
    const rollback = new Error("rollback rollup fixture");
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(`create schema ${prefix}`);
        for (const table of ["da_transactions", "contract_transactions", "national_stats", "entity_profile", "agg_top_entities"])
          await tx.unsafe(`create table ${prefix}.${table} as table marts.${table} with no data`);
        // With its generated log_total_ron (migration 0085).
        await tx.unsafe(`create table ${prefix}.entity_flags (like marts.entity_flags including all)`);
        // The tables outside marts the engine reads, empty too: what another fixture committed to a test database
        // (the golden fixture's CPV catalogue names the live breakdown's slices, never the rollups') never reaches here.
        for (const table of ENGINE_GLOBAL_TABLES) await tx.unsafe(`create table ${prefix}.${table.replace(".", "_")} as table ${table} with no data`);
        const q = scoped(tx as unknown as DbSql, prefix, ENGINE_GLOBAL_TABLES);
        await load(q);
        forgetAuthorityKinds();
        fixtureKinds = await readAuthorityKinds(q);
        expect(fixtureKinds.ids).toMatchObject({ spital: ["1", "4"], comuna: ["2"], oras_municipiu: ["3"] });
        forgetRollupsReady();
        expect(await rollupsReady(q)).toBe(false);
        // The live answers first: without the rollups runSpec and runRows run their live queries.
        const liveAnswers = new Map<string, BlockData>();
        for (const c of CASES) {
          const live = await runSpec(q, c.spec, c.g ?? {}, c.sort ? { sort: c.sort, dir: "asc" } : {});
          if ("error" in live) throw new Error(`${c.name}: ${live.error}`);
          liveAnswers.set(c.name, live.data);
        }
        const liveSources = new Map<string, Exclude<Awaited<ReturnType<typeof runRows>>, { error: string }>>();
        for (const c of [...SOURCE_CASES, ...THRESHOLD_SPECS, ...TREND_GROUPS]) {
          const live = await runRows(q, c.spec, c.g ?? {}, 0);
          if ("error" in live) throw new Error(`${c.name}: ${live.error}`);
          liveSources.set(c.name, live);
        }
        // F2: the groups partition the firms (trend final §3.1), each in its own order.
        const members = (name: string) => { const d = liveAnswers.get(name)!; return d.block === "trend" ? d.rowsTrend.map((r) => r.entityId) : null; };
        expect(Object.fromEntries(TREND_GROUPS.slice(0, 7).map((c) => [c.name, members(c.name)]))).toEqual({
          "trend of firms, growths": ["10", "11"], "trend of firms, new": ["13"], "trend of firms, new, first year": ["13"],
          "trend of firms, decreases": ["12", "14"], "trend of firms, gone, direct acquisitions": ["14"],
          "trend of firms, growths in percent from 2.500 lei": ["11"],
          "trend of firms, every change, whole years": members("trend of firms"),
        });
        // trend-2: the groups are a partition that adds up to every change (count and both sums), each list
        // holds only its group, in its order, and the lists do not depend on the group a spec chose.
        for (const c of CASES.filter((x) => x.spec.block === "trend")) {
          const d = liveAnswers.get(c.name)!;
          if (d.block !== "trend" || !d.composition || !d.groups) throw new Error(`${c.name}: trend-2 expected`);
          const parts = (["up", "new", "down", "gone", "equal"] as const).map((part) => d.composition![part]!);
          const add = (key: "count" | "valueA" | "valueB") => parts.reduce((n, p) => n + p[key], 0).toFixed(2);
          expect([c.name, add("count"), add("valueA"), add("valueB")]).toEqual([c.name, ...(["count", "valueA", "valueB"] as const).map((key) => d.composition!.all![key].toFixed(2))]);
          expect([c.name, d.composition.all!.count > 0]).toEqual([c.name, true]);
          for (const [list, rows] of Object.entries(d.groups)) {
            const group = list === "first" ? "new" : list;
            if (group !== "all") expect([c.name, list, rows.every((r) => trendGroupOfRow(r) === group)]).toEqual([c.name, list, true]);
            // The growths in percent list only those from the base (the eligible ones).
            const listed = list === "up" && d.composition.eligible ? d.composition.eligible : d.composition[list as TrendList];
            expect([c.name, list, rows.length]).toEqual([c.name, list, Math.min(10, listed?.count ?? 0)]);
          }
          expect([c.name, d.rowsTrend]).toEqual([c.name, d.groups[d.list!]]);
          // The same selection with every change lists the same groups (but the growths in percent).
          const every = await runSpec(q, { ...c.spec, topN: 10, trend: { ...(c.spec.trend?.months ? { months: c.spec.trend.months } : {}), change: "all" } }, c.g ?? {});
          if ("error" in every || every.data.block !== "trend") throw new Error(`${c.name}: trend expected`);
          const same = (x: typeof d.groups) => ({ ...x, up: c.spec.trend?.order === "percent" ? undefined : x.up });
          expect([c.name, same(every.data.groups!)]).toEqual([c.name, same(d.groups)]);
        }
        // The row facts on the firms of the fixture, 2024 → 2025 (both channels, the 2M ceiling on the DAs).
        const firms = liveAnswers.get("trend of firms")!;
        if (firms.block !== "trend") throw new Error("trend expected");
        expect(firms.composition).toEqual({
          all: { count: 5, valueA: 9102.43, valueB: 7011101.99 }, up: { count: 2, valueA: 5234.6, valueB: 7003200.74 },
          new: { count: 1, valueA: 0, valueB: 6500.5 }, first: { count: 1, valueA: 0, valueB: 6500.5 },
          down: { count: 2, valueA: 3867.83, valueB: 1400.75 }, gone: { count: 0, valueA: 0, valueB: 0 }, equal: { count: 0, valueA: 0, valueB: 0 },
        });
        expect(firms.rowsTrend.map((r) => [r.entityId, r.county])).toEqual([["10", "Bucuresti"], ["11", "Cluj"], ["13", null], ["12", "Iasi"], ["14", "Ilfov"]]);
        expect(firms.rowFacts?.["10"]).toEqual({ year: 2025, value: 4002000.24, largest: { value: 2000000, src: "da" }, joint: 0,
          partner: { entityId: "2", name: "Comuna Feleacu", value: 2000000 }, firstActivity: "2024-02-01", lastActivity: null, cuiValid: true, country: null });
        expect(firms.rowFacts?.["11"]).toMatchObject({ year: 2025, largest: { value: 3000000, src: "contracts" }, joint: 0, partner: { entityId: "1", value: 3000500.5 } });
        // The decrease of firm 12 comes from 2024, a third of it from a contract with two winners.
        expect(firms.rowFacts?.["12"]).toEqual({ year: 2024, value: 2734.5, largest: { value: 1500, src: "da" }, joint: 1234.5,
          partner: { entityId: "3", name: "Municipiul Iasi", value: 2734.5 }, firstActivity: "2024-02-01", lastActivity: null, cuiValid: true, country: null });
        expect(firms.rowFacts?.["13"]).toMatchObject({ year: 2025, value: 6500.5, largest: { value: 4000, src: "da" }, firstActivity: "2025-02-01", cuiValid: false });
        expect(firms.rowFacts?.["14"]).toMatchObject({ year: 2024, value: 1133.33, largest: { value: 800, src: "da" }, partner: { entityId: "5", value: 800 } });
        const labels = (id: string) => { const row = firms.rowsTrend.find((r) => r.entityId === id)!; return trendRowLabels(row, firms.rowFacts![id]!, { yearA: 2024, yearB: 2025 }); };
        expect(labels("13")).toEqual([{ kind: "noValidCui" }, { kind: "firstYear", year: 2025 }, { kind: "oneRecord", share: 4000 / 6500.5, src: "da" }]);
        expect(labels("12")).toEqual([{ kind: "oneRecord", share: 1500 / 1983.75, src: "da" }]);
        // The undated contract of firm 13 and the DA above the ceiling of firm 10 are in no fact.
        expect(firms.rowFacts?.["13"]?.largest?.value).toBeLessThan(5_000_000);
        // A county trend partitions the buyers' counties; the new and the gone counties of a firm are empty here.
        const counties = liveAnswers.get("trend of counties")!;
        if (counties.block !== "trend") throw new Error("trend expected");
        expect([counties.noun, counties.rowFacts, counties.groups?.first]).toEqual(["județe", undefined, undefined]);

        // F2: every member of a group, with the two sums the answer gives it (the whole fixture fits in 50 rows).
        const groupAnswers = new Map<string, BlockData>();
        for (const c of TREND_GROUPS) {
          const all = await runSpec(q, { ...c.spec, topN: 50 }, c.g ?? {});
          if ("error" in all) throw new Error(`${c.name}: ${all.error}`);
          groupAnswers.set(c.name, all.data);
        }
        const drawer = (r: Exclude<Awaited<ReturnType<typeof runRows>>, { error: string }>) => ({
          total: r.total, value: r.value, sourceTotal: r.sourceTotal, sourceValue: r.sourceValue, dateFrom: r.dateFrom, dateTo: r.dateTo,
          statuses: [...r.statuses].sort((a, b) => String(a.state).localeCompare(String(b.state))), rows: r.rows,
        });
        const report = await buildAskRollups(q);
        // F3-rows adds agg_months and agg_national_mix (their parity: series.integration.test.ts).
        expect(report.rows).toMatchObject({ agg_entity_year: 29, agg_pair_year: 19, agg_cpv_year: 15, agg_entity_month: 36, agg_county_month: 18 });
        expect(Object.keys(report.rows).sort()).toEqual(["agg_county_month", "agg_cpv_year", "agg_entity_month", "agg_entity_year", "agg_months", "agg_national_mix", "agg_pair_year"]);
        expect(await rollupsReady(q)).toBe(false); // the process cache, 10 minutes
        forgetRollupsReady(); forgetMixRollupReady();
        expect(await rollupsReady(q)).toBe(true);
        // The ceiling: 2,000,000.00 counts, 2,000,000.01 does not, a zero never.
        const [ceiling] = await q`select count(*)::int n, sum(v)::text v from marts.agg_pair_year where authority_id in (2, 4) and supplier_id = 10`;
        expect(ceiling).toMatchObject({ n: 2, v: "3999999.99" });

        for (const c of CASES) {
          const g = c.g ?? {};
          const live = liveAnswers.get(c.name)!;
          const rolled = await fromRollups(q, c.spec, g, c.sort);
          expect([c.name, rolled.source]).toEqual([c.name, c.source]);
          // The mapping above rebuilds the answer's slices; every group of the level and the channels (F3) are checked through runSpec below.
          expect([c.name, canonical(withoutLevel(rolled.data))]).toEqual([c.name, canonical(withoutLevel(live))]);
          const d = live;
          const size = d.block === "table" ? d.rows.length : d.block === "trend" ? d.rowsTrend.length : d.block === "breakdown" ? d.slices.length
            : d.block === "map" ? d.counties.length : d.block === "timeseries" ? d.series.length : d.block === "stat" ? d.stat.count : 0;
          expect([c.name, size > 0]).toEqual([c.name, true]);
        }

        // runSpec reads the rollups now (rollupsReady), with its own mapping: emptied
        // transaction marts change none of these answers.
        await q.unsafe("savepoint emptied_marts");
        await q`delete from marts.da_transactions`;
        await q`delete from marts.contract_transactions`;
        for (const c of CASES) {
          const wired = await runSpec(q, c.spec, c.g ?? {}, c.sort ? { sort: c.sort, dir: "asc" } : {});
          if ("error" in wired) throw new Error(`${c.name}: ${wired.error}`);
          // A breakdown below the divisions: agg_months keeps the largest record of a division only, so the rollups'
          // answer has no „1 contract: 99%” tag there (DECISIONS F3r-breakdown-largest); the rest is the live answer.
          const deeper = c.name === "breakdown inside a CPV group";
          if (deeper && wired.data.block === "breakdown") expect(wired.data.base!.every((g) => g.max === undefined)).toBe(true);
          const tagless = (d: BlockData): BlockData => deeper && d.block === "breakdown" ? { ...d, base: d.base!.map(({ max: _m, maxSrc: _s, ...g }) => g) } : d;
          expect([c.name, canonical(tagless(wired.data))]).toEqual([c.name, canonical(tagless(liveAnswers.get(c.name)!))]);
        }
        await q.unsafe("rollback to savepoint emptied_marts");

        // The source drawer's totals (no local filter) of selections without entity conditions.
        for (const c of SOURCE_CASES) {
          const g = c.g ?? {};
          const live = liveSources.get(c.name)!;
          const wired = await runRows(q, c.spec, g, 0);
          if ("error" in wired) throw new Error(`${c.name}: ${wired.error}`);
          expect([c.name, drawer(wired)]).toEqual([c.name, drawer(live)]);
          const plan = planRollup(ctxOf(c.spec, g), needOf(c.spec));
          if ("reason" in plan) throw new Error(`${c.name}: ${plan.reason}`);
          const r = await rollupSourceTotals(q, plan, c.block);
          if ("reason" in r) throw new Error(`${c.name}: ${r.reason}`);
          const byState = (rows: { state: string | null; count: number; value: string }[]) => [...rows].sort((a, b) => String(a.state).localeCompare(String(b.state)));
          const rolled = {
            sourceTotal: r.rows.reduce((n, x) => n + Number(x.n), 0), sourceValue: sumDecimalStrings(r.rows.map((x) => x.v)),
            statuses: byState(r.rows.map((x) => ({ state: x.state, count: Number(x.n), value: x.v }))),
            dateFrom: r.rows.map((x) => x.date_from).filter((d): d is string => d !== null).sort()[0]?.slice(0, 10) ?? null,
            dateTo: r.rows.map((x) => x.date_to).filter((d): d is string => d !== null).sort().at(-1)?.slice(0, 10) ?? null,
          };
          expect([c.name, rolled]).toEqual([c.name, { sourceTotal: live.sourceTotal, sourceValue: live.sourceValue, statuses: byState(live.statuses), dateFrom: live.dateFrom, dateTo: live.dateTo }]);
          expect([c.name, live.sourceTotal > 0]).toEqual([c.name, true]);
        }

        // F2: the sources of a trend's group are its members' records of the two years: the members
        // grouped on the rollups give the live list, and they add up to the answer.
        forgetTrendGroups();
        for (const c of TREND_GROUPS) {
          const live = liveSources.get(c.name)!;
          const wired = await runRows(q, c.spec, c.g ?? {}, 0);
          if ("error" in wired) throw new Error(`${c.name}: ${wired.error}`);
          expect([c.name, drawer(wired)]).toEqual([c.name, drawer(live)]);
          const answer = groupAnswers.get(c.name)!;
          if (answer.block !== "trend") throw new Error("trend expected");
          const sum = answer.rowsTrend.reduce((n, r) => n + r.valueA + r.valueB, 0);
          expect([c.name, Number(live.sourceValue).toFixed(2)]).toEqual([c.name, sum.toFixed(2)]);
          expect([c.name, answer.rowsTrend.length > 0, live.sourceTotal > 0]).toEqual([c.name, true, true]);
          expect(live.scopeNotes.some((note) => note.startsWith("Sursele grupei") || (c.spec.trend?.change ?? "all") === "all")).toBe(true);
        }
        // F2 (sources): a group's drawer with the members the answer kept (no grouping, the totals from its
        // grouping), with the same grouping on the rollups when nothing is kept (with and without their
        // days), and the records of the same members listed apart: the same drawer and CSV (and, on three
        // groups, the same rows in every order), and the group's figures and the selection's are the answer's (plan §6.2).
        const ORDERED = ["trend of firms, decreases", "trend of institutions buying from small firms, growths", "trend of counties, growths in percent"];
        const groupDrawers = async (label: string, full: boolean) => {
          expect([label, await rollupDaysReady(q)]).toEqual([label, full]);
          for (const c of TREND_GROUPS) {
            const group = trendGroupOf(c.spec);
            if (group.change === "all") continue;
            const answer = groupAnswers.get(c.name)!;
            if (answer.block !== "trend" || !answer.composition) throw new Error("trend expected");
            const dim = c.spec.dim ?? "authority";
            const ids = answer.rowsTrend.map((r) => dim === "county" ? r.name : r.entityId!);
            const months = c.spec.trend?.months;
            const every: AskSpec = { ...c.spec, trend: months ? { months } : {} };
            const scope = dim === "county" ? { counties: ids } : { entityIds: ids, role: dim as "authority" | "supplier" };
            const g = c.g ?? {};
            const name = `${label}: ${c.name}`;
            forgetTrendGroups();
            const cold = await runRows(q, c.spec, g, 0);
            const answered = await runSpec(q, c.spec, g);
            if ("error" in answered) throw new Error(`${name}: ${answered.error}`);
            const hits = trendGroupStats().hits;
            const warm = await runRows(q, c.spec, g, 0);
            const apart = await runRows(q, every, g, 0, { scope });
            // The selection a group is part of: on a trend of firms the employees are the group's attribute (trend-2),
            // so it is every firm of the two years, not only those of the band.
            const { minEmployees: _min, maxEmployees: _max, ...everyFirm } = every.filters;
            const selection = await runRows(q, dim === "supplier" ? { ...every, filters: everyFirm } : every, g, 0);
            if ("error" in cold || "error" in warm || "error" in apart || "error" in selection) throw new Error(`${name}: rows expected`);
            // The selection's drawer („Toate”) totals from the same kept partition when its selection is the answer's (S3 F2-merge-fixes).
            const sameSelection = dim !== "supplier" || JSON.stringify(everyFirm) === JSON.stringify(every.filters);
            expect([name, trendGroupStats().hits]).toEqual([name, hits + 1 + (sameSelection ? 1 : 0)]);
            expect([name, drawer(cold)]).toEqual([name, drawer(apart)]);
            expect([name, drawer(warm)]).toEqual([name, drawer(apart)]);
            const part = answer.composition[group.change === "up" && group.order === "percent" ? "eligible" : group.firstOnly ? "first" : group.change]!;
            expect([name, warm.group?.members, ids.length, Number(warm.sourceValue).toFixed(2)]).toEqual([name, part.count, part.count, (part.valueA + part.valueB).toFixed(2)]);
            expect([name, warm.group?.selection]).toEqual([name, { count: selection.sourceTotal, value: selection.sourceValue }]);
            if (!full) continue;
            // The totals and the period are the grouping's: without the records the drawer lists none, with the same totals.
            await q.unsafe("savepoint emptied_records");
            await q`delete from marts.da_transactions`;
            await q`delete from marts.contract_transactions`;
            const kept = await runRows(q, c.spec, g, 0);
            await q.unsafe("rollback to savepoint emptied_records");
            if ("error" in kept) throw new Error(`${name}: ${kept.error}`);
            expect([name, { ...drawer(kept), rows: [] }, kept.rows]).toEqual([name, { ...drawer(warm), rows: [] }, []]);
            // Every order on a group of firms, of institutions over the pair rollup and of counties; the CSV of every group.
            if (ORDERED.includes(c.name)) for (const sort of ["source", "value", "date", "authority", "supplier", "county", "cpv"] as const) for (const dir of ["asc", "desc"] as const) {
              const [mine, theirs] = [await runRows(q, c.spec, g, 0, { sort, dir }), await runRows(q, every, g, 0, { sort, dir, scope })];
              if ("error" in mine || "error" in theirs) throw new Error(`${name}: rows expected`);
              expect([name, sort, dir, mine.rows]).toEqual([name, sort, dir, theirs.rows]);
            }
            const csv = await runRows(q, c.spec, g, 0, { limit: CSV_MAX_ROWS });
            if ("error" in csv) throw new Error(`${name}: rows expected`);
            expect([name, csv.rows.length, sumDecimalStrings(csv.rows.map((r) => r.valueExact))]).toEqual([name, warm.sourceTotal, warm.sourceValue]);
            // The header, a line per record, and the closing line break.
            expect([name, evidenceCsv(csv.rows).split("\r\n").length - 2]).toEqual([name, warm.sourceTotal]);
          }
        };
        await groupDrawers("rollups with days", true);
        // The firms' employees on a trend of firms (trend-2): the groups keep the band (10, 12, 14), the same lists as a
        // selection of their records gave (the case above); per list the firms left out without a filing (13, new in 2025,
        // has none; 11 has 50 employees: out of the band, not unfiled); the drawer's selection is every firm.
        const small = base("trend", { trend: { change: "new" } }, { ...Y, minEmployees: 1, maxEmployees: 9 });
        // „Toate” of the band lists the band's records (S3 review): the totals it takes from the kept partition, or from a
        // grouping on the rollups, are those its own rows count, and the answer's composition, never every firm's.
        const everyBand: AskSpec = { ...small, trend: {} };
        const bandDrawers: ReturnType<typeof drawer>[] = [];
        for (const rolled of [true, false]) {
          if (!rolled) await q.unsafe("savepoint without_rollups");
          if (!rolled) { for (const table of ["agg_entity_year", "agg_pair_year", "agg_cpv_year", "agg_entity_month", "agg_county_month"]) await q.unsafe(`drop table marts.${table}`); }
          forgetRollupsReady(); forgetTrendGroups();
          const banded = await runSpec(q, small, {});
          if ("error" in banded || banded.data.block !== "trend") throw new Error("trend expected");
          expect([rolled, banded.data.withoutFiling]).toEqual([rolled, { all: 1, up: 0, new: 1, first: 1, down: 0, gone: 0 }]);
          expect([rolled, banded.data.groups?.all?.map((r) => r.entityId).sort()]).toEqual([rolled, ["10", "12", "14"]]);
          const [newDrawer, everyFirm] = [await runRows(q, small, {}, 0), await runRows(q, { ...small, filters: Y }, {}, 0)];
          if ("error" in newDrawer || "error" in everyFirm) throw new Error("rows expected");
          expect([rolled, newDrawer.group?.selection]).toEqual([rolled, everyFirm.group?.selection]);
          // Nothing kept: grouped on the rollups (rolled) or counted (without them); then from the answer's partition.
          forgetTrendGroups();
          const cold = await runRows(q, everyBand, {}, 0);
          const answered = await runSpec(q, everyBand, {});
          const kept = await runRows(q, everyBand, {}, 0);
          if ("error" in cold || "error" in kept || "error" in answered || answered.data.block !== "trend") throw new Error("rows expected");
          const band = answered.data.composition!.all!;
          expect([rolled, drawer(kept)]).toEqual([rolled, drawer(cold)]);
          expect([rolled, Number(kept.sourceValue).toFixed(2)]).toEqual([rolled, (band.valueA + band.valueB).toFixed(2)]);
          expect([rolled, kept.total, kept.rows.every((r) => ["10", "12", "14"].includes(r.supplierId!))]).toEqual([rolled, kept.sourceTotal, true]);
          bandDrawers.push(drawer(kept));
          if (!rolled) await q.unsafe("rollback to savepoint without_rollups");
        }
        expect(bandDrawers[0]).toEqual(bandDrawers[1]);
        forgetRollupsReady(); forgetTrendGroups();
        // The covering id indexes with sicap_da_id (built nightly, F2 review): every group's page takes its direct
        // acquisitions' first keys from them; the same drawers, CSVs and 14 orders.
        await q.unsafe("savepoint keyed_indexes");
        for (const index of TRANSACTION_MART_BUILD_INDEXES) await q.unsafe(index.definition);
        forgetRollupsReady();
        expect(await coverRefReady(q)).toBe(true);
        await groupDrawers("rollups with days, keys from the covering index", true);
        await q.unsafe("rollback to savepoint keyed_indexes");
        forgetRollupsReady();
        expect(await coverRefReady(q)).toBe(false);
        // A rollup built before the days: the drawer counts the group's records, with the same result.
        await q.unsafe("savepoint undated_rollups");
        for (const table of ["agg_entity_year", "agg_pair_year", "agg_entity_month"]) await q.unsafe(`alter table marts.${table} drop column d0, drop column d1`);
        forgetRollupsReady();
        await groupDrawers("rollups without days", false);
        await q.unsafe("rollback to savepoint undated_rollups");
        forgetRollupsReady();
        // A revert's build (the code before F2) rebuilds the yearly rollups without the days and leaves the last
        // F2 build's agg_entity_month behind: not of the same build, so a trend on the same months runs live.
        expect(await monthRollupReady(q)).toBe(true);
        await q.unsafe("savepoint reverted_build");
        for (const table of ["agg_entity_year", "agg_pair_year"]) await q.unsafe(`alter table marts.${table} drop column d0, drop column d1`);
        forgetRollupsReady();
        expect(await monthRollupReady(q)).toBe(false);
        await q.unsafe("rollback to savepoint reverted_build");
        forgetRollupsReady();
        // A row's own records: only that member, and nothing when it is not in the group, with the members kept or not.
        const growth = TREND_GROUPS[0]!.spec;
        for (const kept of [false, true]) {
          forgetTrendGroups();
          if (kept) await runSpec(q, growth, {});
          const own = await runRows(q, growth, {}, 0, { scope: { entityIds: ["10"], role: "supplier" } });
          const outside = await runRows(q, growth, {}, 0, { scope: { entityIds: ["12"], role: "supplier" } });
          if ("error" in own || "error" in outside) throw new Error("rows expected");
          expect([kept, own.rows.every((r) => r.supplierId === "10") && own.total > 0]).toEqual([kept, true]);
          expect([kept, outside.total, own.group]).toEqual([kept, 0, undefined]);
        }
        // The same months of both years (live: the rollups keep whole years), and a window the data no longer gives.
        const months: AskSpec = base("trend", { topN: 50, trend: { months: [2, 5] } }, Y);
        const window = await runSpec(q, months, {});
        if ("error" in window || window.data.block !== "trend") throw new Error("trend expected");
        expect(window.executed).toEqual({ months: [2, 5], mode: "chosen", checkpoint: null });
        const listed = await runRows(q, months, {}, 0, { months: [2, 5] });
        if ("error" in listed) throw new Error(listed.error);
        expect(Number(listed.sourceValue).toFixed(2)).toBe(window.data.rowsTrend.reduce((n, r) => n + r.valueA + r.valueB, 0).toFixed(2));
        expect(listed.dateFrom! >= "2024-02-01" && listed.dateTo! <= "2025-05-31").toBe(true);
        // Firm 10's DA of 1 March 2024 and 1 March 2025 are in February–May; its September ones are not.
        expect(window.data.rowsTrend.find((r) => r.entityId === "10")).toMatchObject({ valueA: 1000.1, valueB: 2000.25 });
        expect(await runRows(q, months, {}, 0, { months: [1, 6] })).toEqual({ error: DATA_CHANGED, conflict: true });

        // The sources of a thresholded question: the live rows with the party list from the rollups
        // (rollupMinimumCond) instead of minimumRecordsSql give runRows' totals.
        const union = q`(
          select authority_id, supplier_id, closing_value, finalization_date, 'da'::text src from marts.da_transactions
          union all select authority_id, supplier_id, closing_value, finalization_date, 'contracts' from marts.contract_transactions)`;
        const THRESHOLDS: { name: string; spec: AskSpec; extra: ReturnType<DbSql> }[] = THRESHOLD_SPECS.map((c, i) => ({ ...c, extra: [
          q`d.authority_id is not null`, q`true`,
          q`d.supplier_id is not null and substr(d.finalization_date, 1, 4) >= '2025' and substr(d.finalization_date, 1, 4) <= '2025'`,
        ][i] as unknown as ReturnType<DbSql> }));
        for (const c of THRESHOLDS) {
          const live = liveSources.get(c.name)!;
          // runRows now takes the party list from the rollups (rollupMinimumCond).
          const wired = await runRows(q, c.spec, {}, 0);
          if ("error" in wired) throw new Error(`${c.name}: ${wired.error}`);
          expect([c.name, drawer(wired)]).toEqual([c.name, drawer(live)]);
          const plan = planRollup(ctxOf(c.spec, {}), needOf(c.spec));
          if ("reason" in plan) throw new Error(`${c.name}: ${plan.reason}`);
          const party = (c.spec.minimumRecords!.role === "authority" ? q`d.authority_id` : q`d.supplier_id`) as unknown as ReturnType<DbSql>;
          const [rows] = await q`select count(*)::int n, coalesce(sum(d.closing_value), 0)::text v from ${union} d
            where d.closing_value > 0 and (d.src = 'contracts' or d.closing_value <= ${DA_PLAFOND_RON}) and ${c.extra}
              and ${rollupMinimumCond(q, plan, party)!}`;
          expect([c.name, rows]).toEqual([c.name, { n: live.sourceTotal, v: live.sourceValue }]);
          expect([c.name, live.sourceTotal > 0]).toEqual([c.name, true]);
        }

        // compare: the two partner queries on the slim union, names attached after.
        const compare: AskSpec = { block: "compare", measure: "value", dim: "supplier", comparisonMode: "transactions", filters: { supplierId: 10, compareWithId: 11 } };
        const pair: Grounding = { supplier: { entityId: "10", nameDisplay: "Furnizor A", query: "A", county: "Bucuresti", alternatives: [] },
          compare: { entityId: "11", nameDisplay: "Furnizor B", query: "B", county: "Cluj", alternatives: [] } };
        const liveCompare = await runSpec(q, compare, pair);
        if ("error" in liveCompare || liveCompare.data.block !== "compare") throw new Error("compare expected");
        const slim = q`(
          select authority_id, supplier_id, county, cpv_code, closing_value,
                 finalization_date, null::boolean as is_single_bidder, 'da'::text as src
          from marts.da_transactions
          union all
          select authority_id, supplier_id, county, cpv_code, closing_value,
                 finalization_date, is_single_bidder, 'contracts'::text
          from marts.contract_transactions
        )`;
        const where = q`d.closing_value > 0 and (d.src = 'contracts' or d.closing_value <= ${DA_PLAFOND_RON}) and d.supplier_id in (${"10"}, ${"11"})`;
        // Fragments as compile.ts passes them (txAggFragment, whereFrag).
        const parts = { source: slim as unknown as ReturnType<DbSql>, where: where as unknown as ReturnType<DbSql>, focalRole: "supplier" as const, focalId: "10", compareId: "11" };
        const top = await compareTopPartners(q, parts), shared = await compareSharedPartners(q, parts), parties = await compareParties(q, parts);
        // The three queries the engine ran before (count(distinct), the named union), as the reference.
        const named = q`(
          select authority_id, authority_name, supplier_id, supplier_name, county, cpv_code, closing_value,
                 finalization_date, null::boolean as is_single_bidder, 'da'::text as src
          from marts.da_transactions
          union all
          select authority_id, authority_name, supplier_id, supplier_name, county, cpv_code, closing_value,
                 finalization_date, is_single_bidder, 'contracts'::text
          from marts.contract_transactions
        )`;
        const before = {
          parties: await q`select d.supplier_id::text id, count(distinct d.authority_id)::int n from ${slim} d where ${where} and d.authority_id is not null group by 1`,
          top: await q`select id, other_id, name, value, n from (
              select d.supplier_id::text id, d.authority_id::text other_id, max(d.authority_name) name, sum(d.closing_value)::text value, count(*)::int n,
                     row_number() over (partition by d.supplier_id order by sum(d.closing_value) desc, d.authority_id) r
              from ${named} d where ${where} and d.authority_id is not null group by d.supplier_id, d.authority_id) x
            where r <= 4 order by id, r`,
          shared: await q`select d.authority_id::text other_id, max(d.authority_name) name,
                   coalesce(sum(d.closing_value) filter (where d.supplier_id = ${"10"}), 0)::text value_a, count(*) filter (where d.supplier_id = ${"10"})::int n_a,
                   coalesce(sum(d.closing_value) filter (where d.supplier_id = ${"11"}), 0)::text value_b, count(*) filter (where d.supplier_id = ${"11"})::int n_b,
                   count(*) over ()::int total
            from ${named} d where ${where} and d.authority_id is not null
            group by d.authority_id having count(distinct d.supplier_id) = 2
            order by sum(d.closing_value) desc, d.authority_id limit 30`,
        };
        const byId = (rows: readonly { id: string }[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
        expect(byId(parties)).toEqual(byId([...before.parties] as unknown as { id: string; n: number }[]));
        expect(top).toEqual([...before.top]);
        expect(shared).toEqual([...before.shared]);
        expect(liveCompare.data.entities.map((e) => e.partners)).toEqual(liveCompare.data.entities.map((e) => parties.find((p) => p.id === e.entityId)?.n ?? 0));
        expect(liveCompare.data.entities.map((e) => e.partners)).toEqual([4, 3]);
        for (const entity of liveCompare.data.entities)
          expect(top.filter((t) => t.id === entity.entityId).map((t) => ({ entityId: t.other_id, name: t.name ?? "?", value: Number(t.value), count: t.n }))).toEqual(entity.topPartners);
        expect({ total: shared[0]?.total ?? 0, rows: shared.map((r) => ({ entityId: r.other_id, name: r.name ?? "?", a: { value: Number(r.value_a), count: r.n_a }, b: { value: Number(r.value_b), count: r.n_b } })) })
          .toEqual(liveCompare.data.shared);
        expect(liveCompare.data.shared?.rows.length).toBeGreaterThan(0);

        // scatter: the density layer from the stored column equals the live log() bins.
        const scatter: AskSpec = { block: "scatter", measure: "value", dim: "supplier", filters: {} };
        const liveScatter = await runSpec(q, scatter, {});
        if ("error" in liveScatter || liveScatter.data.block !== "scatter") throw new Error("scatter expected");
        const density = await scatterDensity(q, q`ef.role = ${"supplier"} and ef.n_das >= ${10}`, true);
        expect(density).toBeDefined();
        const cells = (d: typeof density) => d && { ...d, cells: [...d.cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]) };
        expect(cells(density)).toEqual(cells(liveScatter.data.density));
        const live = await scatterDensity(q, q`ef.role = ${"supplier"} and ef.n_das >= ${10}`, false);
        expect(cells(live)).toEqual(cells(liveScatter.data.density));
        const [stored] = await q`select count(*)::int n from marts.entity_flags where log_total_ron is distinct from log(greatest(coalesce(total_ron, 0), 1))`;
        expect(stored!.n).toBe(0);
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    expect(await sql`select nspname from pg_namespace where nspname=${prefix}`).toHaveLength(0);
  }, 180_000);
});
