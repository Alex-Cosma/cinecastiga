import { createDb, type DbSql } from "@seap/db";
import { COUNTIES } from "./counties";
import { domainName } from "./cpv-aliases";
import { COUNTY_POPULATION, PER_CAPITA_SOURCE, martsCounty, readPerCapitaPopulations } from "./ask/per-capita";
import catalog from "./reference/population-rpl2021.json" with { type: "json" };
import geo from "./reference/uat-geo.json" with { type: "json" };
import {
  areaOf, countyKey, lei, MapError, perCapita, rowSelected, sumByInstitution,
  type MapArea, type MapInstitution, type MapOptions, type MapResponse, type MapRow, type MapSelection, type MapUatResponse,
} from "./map-capita-shared";

/*
 * /harta's data (owner, 6 November 2026): the value contracted per inhabitant of the local administrations, by county
 * and by UAT. The rows come from marts.agg_authority_cpv_year (packages/db map-rollup.ts), the institutions and their
 * population from the strict per-inhabitant list (lib/ask/per-capita.ts), the UATs from the ANCPI geometry's index
 * (lib/reference/uat-geo.json, scripts/map/build-map-geo.mjs). The kind's rows are read once per build and summed in
 * memory for every selection, so a click on a filter costs no query.
 */

const g = globalThis as unknown as { __seapSql?: DbSql };
function db(): DbSql {
  if (!g.__seapSql) g.__seapSql = createDb().sql;
  return g.__seapSql;
}

/** County key → display name (diacritics) and marts spelling ("Bistrita-Nasaud"), for the 42 counties. */
const COUNTY_BY_KEY = new Map(COUNTIES.map((name) => [countyKey(name), { name, marts: martsCounty(name) ?? name }]));
/** SIRUTA → resident population (INS RPL 2021). */
const UNIT_POPULATION = new Map((catalog.units as { siruta: number; population: number }[]).map((u) => [u.siruta, u.population]));
/** The UATs of the geometry: SIRUTA → name, county key, kind ("comună", "oraș", "municipiu", "sector"). */
const UATS = (geo.uats as [number, string, string, string][]).map(([siruta, name, county, kind]) => ({ siruta, name, county, kind }));
const UATS_BY_COUNTY = new Map<string, typeof UATS>();
for (const u of UATS) UATS_BY_COUNTY.set(u.county, [...(UATS_BY_COUNTY.get(u.county) ?? []), u]);
/** București as a whole (Primăria Municipiului București): no shape of its own, the six sectors are. */
export const BUCHAREST_SIRUTA = 179132;

interface KindData {
  institutions: MapInstitution[];
  rows: MapRow[];
  source: "rollup" | "live";
  councils: ReadonlySet<string>;
}

const CACHE_MS = 600_000;
let cached: { marker: string; at: number; data: Promise<KindData> } | null = null;

/**
 * The build the rows belong to: the table's own file (a new one each night) and the profiles' (the list of
 * administrations follows them); empty parts while a table is missing. The rollup is used only when its comment names
 * today's agg_cpv_year, as Întreabă's map probes agg_map_year.
 */
async function buildMarker(sql: DbSql): Promise<{ marker: string; ready: boolean }> {
  const [row] = (await sql`
    select coalesce((select c.oid::text || '.' || c.relfilenode::text from pg_class c where c.oid = to_regclass('marts.agg_authority_cpv_year')), '')
             || '/' || coalesce((select c.relfilenode::text from pg_class c where c.oid = to_regclass('marts.entity_profile')), '') marker,
           coalesce(obj_description(to_regclass('marts.agg_authority_cpv_year'), 'pg_class') = 'agg_cpv_year ' || to_regclass('marts.agg_cpv_year')::oid::text, false) ready
  `) as unknown as { marker: string; ready: boolean }[];
  return { marker: String(row?.marker ?? ""), ready: Boolean(row?.ready) };
}

