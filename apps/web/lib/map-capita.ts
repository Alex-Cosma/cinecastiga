import { createDb, type DbSql } from "@seap/db";
import { COUNTIES } from "./counties";
import { domainName } from "./cpv-aliases";
import { COUNTY_POPULATION, PER_CAPITA_SOURCE, martsCounty, readPerCapitaPopulations } from "./ask/per-capita";
import catalog from "./reference/population-rpl2021.json" with { type: "json" };
import geo from "./reference/uat-geo.json" with { type: "json" };
import {
  areaOf, countyKey, lei, MapError, sumByInstitution,
  type MapArea, type MapInstitution, type MapOptions, type MapResponse, type MapRow, type MapSelection,
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
