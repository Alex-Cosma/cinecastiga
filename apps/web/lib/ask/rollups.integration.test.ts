import { afterAll, describe, expect, it } from "vitest";
import { buildAskRollups, createDb, type DbSql } from "@seap/db";
import { DA_PLAFOND_RON, runRows, runSpec, TABLE_PAGE_SIZE, type BlockData } from "./compile";
import { sumDecimalStrings } from "./evidence";
import {
  compareParties, compareSharedPartners, compareTopPartners, forgetRollupsReady, planRollup, rollupBreakdown, rollupCountyTable, rollupMap,
  rollupMinimumCond, rollupSourceTotals, rollupStat, rollupsReady, rollupTable, rollupTimeseries, rollupTrend, scatterDensity, type RollupCtx, type RollupNeed,
} from "./rollups";
import { namedKind, type AskSpec } from "./spec";
import { forgetAuthorityKinds, readAuthorityKinds, type AuthorityKinds } from "./authority-kind";
import type { Grounding } from "./ground";
import type { QueryPopulation } from "./population";

const testUrl = process.env["TEST_DATABASE_URL"];
if (testUrl && !/^seap_test_[a-z0-9_]+$/.test(new URL(testUrl).pathname.slice(1))) throw new Error("Rollup fixtures require a dedicated seap_test_* database");
const connection = testUrl ? createDb(testUrl) : null;
afterAll(async () => { await connection?.sql.end(); });

/** Qualified marts are rewritten into unique fixture tables; everything rolls back (population.integration.test.ts). */
function scoped(connection: DbSql, prefix: string): DbSql {
  const rewrite = (text: string) => text.replace(/\bmarts\./g, `${prefix}.`);
  const tag = ((chunks: TemplateStringsArray, ...values: unknown[]) => {
    if (!Array.isArray(chunks) || !("raw" in chunks)) return (connection as unknown as (...args: unknown[]) => unknown)(chunks, ...values);
    const mapped = chunks.map(rewrite); Object.defineProperty(mapped, "raw", { value: chunks.raw.map(rewrite) });
    return connection(mapped as unknown as TemplateStringsArray, ...values as never[]);
  }) as unknown as DbSql;
  Object.assign(tag, { array: connection.array.bind(connection), unsafe: (text: string) => connection.unsafe(rewrite(text)), begin: (first: unknown, second?: unknown) => (typeof first === "function" ? first : second as (db: DbSql) => unknown)(tag) });
  return tag;
}

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
  // The transaction marts take their names from core.entities, and so does agg_entity_year.
  await q`insert into core.entities (id, name_display, name_normalized) select entity_id, name_display, lower(name_display) from marts.entity_profile`;
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
  };
};
const needOf = (spec: AskSpec): RollupNeed => spec.block === "table" || spec.block === "trend"
  ? (spec.dim === "county" ? { by: "county" } : { by: spec.dim ?? "authority" })
  : spec.block === "breakdown" ? { by: "cpv" } : { by: "total" };

/** The engine's mapping of each live query result (compile.ts), applied to the rollup rows. */
async function fromRollups(q: DbSql, spec: AskSpec, g: Grounding, sort?: "name" | "county"): Promise<{ source: string; data: BlockData }> {
  const plan = planRollup(ctxOf(spec, g), needOf(spec));
  if ("reason" in plan) throw new Error(plan.reason);
  const source = plan.source.table === "entity" ? `entity:${plan.source.role}` : plan.source.table;
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
      const r = await rollupTable(q, plan, { ...o, dim: spec.dim ?? "authority" });
      if ("reason" in r) throw new Error(r.reason);
      const first = r.rows[0];
      return { source, data: { block: "table", rows: r.rows.map((p) => ({ entityId: String(p.id), name: p.nm, county: p.co, value: Number(p.v), count: Number(p.n), population: null })),
        ...meta(r.total), ...(first?.tv !== undefined ? { totals: { value: Number(first.tv), count: Number(first.tn), entities: Number(first.te) } } : {}) } };
    }
    case "trend": {
      const r = await rollupTrend(q, plan, { dim: spec.dim === "county" ? "county" : spec.dim ?? "authority", yearA: spec.filters.yearFrom!, yearB: spec.filters.yearTo!, topN: spec.topN ?? 10 });
      if ("reason" in r) throw new Error(r.reason);
      return { source, data: { block: "trend", yearA: spec.filters.yearFrom!, yearB: spec.filters.yearTo!,
        rowsTrend: r.rows.map((p) => ({ entityId: p.id, name: p.nm, county: p.co, valueA: Number(p.va), valueB: Number(p.vb) })) } };
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
/** Group-by results without ORDER BY come back in any order: compare them sorted. */
const canonical = (data: BlockData) => data.block === "stat" && data.stat.byStream
  ? { ...data, stat: { ...data.stat, byStream: [...data.stat.byStream].sort((a, b) => a.src.localeCompare(b.src)) } } : data;

const without = (role: "authority" | "supplier", id: string): QueryPopulation => ({ operator: "and", groups: [{ operator: "and", conditions: [{ field: role, op: "not_in", values: [id] }] }] });
const base = (block: AskSpec["block"], extra: Partial<AskSpec> = {}, filters: AskSpec["filters"] = {}): AskSpec => ({ block, measure: "value", dim: "supplier", ...extra, filters });
const CLUJ: Grounding = { county: { query: "Cluj", canonical: "Cluj" } };
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
        const q = scoped(tx as unknown as DbSql, prefix);
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
        for (const c of [...SOURCE_CASES, ...THRESHOLD_SPECS]) {
          const live = await runRows(q, c.spec, c.g ?? {}, 0);
          if ("error" in live) throw new Error(`${c.name}: ${live.error}`);
          liveSources.set(c.name, live);
        }
        const drawer = (r: Exclude<Awaited<ReturnType<typeof runRows>>, { error: string }>) => ({
          total: r.total, value: r.value, sourceTotal: r.sourceTotal, sourceValue: r.sourceValue, dateFrom: r.dateFrom, dateTo: r.dateTo,
          statuses: [...r.statuses].sort((a, b) => String(a.state).localeCompare(String(b.state))), rows: r.rows,
        });
        const report = await buildAskRollups(q);
        expect(report.rows).toEqual({ agg_entity_year: 29, agg_pair_year: 19, agg_cpv_year: 15 });
        expect(await rollupsReady(q)).toBe(false); // the process cache, 10 minutes
        forgetRollupsReady();
        expect(await rollupsReady(q)).toBe(true);
        // The ceiling: 2,000,000.00 counts, 2,000,000.01 does not, a zero never.
        const [ceiling] = await q`select count(*)::int n, sum(v)::text v from marts.agg_pair_year where authority_id in (2, 4) and supplier_id = 10`;
        expect(ceiling).toMatchObject({ n: 2, v: "3999999.99" });

        for (const c of CASES) {
          const g = c.g ?? {};
          const live = liveAnswers.get(c.name)!;
          const rolled = await fromRollups(q, c.spec, g, c.sort);
          expect([c.name, rolled.source]).toEqual([c.name, c.source]);
          expect([c.name, canonical(rolled.data)]).toEqual([c.name, canonical(live)]);
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
          expect([c.name, canonical(wired.data)]).toEqual([c.name, canonical(liveAnswers.get(c.name)!)]);
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
  }, 60000);
});
