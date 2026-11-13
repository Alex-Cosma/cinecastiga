import type { DbSql } from "@seap/db";
import { localAuthorityIdentities, readPopulationMappingRows, type PopulationMappingRow } from "./peer-population";
import institutionsRef from "./reference/local-institutions-2026.json" with { type: "json" };
import schoolsRef from "./reference/schools-me-2025.json" with { type: "json" };
import hospitalsRef from "./reference/hospitals-cnas-2025.json" with { type: "json" };

/*
 * A locality's institutions (owner, 13 November 2026, after a friend's search at Cisnădie missed the town hospital):
 * searching a locality means all of its institutions, „Doar primăria” the narrower choice. Who belongs, all by CUI
 * from lists already used on /harta, so nothing is guessed from a name:
 * - the town hall: the identities Întreabă counts as „primăria X” (lib/peer-population.ts localAuthorityIdentities);
 * - the town hall's institutions and its verified companies: the Ministry of Finance's list of public entities by
 *   principal credit officer, and the companies it owns alone or as the majority shareholder (lib/map-institutions.ts);
 * - the hospitals in the locality (CNAS 2025, placed in a UAT);
 * - the schools and kindergartens in the locality (the Ministry of Education's 2025–2026 network).
 * Institutions of the county or the state that only have their seat there (a DGASPC centre, the prefecture) stay out:
 * no source places them (owner's choice of the recommendation, 13 November 2026).
 */

export type LocalityKind = "primarie" | "institutie" | "firma" | "spital" | "scoala";
export interface LocalityGroup { kind: LocalityKind; name: string; ids: string[] }
export interface LocalityInstitutions { siruta: number; townHall: string[]; groups: LocalityGroup[]; ids: string[] }

interface RefInstitution { cui: string; name: string; parent: string }
interface RefHospital { name: string; siruta: number | null; cuis: string[] }
type RefSchool = [code: string, name: string, county: string, siruta: number, pupils: number, cuis: string[]];

const INSTITUTIONS = institutionsRef.institutions as RefInstitution[];
const COMPANIES = institutionsRef.companies as RefInstitution[];
const SCHOOLS = schoolsRef.schools as unknown as RefSchool[];
const HOSPITALS = hospitalsRef.hospitals as RefHospital[];

/** A label as the lists write it, in sentence case where it is all capitals („LICEUL TEHNOLOGIC CISNĂDIE” → „Liceul Tehnologic Cisnădie”). */
export function displayName(name: string): string {
  const trimmed = name.replace(/\s+/g, " ").trim();
  if (trimmed !== trimmed.toLocaleUpperCase("ro-RO")) return trimmed;
  const lower = new Set(["de", "din", "cu", "si", "și", "a", "al", "pentru", "la", "nr.", "nr"]);
  return trimmed.toLocaleLowerCase("ro-RO").split(" ").map((w, i) => i > 0 && lower.has(w) ? w : w.replace(/^(["„(]?)(\p{L})/u, (_, q: string, c: string) => q + c.toLocaleUpperCase("ro-RO"))).join(" ");
}

const ORDER: Record<LocalityKind, number> = { primarie: 0, spital: 1, scoala: 2, institutie: 3, firma: 4 };
const TTL_MS = 60 * 60 * 1000;
const cache = new Map<number, { at: number; value: Promise<LocalityInstitutions> }>();

/** The institutions of one UAT, kept an hour (the lists are static; identities change with the nightly build). */
export function localityInstitutions(sql: DbSql, siruta: number): Promise<LocalityInstitutions> {
  const kept = cache.get(siruta);
  if (kept && Date.now() - kept.at < TTL_MS) return kept.value;
  const value = readLocality(sql, siruta);
  cache.set(siruta, { at: Date.now(), value });
  value.catch(() => { if (cache.get(siruta)?.value === value) cache.delete(siruta); });
  return value;
}

let mapping: { at: number; rows: Promise<PopulationMappingRow[]> } | null = null;
/** The town halls' identities of every UAT (one read of the registry), kept an hour. */
export function townHallRows(sql: DbSql): Promise<PopulationMappingRow[]> {
  if (mapping && Date.now() - mapping.at < TTL_MS) return mapping.rows;
  const rows = readPopulationMappingRows(sql);
  mapping = { at: Date.now(), rows };
  rows.catch(() => { if (mapping?.rows === rows) mapping = null; });
  return rows;
}

async function readLocality(sql: DbSql, siruta: number): Promise<LocalityInstitutions> {
  const mapped = await townHallRows(sql);
  const townHall = localAuthorityIdentities(mapped, siruta).ids;
  const hallSet = new Set(townHall);
  const hallCuis = new Set(mapped.filter((r) => hallSet.has(r.id)).map((r) => r.cui).filter((c): c is string => Boolean(c)));
  const listed: { kind: LocalityKind; name: string; cuis: string[] }[] = [
    ...INSTITUTIONS.filter((x) => hallCuis.has(x.parent)).map((x) => ({ kind: "institutie" as const, name: x.name, cuis: [x.cui] })),
    ...COMPANIES.filter((x) => hallCuis.has(x.parent)).map((x) => ({ kind: "firma" as const, name: x.name, cuis: [x.cui] })),
    ...HOSPITALS.filter((h) => h.siruta === siruta).map((h) => ({ kind: "spital" as const, name: h.name, cuis: h.cuis })),
    ...SCHOOLS.filter((s) => s[3] === siruta).map((s) => ({ kind: "scoala" as const, name: s[1], cuis: s[5] })),
  ];
  const cuis = [...new Set(listed.flatMap((x) => x.cuis))];
  const rows = cuis.length ? (await sql`
    select e.id::text id, e.cui_canonical cui from core.entities e
    where e.cui_valid and e.cui_canonical = any(${sql.array(cuis)}::text[]) and e.id <= 9007199254740991
      and exists (select 1 from marts.entity_profile p where p.entity_id = e.id and p.role = 'authority')
  `) as unknown as { id: string; cui: string }[] : [];
  const byCui = new Map<string, string[]>();
  for (const r of rows) byCui.set(r.cui, [...(byCui.get(r.cui) ?? []), r.id]);
  const taken = new Set(townHall);
  const groups: LocalityGroup[] = [];
  // A school is also on the Ministry of Finance's list: it is named once, as a school.
  for (const x of [...listed].sort((a, b) => ORDER[a.kind] - ORDER[b.kind])) {
    const ids = x.cuis.flatMap((c) => byCui.get(c) ?? []).filter((id) => !taken.has(id));
    if (!ids.length) continue;
    ids.forEach((id) => taken.add(id));
    groups.push({ kind: x.kind, name: displayName(x.name), ids });
  }
  groups.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.name.localeCompare(b.name, "ro"));
  return { siruta, townHall, groups, ids: [...taken] };
}
