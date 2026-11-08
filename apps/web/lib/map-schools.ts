import type { DbSql } from "@seap/db";
import { readAuthorityKinds } from "./ask/authority-kind";
import reference from "./reference/schools-me-2025.json" with { type: "json" };
import { schoolArea, schoolCountyArea, sumByInstitution, type MapArea, type MapRow, type MapSchool, type MapSelection } from "./map-capita-shared";
import type { ReadRows } from "./map-hospitals";

/*
 * /harta's schools (owner, 8 November 2026). Which institutions: the public schools and kindergartens with legal
 * personality of the Ministry of Education's 2025-2026 school network, ministry-run schools included; not the
 * universities, the children's palaces and clubs, the school sports clubs, the inspectorates or the teachers' and
 * resource centres. Each is linked to the buying institutions by CIF: its own, and those of the schools merged into it
 * in 2025 (the 2024-2025 network, by the units' statistical codes). Its pupils are the Ministry's of 2024-2025,
 * pre-school children included, counted with the school each unit belongs to now. Each is drawn in its UAT (București:
 * its sector). Built outside the repository (seap-filters-work/scratchpad/scoli-20261108/build_reference.py).
 */

type ReferenceSchool = [code: string, name: string, county: string, siruta: number, pupils: number, cuis: string[]];
const LISTED = reference.schools as unknown as ReferenceSchool[];

export const PUPILS_SOURCE = "Elevi: Ministerul Educației, elevii înmatriculați în anul școlar 2024–2025 (data.gov.ro), preșcolarii incluși.";

/** The kind's data of one build: the schools, their identities (institutions, each with its school) and the rows. */
export interface SchoolData {
  schools: MapSchool[];
  /** An identity (a buying institution's id) and the index of its school. */
  institutions: { id: string; school: number }[];
  rows: MapRow[];
  source: "rollup" | "live";
  /** Each school's identity with the largest value of all years: what its name links to. */
  primary: (string | null)[];
}

export async function loadSchools(sql: DbSql, ready: boolean, readRows: ReadRows): Promise<SchoolData> {
  const byCui = new Map<string, number>();
  const all: MapSchool[] = LISTED.map(([code, name, county, siruta, pupils, cuis], i) => {
    for (const cui of cuis) byCui.set(cui, i);
    return { code, name, county, siruta, pupils };
  });
  const [identities, kinds] = await Promise.all([
    sql`select e.id::text id, e.cui_canonical cui from core.entities e
      where e.cui_valid and e.cui_canonical = any(${sql.array([...byCui.keys()])}::text[]) and e.id <= 9007199254740991
        and exists (select 1 from marts.entity_profile p where p.entity_id = e.id and p.role = 'authority')` as unknown as Promise<{ id: string; cui: string }[]>,
    readAuthorityKinds(sql),
  ]);
  // A school in the network that carries its town hall's CIF (owner, 8 November 2026, Prahova) never brings the town
  // hall in: an identity Întreabă names a commune, a town or a county council is left out, whatever the list says.
  const administrations = new Set([...kinds.ids.comuna, ...kinds.ids.oras_municipiu, ...kinds.ids.consiliu_judetean]);
  const institutions: { id: string; school: number }[] = [], taken = new Set<string>();
  for (const row of identities) {
    const i = byCui.get(row.cui);
    if (i === undefined || taken.has(row.id) || administrations.has(row.id)) continue;
    taken.add(row.id); institutions.push({ id: row.id, school: i });
  }
  const index = new Map(institutions.map((inst, i) => [inst.id, i]));
  const rows: MapRow[] = [], total = new Float64Array(institutions.length);
  for (const r of await readRows(sql, institutions.map((inst) => inst.id), ready)) {
    const a = index.get(String(r.a));
    if (a === undefined) continue;
    rows.push({ a, y: r.y, src: r.src, c: r.c, v: Number(r.v), n: Number(r.n) });
    total[a]! += Number(r.v);
  }
  // Schools none of whose CIFs is in this database are left out.
  const has = new Set(institutions.map((inst) => inst.school));
  const renumber = new Map<number, number>();
  const schools = all.filter((_, i) => has.has(i) && renumber.set(i, renumber.size));
  const primary: (string | null)[] = schools.map(() => null), best = new Float64Array(schools.length).fill(-1);
  const moved = institutions.map((inst, i) => {
    const s = renumber.get(inst.school)!;
    if (total[i]! > best[s]!) { best[s] = total[i]!; primary[s] = inst.id; }
    return { id: inst.id, school: s };
  });
  return { schools, institutions: moved, rows, source: ready ? "rollup" : "live", primary };
}

/** The current names of the schools' linked identities (the network's are in capitals, as of its report). */
export async function schoolNames(sql: DbSql, data: SchoolData, county: string): Promise<MapSchool[]> {
  const ids = data.primary.filter((id, i): id is string => id !== null && data.schools[i]!.county === county);
  if (!ids.length) return data.schools;
  const rows = (await sql`select id::text id, name_display name from core.entities where id = any(${sql.array(ids)}::bigint[])`) as unknown as { id: string; name: string | null }[];
  const names = new Map(rows.map((r) => [r.id, r.name]));
  return data.schools.map((x, i) => (x.county === county && data.primary[i] && names.get(data.primary[i]!) ? { ...x, name: names.get(data.primary[i]!)! } : x));
}

function members(data: SchoolData): number[][] {
  const out = data.schools.map(() => [] as number[]);
  data.institutions.forEach((inst, i) => out[inst.school]!.push(i));
  return out;
}

/** The county level: each county's schools (owner, 8 November 2026: the total, lei per pupil with 2025 alone). */
export function schoolCounties(data: SchoolData, s: MapSelection, counties: readonly { key: string; name: string }[], perPupil: boolean): MapArea[] {
  const sums = sumByInstitution(data.rows, data.institutions.length, s);
  const all = members(data);
  const byCounty = new Map<string, { x: MapSchool; members: number[] }[]>();
  data.schools.forEach((x, i) => byCounty.set(x.county, [...(byCounty.get(x.county) ?? []), { x, members: all[i]! }]));
  return counties.map((c) => schoolCountyArea(c.key, c.name, byCounty.get(c.key) ?? [], sums, perPupil));
}

/** One county's schools, each its own area, with the UAT it is drawn in and the identity its name links to. */
export function countySchools(data: SchoolData, s: MapSelection, county: string, perPupil: boolean, schools: readonly MapSchool[] = data.schools): MapArea[] {
  const sums = sumByInstitution(data.rows, data.institutions.length, s);
  const all = members(data);
  return schools.flatMap((x, i) => (x.county === county ? [schoolArea(x, all[i]!, sums, perPupil, data.primary[i] ?? null)] : []));
}