async function loadKind(sql: DbSql, ready: boolean): Promise<KindData> {
  const p = await readPerCapitaPopulations(sql);
  const institutions: MapInstitution[] = p.ids.map((id, i) => ({
    id, county: p.counties[i]!, siruta: p.sirutas[i] ?? null, level: p.levels.get(id) === "county" ? "county" : "local",
  }));
  const index = new Map(p.ids.map((id, i) => [id, i]));
  const ids = sql.array(p.ids);
  // Without the nightly table (its first build after this code), the same grouping read live from the marts, once per build.
  const raw = (ready
    ? await sql`select authority_id::text a, y, src, cpv2 c, v::float8 v, n::float8 n
        from marts.agg_authority_cpv_year where authority_id = any(${ids}::bigint[])`
    : await sql`select x.authority_id::text a, substr(x.finalization_date, 1, 4) y, x.src, substr(x.cpv_code, 1, 2) c,
          sum(x.closing_value)::float8 v, count(*)::float8 n
        from (
          select authority_id, cpv_code, finalization_date, closing_value, 'da'::text src
          from marts.da_transactions where authority_id = any(${ids}::bigint[]) and closing_value > 0 and closing_value <= 2000000
          union all
          select authority_id, cpv_code, finalization_date, closing_value, 'contracts'
          from marts.contract_transactions where authority_id = any(${ids}::bigint[]) and closing_value > 0
        ) x group by 1, 2, 3, 4`) as unknown as { a: string; y: string | null; src: "da" | "contracts"; c: string | null; v: number; n: number }[];
  const rows: MapRow[] = [];
  for (const r of raw) {
    const a = index.get(String(r.a));
    if (a !== undefined) rows.push({ a, y: r.y, src: r.src, c: r.c, v: Number(r.v), n: Number(r.n) });
  }
  return { institutions, rows, source: ready ? "rollup" : "live", councils: p.councils };
}

/** The kind's institutions and rows of the current build, read once per build and per 10 minutes. */
export async function readMapKind(sql: DbSql = db()): Promise<KindData> {
  const { marker, ready } = await buildMarker(sql);
  const key = `${marker}:${ready}`;
  if (cached && cached.marker === key && Date.now() - cached.at < CACHE_MS) return cached.data;
  const data = loadKind(sql, ready);
  cached = { marker: key, at: Date.now(), data };
  data.catch(() => { if (cached?.data === data) cached = null; });
  return data;
}
/** Tests: read again. */
export function forgetMapKind(): void { cached = null; }

const NOTES = {
  population: `Populația: ${PER_CAPITA_SOURCE}.`,
  geometry: "Limitele UAT: ANCPI, 07.03.2024, și denumirile INS SIRUTA s1 2026 (data.gov.ro, CC BY 4.0), simplificate.",
  kind: "Primăriile și consiliile județene identificate strict (nume, județ și cod SIRUTA concordante, CUI valid). Un județ adună primăriile lui și consiliul județean; un UAT, primăria lui. Valori contractate, nu plăți.",
};

/**
 * The county level: each of the 42 counties, its town halls and council summed, divided by the population of the UATs
 * whose town hall the list holds (owner, 6 November 2026: the covered population; the council stays in the sum).
 * București: the city hall and the six sector town halls over the whole city (sectors are inside it).
 */
export function countyAreas(data: KindData, s: MapSelection): MapArea[] {
  const sums = sumByInstitution(data.rows, data.institutions.length, s);
  const members = new Map<string, number[]>();
  const covered = new Map<string, number>();
  data.institutions.forEach((inst, i) => {
    members.set(inst.county, [...(members.get(inst.county) ?? []), i]);
    // Population living in UATs whose administration is in the list (București: the city hall's is the whole city's).
    if (inst.level === "local" && inst.siruta !== null) covered.set(inst.county, (covered.get(inst.county) ?? 0) + (UNIT_POPULATION.get(inst.siruta) ?? 0));
  });
  return [...COUNTY_BY_KEY].map(([key, c]) => {
    const population = COUNTY_POPULATION.get(c.marts) ?? null;
    const gap = c.marts !== "Bucuresti" && !data.councils.has(c.marts) ? "no_council" as const : null;
    // București's city hall serves the whole city, which holds the six sectors: its denominator is the city's population.
    const people = c.marts === "Bucuresti" ? population : covered.get(c.marts) ?? null;
    const area = areaOf(key, c.name, population, members.get(c.marts) ?? [], sums, gap, people);
    return { ...area, coverage: population && people ? Math.min(1, people / population) : 0 };
  });
}

/** The UAT level of one county: each UAT of the geometry with its own town hall, divided by the UAT's population. */
export function uatAreas(data: KindData, s: MapSelection, county: string): { areas: MapArea[]; city: MapArea | null } {
  const sums = sumByInstitution(data.rows, data.institutions.length, s);
  const bySiruta = new Map<number, number[]>();
  data.institutions.forEach((inst, i) => {
    if (inst.level === "local" && inst.siruta !== null) bySiruta.set(inst.siruta, [...(bySiruta.get(inst.siruta) ?? []), i]);
  });
  const areas = (UATS_BY_COUNTY.get(county) ?? []).map((u) => {
    const members = bySiruta.get(u.siruta) ?? [];
    return areaOf(String(u.siruta), u.name, UNIT_POPULATION.get(u.siruta) ?? null, members, sums, members.length ? null : "no_admin");
  });
  const cityMembers = county === "bucuresti" ? bySiruta.get(BUCHAREST_SIRUTA) ?? [] : null;
  const city = cityMembers ? areaOf(String(BUCHAREST_SIRUTA), "Primăria Municipiului București", UNIT_POPULATION.get(BUCHAREST_SIRUTA) ?? null, cityMembers, sums, cityMembers.length ? null : "no_admin") : null;
  return { areas, city };
}

