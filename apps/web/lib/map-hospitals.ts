import type { DbSql } from "@seap/db";
import { readAuthorityKinds } from "./ask/authority-kind";
import { COUNTIES } from "./counties";
import reference from "./reference/hospitals-cnas-2025.json" with { type: "json" };
import { countyKey, hospitalArea, hospitalCountyArea, sumByInstitution, type MapArea, type MapHospital, type MapRow, type MapSelection } from "./map-capita-shared";

/*
 * /harta's hospitals (owner, 8 November 2026). Which institutions: the public hospitals of CNAS's 2025 list
 * (cnas.ro/spitale, the "Macheta SPITALE AN 2025" of the Ministry of Health), each linked by hand to the buying
 * institutions by CUI (lib/reference/hospitals-cnas-2025.json: names, the military hospitals' units from their own TED
 * notices, a section's beds with the hospital that buys for it), plus every other institution Întreabă names a hospital
 * (authority-kind.ts: merged, closed, or without an insurance contract; no beds). Each is drawn in its town (its
 * name's UAT, the county seat for a county hospital, București for the capital's), not at its address.
 */

interface ReferenceHospital { code: string; name: string; county: string; siruta: number | null; beds: number | null; cuis: string[] }
const LISTED = [...(reference.hospitals as ReferenceHospital[]), ...(reference.outside as ReferenceHospital[])];

export const BEDS_SOURCE = "Paturi: CNAS (cnas.ro/spitale), structura aprobată de Ministerul Sănătății la 31.12.2025.";

/** The kind's data of one build: the hospitals, their identities (institutions, each with its hospital) and the rows. */
export interface HospitalData {
  hospitals: MapHospital[];
  /** An identity (a buying institution's id) and the index of its hospital. */
  institutions: { id: string; hospital: number }[];
  rows: MapRow[];
  source: "rollup" | "live";
  /** Each hospital's identity with the largest value of all years: what its name links to. */
  primary: (string | null)[];
}

const KNOWN_COUNTIES = new Set(COUNTIES.map(countyKey));

/** The rows of a set of institutions, grouped as the map's (the nightly table, or the marts read live without it). */
export type ReadRows = (sql: DbSql, ids: string[], ready: boolean) => Promise<{ a: string; y: string | null; src: "da" | "contracts"; c: string | null; v: number; n: number }[]>;

export async function loadHospitals(sql: DbSql, ready: boolean, readRows: ReadRows): Promise<HospitalData> {
  const cuis = [...new Set(LISTED.flatMap((h) => h.cuis))];
  const [identities, kinds] = await Promise.all([
    sql`select e.id::text id, e.cui_canonical cui from core.entities e
      where e.cui_valid and e.cui_canonical = any(${sql.array(cuis)}::text[]) and e.id <= 9007199254740991
        and exists (select 1 from marts.entity_profile p where p.entity_id = e.id and p.role = 'authority')` as unknown as Promise<{ id: string; cui: string }[]>,
    readAuthorityKinds(sql),
  ]);
  const hospitals: MapHospital[] = [], institutions: { id: string; hospital: number }[] = [];
  const byCui = new Map<string, number>();
  LISTED.forEach((h) => {
    const i = hospitals.push({ code: h.code, name: h.name, county: h.county, siruta: h.siruta, beds: h.beds }) - 1;
    for (const cui of h.cuis) byCui.set(cui, i);
  });
  const taken = new Set<string>();
  for (const row of identities) {
    const i = byCui.get(row.cui);
    if (i === undefined || taken.has(row.id)) continue;
    taken.add(row.id); institutions.push({ id: row.id, hospital: i });
  }
  // The institutions named a hospital that the list does not hold: each a hospital of its own, in its county, no beds, not drawn.
  const others = kinds.ids.spital.filter((id) => !taken.has(id));
  if (others.length) {
    const named = (await sql`select entity_id::text id, name_display name, county from marts.entity_profile
      where role = 'authority' and entity_id = any(${sql.array(others)}::bigint[])`) as unknown as { id: string; name: string; county: string | null }[];
    for (const o of named) {
      const county = o.county ? countyKey(o.county) : null;
      if (!county || !KNOWN_COUNTIES.has(county)) continue;
      const i = hospitals.push({ code: `e${o.id}`, name: o.name, county, siruta: null, beds: null }) - 1;
      taken.add(o.id); institutions.push({ id: o.id, hospital: i });
    }
  }
  const index = new Map(institutions.map((inst, i) => [inst.id, i]));
  const rows: MapRow[] = [];
  const total = new Float64Array(institutions.length);
  for (const r of await readRows(sql, institutions.map((inst) => inst.id), ready)) {
    const a = index.get(String(r.a));
    if (a === undefined) continue;
    rows.push({ a, y: r.y, src: r.src, c: r.c, v: Number(r.v), n: Number(r.n) });
    total[a]! += Number(r.v);
  }
  // Hospitals none of whose identities is in this database (a CUI the data does not have yet) are left out.
  const has = new Set(institutions.map((inst) => inst.hospital));
  const keep = hospitals.map((_, i) => has.has(i));
  const renumber = new Map<number, number>();
  const kept = hospitals.filter((_, i) => keep[i] && renumber.set(i, renumber.size));
  const primary: (string | null)[] = kept.map(() => null), best = new Float64Array(kept.length).fill(-1);
  const moved = institutions.map((inst, i) => {
    const h = renumber.get(inst.hospital)!;
    if (total[i]! > best[h]!) { best[h] = total[i]!; primary[h] = inst.id; }
    return { id: inst.id, hospital: h };
  });
  return { hospitals: kept, institutions: moved, rows, source: ready ? "rollup" : "live", primary };
}

/** The current names of the hospitals' linked identities (the list keeps the name of the day it was made). */
export async function hospitalNames(sql: DbSql, data: HospitalData): Promise<MapHospital[]> {
  const ids = data.primary.filter((id): id is string => id !== null);
  if (!ids.length) return data.hospitals;
  const rows = (await sql`select id::text id, name_display name from core.entities where id = any(${sql.array(ids)}::bigint[])`) as unknown as { id: string; name: string | null }[];
  const names = new Map(rows.map((r) => [r.id, r.name]));
  return data.hospitals.map((h, i) => ({ ...h, name: (data.primary[i] && names.get(data.primary[i]!)) || h.name }));
}

function members(data: HospitalData): number[][] {
  const out = data.hospitals.map(() => [] as number[]);
  data.institutions.forEach((inst, i) => out[inst.hospital]!.push(i));
  return out;
}

/** The county level: each county's hospitals (owner, 8 November 2026: the total, lei per bed with 2025 alone). */
export function hospitalCounties(data: HospitalData, s: MapSelection, counties: readonly { key: string; name: string }[], perBed: boolean): MapArea[] {
  const sums = sumByInstitution(data.rows, data.institutions.length, s);
  const all = members(data);
  return counties.map((c) => hospitalCountyArea(c.key, c.name,
    data.hospitals.flatMap((h, i) => (h.county === c.key ? [{ h, members: all[i]! }] : [])), sums, perBed));
}

/** One county's hospitals, each its own area, with the UAT it is drawn in and the identity its name links to. */
export function countyHospitals(data: HospitalData, s: MapSelection, county: string, perBed: boolean, hospitals: readonly MapHospital[] = data.hospitals): MapArea[] {
  const sums = sumByInstitution(data.rows, data.institutions.length, s);
  const all = members(data);
  return hospitals.flatMap((h, i) => (h.county === county ? [hospitalArea(h, all[i]!, sums, perBed, data.primary[i] ?? null)] : []));
}