export async function getMap(s: MapSelection): Promise<MapResponse> {
  const county = s.level === "uat" ? COUNTY_BY_KEY.get(s.county ?? "") : null;
  if (s.level === "uat" && !county) throw new MapError("Județul nu există.", 404);
  const data = await readMapKind();
  const { areas, city } = s.level === "county" ? { areas: countyAreas(data, s), city: null } : uatAreas(data, s, s.county!);
  const all = city ? [...areas, city] : areas;
  return {
    selection: s,
    county: county ? { key: s.county!, name: county.name } : null,
    areas, city,
    totals: { value: lei(all.reduce((a, x) => a + (x.value ?? 0), 0)), records: all.reduce((a, x) => a + x.records, 0), buyers: all.reduce((a, x) => a + x.buyers, 0) },
    source: data.source,
    notes: NOTES,
  };
}

let names: { at: number; rows: Promise<Map<string, string | null>> } | null = null;
/** The official names of the CPV divisions (marts.cpv_tree, level 1), read once per hour. */
function divisionNames(sql: DbSql): Promise<Map<string, string | null>> {
  if (names && Date.now() - names.at < 3_600_000) return names.rows;
  const rows = (async () => {
    const r = (await sql`select left(code, 2) c, name_ro from marts.cpv_tree where level = 1`) as unknown as { c: string; name_ro: string | null }[];
    return new Map(r.map((x) => [x.c, x.name_ro]));
  })();
  names = { at: Date.now(), rows };
  rows.catch(() => { if (names?.rows === rows) names = null; });
  return rows;
}

/** The filters' choices for the kind: its years and CPV divisions with their totals. */
export async function getMapOptions(): Promise<MapOptions> {
  const sql = db();
  const [data, official] = await Promise.all([readMapKind(sql), divisionNames(sql)]);
  const years = new Map<string, { value: number; records: number }>(), cpv = new Map<string, { value: number; records: number }>();
  const undated = { value: 0, records: 0 };
  for (const r of data.rows) {
    const y = r.y === null ? undated : years.get(r.y) ?? years.set(r.y, { value: 0, records: 0 }).get(r.y)!;
    y.value += r.v; y.records += r.n;
    if (r.c !== null) { const c = cpv.get(r.c) ?? cpv.set(r.c, { value: 0, records: 0 }).get(r.c)!; c.value += r.v; c.records += r.n; }
  }
  return {
    kinds: [{ key: "local_admin", label: "Primării și consilii județene", levels: ["county", "uat"] }],
    years: [...years].sort((a, b) => a[0].localeCompare(b[0])).map(([year, t]) => ({ year, value: lei(t.value), records: t.records })),
    undated: { value: lei(undated.value), records: undated.records },
    cpv: [...cpv].sort((a, b) => b[1].value - a[1].value).map(([code, t]) => ({ code, name: domainName(code, official.get(code)), official: official.get(code) ?? null, value: lei(t.value), records: t.records })),
    datasets: ["all", "da", "contracts"],
  };
}

/**
 * One UAT's panel: its figures in the selection beside the county's, its years (all of them, the selection's CPV and
 * channel), divisions and channels (the selection's years), its largest suppliers (read live from the transaction marts,
 * the same population as the map's rows: DAs up to 2,000,000 lei, contract allocations) and the county's other UATs.
 */
export async function getMapUat(s: MapSelection, siruta: number): Promise<MapUatResponse> {
  const unit = UATS.find((u) => u.siruta === siruta);
  if (!unit) throw new MapError("UAT-ul nu există.", 404);
  const county = COUNTY_BY_KEY.get(unit.county)!;
  const sql = db();
  const [data, official] = await Promise.all([readMapKind(sql), divisionNames(sql)]);
  const { areas } = uatAreas(data, s, unit.county);
  const area = areas.find((a) => a.key === String(siruta))!;
  const ranked = areas.filter((a) => a.perCapita !== null).sort((a, b) => b.perCapita! - a.perCapita!);
  const countyArea = countyAreas(data, s).find((a) => a.key === unit.county) ?? null;
  const members = data.institutions.map((inst, i) => (inst.level === "local" && inst.siruta === siruta ? i : -1)).filter((i) => i >= 0);
  const mine = new Set(members);
  const own = data.rows.filter((r) => mine.has(r.a));
  const yearsSet = s.years === "all" ? null : new Set(s.years), cpvSet = s.cpv === "all" ? null : new Set(s.cpv);
  const population = UNIT_POPULATION.get(siruta) ?? null;
  // Every year with rows anywhere in the kind, so a year without purchases shows as one.
  const allYears = [...new Set(data.rows.map((r) => r.y).filter((y): y is string => y !== null))].sort();
  const years = allYears.map((year) => {
    const one = { ...s, years: [year] }, ys = new Set([year]);
    const picked = own.filter((r) => rowSelected(r, one, ys, cpvSet));
    const value = picked.reduce((a, r) => a + r.v, 0), records = picked.reduce((a, r) => a + r.n, 0);
    const c = countyAreas(data, one).find((a) => a.key === unit.county);
    return { year, value: lei(value), records, perCapita: area.gap ? null : perCapita(value, population), countyPerCapita: c?.perCapita ?? null, selected: !yearsSet || yearsSet.has(year) };
  });
  const byCpv = new Map<string | null, { value: number; records: number }>(), channels = { da: 0, contracts: 0 };
  for (const r of own) {
    if (rowSelected(r, { ...s, dataset: "all" }, yearsSet, cpvSet)) channels[r.src] += r.v;
    if (rowSelected(r, s, yearsSet, cpvSet)) {
      const c = byCpv.get(r.c) ?? byCpv.set(r.c, { value: 0, records: 0 }).get(r.c)!;
      c.value += r.v; c.records += r.n;
    }
  }
  const ids = members.map((i) => data.institutions[i]!.id);
  const named = ids.length ? (await sql`select id::text id, name_display name from core.entities where id = any(${sql.array(ids)}::bigint[])`) as unknown as { id: string; name: string }[] : [];
  const valueOf = (i: number) => own.filter((r) => r.a === i && rowSelected(r, s, yearsSet, cpvSet)).reduce((a, r) => a + r.v, 0);
  const townHalls = members.map((i) => ({ id: data.institutions[i]!.id, name: named.find((n) => n.id === data.institutions[i]!.id)?.name ?? "", value: lei(valueOf(i)) }))
    .sort((a, b) => b.value - a.value);
  const suppliers = ids.length ? (await sql`
    select x.supplier_id::text id, e.name_display name, sum(x.v)::float8 value, count(*)::int records from (
      select supplier_id, closing_value v, finalization_date d, cpv_code c from marts.da_transactions
        where authority_id = any(${sql.array(ids)}::bigint[]) and closing_value > 0 and closing_value <= 2000000 and supplier_id is not null and ${s.dataset !== "contracts"}
      union all
      select supplier_id, closing_value, finalization_date, cpv_code from marts.contract_transactions
        where authority_id = any(${sql.array(ids)}::bigint[]) and closing_value > 0 and supplier_id is not null and ${s.dataset !== "da"}
    ) x join core.entities e on e.id = x.supplier_id
    where ${yearsSet ? sql`substr(x.d, 1, 4) = any(${sql.array([...yearsSet])}::text[])` : sql`true`}
      and ${cpvSet ? sql`substr(x.c, 1, 2) = any(${sql.array([...cpvSet])}::text[])` : sql`true`}
    group by 1, 2 order by value desc limit 5`) as unknown as { id: string; name: string; value: number; records: number }[] : [];
  return {
    selection: s,
    county: { key: unit.county, name: county.name, perCapita: countyArea?.perCapita ?? null },
    uat: { ...area, kind: unit.kind },
    townHalls,
    place: area.perCapita === null ? null : ranked.findIndex((a) => a.key === area.key) + 1,
    ranked: ranked.length,
    years,
    cpv: [...byCpv].sort((a, b) => b[1].value - a[1].value).map(([code, t]) => ({ code, name: code === null ? "fără cod CPV" : domainName(code, official.get(code)), value: lei(t.value), records: t.records })),
    channels: { da: lei(channels.da), contracts: lei(channels.contracts) },
    suppliers: suppliers.map((x) => ({ ...x, value: lei(Number(x.value)) })),
    neighbours: areas.map((a) => ({ key: a.key, name: a.name, perCapita: a.perCapita })),
  };
}
