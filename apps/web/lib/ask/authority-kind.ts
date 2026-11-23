import type { DbSql } from "@seap/db";
import { countyFold, countylessLegacyCode, localAdministrationName, populationFold, populationForMapping, sectorTownHallUnit, type PopulationMappingRow } from "../peer-population";
import { readPerCapitaPopulations } from "./per-capita";
import { AUTHORITY_KINDS, LOCAL_ADMIN_KIND, MINISTRY_KIND, NAME_LIST_KINDS, TOWN_HALL_KIND, UNIVERSITY_KIND, type AuthorityKind, type NameListKind, type ParsedAuthorityKind } from "./spec";

/*
 * The kind of a buying institution (plan §2.5, D1): one classification for
 * the answers, their sources, the risk profiles and the peer groups, so
 * "spitalele" are the same institutions on a ranking and in a comparison.
 *
 * - Town halls (comuna, oras_municipiu) come from the locality registry:
 *   reference.authority_uat → reference.uat.tip (3 = comună; 1, 2, 4, 9 =
 *   municipiu, oraș, București), with the rule of the locality scope (F15,
 *   localAuthorityIdsForUnit): a legacy code counts only in the institution's
 *   own county, for a valid CUI and for a name with a local-administration
 *   legal form (D2: without a county, a name no other unit in the country
 *   carries, countylessLegacyCode). Without a code, the strict name + county match of the
 *   population join (one candidate, valid CUI), also once without a trailing
 *   bare county name; the six București sector town halls (owner decision F05) are
 *   town halls. A legacy code that does not corroborate is not used.
 * - County councils (D2): the strict list's county level (populationForMapping,
 *   valid CUI), whatever the legal form of the name, then the name rules.
 * - Every other institution, and a town hall the registry does not place, by
 *   strict name rules. Hospitals include the clinical institutes
 *   (final/entity_card.md §3.1), not forensic medicine or research.
 * - A name matching the rules of two kinds has no kind, everywhere.
 *
 * The kinds are computed once per marts build in this process, as id lists
 * (readAuthorityKinds): every SQL condition is `id = any(ids)` and the
 * JavaScript kind of an id is the same list's.
 */

/** The kind in the "avansat" SQL text and in its comments. */
export const KIND_LABEL: Record<ParsedAuthorityKind, string> = {
  local_admin: "primării și consilii județene (lista strictă a valorii pe locuitor)",
  primarie: "primării (de comună, oraș și municipiu)",
  minister: "ministere (cu unitățile care cumpără sub numele unui minister)",
  universitate: "universități",
  comuna: "primării de comună",
  oras_municipiu: "primării de oraș și municipiu",
  consiliu_judetean: "consilii județene / județe",
  spital: "spitale",
  scoala: "școli (și licee, colegii, grădinițe)",
};

/** Where each kind comes from, for the "avansat" SQL text. */
export const KIND_SOURCE: Record<ParsedAuthorityKind, string> = {
  local_admin: "nume, județ și cod SIRUTA concordante, cu populația INS RPL 2021",
  primarie: "registrul localităților, apoi numele",
  minister: "după nume: începe cu „Ministerul”",
  universitate: "după nume: începe cu „Universitatea”, plus ASE, SNSPA, Academia de Poliție și Academia Națională de Muzică",
  comuna: "registrul localităților, apoi numele",
  oras_municipiu: "registrul localităților, apoi numele",
  consiliu_judetean: "lista strictă a valorii pe locuitor, apoi numele",
  spital: "după nume, cu institutele clinice",
  scoala: "după nume",
};

/** Lower case without diacritics (as unaccent() and lower() fold a name), without outer spaces. */
const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** "UAT …", "U.A.T. …", "Unitatea administrativ-teritorială (a) …": the legal form of a UAT's own administration. */
const UAT_FORM = String.raw`^(?:u\.?\s?a\.?\s?t\.?|unitatea administrativ[ -]?teritoriala|unitatea administrativa teritoriala)\s+(?:a\s+)?`;
/**
 * The strict name rules, on the folded name. Today's patterns, with
 * "Primăria comunei …" among the communes instead of the towns (plan §5 D1),
 * and a UAT's legal form followed by the unit's kind.
 */
const NAME_RULES: Record<AuthorityKind, readonly RegExp[]> = {
  comuna: [/^comuna /, /^primaria comun(?:ei|a) /, new RegExp(`${UAT_FORM}comun(?:a|ei)\\b`)],
  oras_municipiu: [/^(?:oras|ors|munici)/, /^primaria (?!comun(?:ei|a) )/, new RegExp(`${UAT_FORM}(?:oras|municipi)`)],
  consiliu_judetean: [/^judetul /, /^consiliul judetean/],
  spital: [/^spital/],
  scoala: [/scoala/, /^liceul/, /^colegiul/, /^gradinita/],
};

const CLINICAL_SPECIALTY = /\b(?:clinic|oncologi|inimii|de boli|de urgenta|sanatatea mamei|hematologi|gastroenterologi|urologi|pneumoftiziologi|psihiatri|endocrinologi|diabet|neurologi|recuperare|gerontologi)/;
/**
 * A clinical institute, counted with the hospitals (final/entity_card.md §3.1):
 * "Institutul …" with a clinical specialty in its name, not an institute of
 * forensic medicine or of research. 21 institutes with a profile locally.
 */
export function isClinicalInstitute(name: string): boolean {
  const f = fold(name);
  return f.startsWith("institutul ") && CLINICAL_SPECIALTY.test(f) && !/medicina legala|cercetare/.test(f);
}

/** The kind of a name alone: the only kind whose rules it matches, or null. */
export function nameKind(name: string): AuthorityKind | null {
  const f = fold(name);
  const matches = AUTHORITY_KINDS.filter((kind) => NAME_RULES[kind].some((rule) => rule.test(f)) || kind === "spital" && isClinicalInstitute(name));
  return matches.length === 1 ? matches[0]! : null;
}

/**
 * The name lists (NAME_LIST_KINDS; search probe, 23 November 2026), on the folded name, apart from the five kinds: an
 * institution may be on a list and have a kind („Ministerul Apărării - Spitalul Militar…” has none, a university's
 * school may).
 * - Ministries: the name begins with „Ministerul”. Most of the Ministry of Defence's purchases are recorded under its
 *   units („Ministerul Apărării - Unitatea Militară 02550”), never under the ministry alone, so the units that buy
 *   under a ministry's name are on the list: 158 names locally, 61 bn lei, 27 of them (9.5 bn lei) without a unit. An institution
 *   that only stands by a ministry („… de pe lângă Ministerul Justiției”) is not.
 * - Universities: the name begins with „Universitatea” (60 names locally, private ones included; 64 names and 13.8 bn lei with the next), and the four that
 *   are universities under another name. „Academia Română”, the university hospitals, libraries and sports clubs are not.
 */
const NAME_LIST_RULES: Record<NameListKind, readonly RegExp[]> = {
  minister: [/^ministerul /],
  universitate: [/^universitatea /, /^academia de studii economice\b/, /^scoala nationala de studii politice si administrative\b/, /^academia de politie\b/, /^academia nationala de muzica\b/],
};
/** Whether a name is on a name list. */
export function onNameList(kind: NameListKind, name: string): boolean {
  const f = fold(name).replace(/\s+/g, " ");
  return NAME_LIST_RULES[kind].some((rule) => rule.test(f));
}

/** reference.uat: the type and county of each SIRUTA code. */
export type LocalityRegistry = ReadonlyMap<number, { tip: string; county: string | null }>;
/** What the classification reads of an institution: marts.entity_profile, core.entities (a valid CUI) and its legacy code. */
export type AuthorityKindRow = PopulationMappingRow;

const unitKind = (tip: string | undefined): "comuna" | "oras_municipiu" | null =>
  tip === "3" ? "comuna" : tip === "1" || tip === "2" || tip === "4" || tip === "9" ? "oras_municipiu" : null;

/**
 * The name without a trailing bare county ("Primaria Ghimpati Giurgiu" in
 * Giurgiu), or null when it has none. The population join strips only
 * "judetul/judet/jud X"; the kind retries once without the bare form.
 */
function withoutCountySuffix(row: AuthorityKindRow): string | null {
  if (!row.county) return null;
  const name = populationFold(row.name), county = populationFold(row.county);
  return county && name.endsWith(` ${county}`) ? name.slice(0, -county.length - 1) : null;
}

/** The kind of a town hall from the locality registry, or null when the registry does not place it. */
export function townHallKind(row: AuthorityKindRow, registry: LocalityRegistry): "comuna" | "oras_municipiu" | null {
  // Owner decision F05: a București sector's own town hall (sectorTownHallUnit checks its code).
  if (sectorTownHallUnit(row)) return "oras_municipiu";
  if (row.siruta !== null && row.siruta > 0) {
    // A valid CUI, as the locality scope reads only those (readPopulationMappingRows).
    const unit = registry.get(row.siruta);
    // D2: without a county, a name that names the code's unit alone in the country (the locality scope's rule).
    const corroborated = row.cui && unit && (row.county ? unit.county && countyFold(row.county) === countyFold(unit.county) && localAdministrationName(row.name)
      : countylessLegacyCode(row));
    return corroborated ? unitKind(unit.tip) : null;
  }
  // No positive legacy code: the exact name + county match of the population join, one candidate;
  // once more without a trailing bare county name, which that join keeps.
  const bare = withoutCountySuffix(row);
  const population = populationForMapping({ ...row, siruta: null }) ?? (bare ? populationForMapping({ ...row, name: bare, siruta: null }) : undefined);
  return population?.level === "local" && population.siruta !== undefined ? unitKind(registry.get(population.siruta)?.tip) : null;
}

/**
 * D2: a county council of the strict list (the population join's county level, valid CUI), whatever the legal form of
 * its name: "UAT Judetul Alba", "U.A.T. Judetul Hunedoara", "Consiliul Judetul Prahova, Directia Servicii si Achizitii
 * Publice", which the name rules miss. Both identities of CJ Suceava: a kind is a filter, not a denominator.
 */
export function countyCouncilKind(row: AuthorityKindRow): "consiliu_judetean" | null {
  return populationForMapping({ ...row, siruta: null })?.level === "county" ? "consiliu_judetean" : null;
}

/** The kind of one institution: a town hall the registry places, a county council of the strict list, else its name. */
export function classifyAuthority(row: AuthorityKindRow, registry: LocalityRegistry): AuthorityKind | null {
  return townHallKind(row, registry) ?? countyCouncilKind(row) ?? nameKind(row.name);
}

export interface AuthorityKinds {
  /** The kind of each classified institution id. */
  byId: ReadonlyMap<string, AuthorityKind>;
  /** The ids of each kind, ascending. */
  ids: Readonly<Record<AuthorityKind, readonly string[]>>;
  /** The ids of each name list (NAME_LIST_KINDS), ascending. */
  lists: Readonly<Record<NameListKind, readonly string[]>>;
}

export function classifyAuthorities(rows: readonly AuthorityKindRow[], registry: LocalityRegistry): AuthorityKinds {
  const byId = new Map<string, AuthorityKind>();
  const ids = Object.fromEntries(AUTHORITY_KINDS.map((kind) => [kind, [] as string[]])) as Record<AuthorityKind, string[]>;
  const lists = Object.fromEntries(NAME_LIST_KINDS.map((kind) => [kind, [] as string[]])) as Record<NameListKind, string[]>;
  const listed = new Set<string>();
  for (const row of [...rows].sort((a, b) => Number(a.id) - Number(b.id))) {
    if (!listed.has(row.id)) {
      listed.add(row.id);
      for (const list of NAME_LIST_KINDS) if (onNameList(list, row.name)) lists[list].push(row.id);
    }
    const kind = classifyAuthority(row, registry);
    if (!kind || byId.has(row.id)) continue;
    byId.set(row.id, kind);
    ids[kind].push(row.id);
  }
  return { byId, ids, lists };
}

/** One database per process, so one cache, keyed by the marts build of the profiles (a rebuild truncates them). */
let cached: { marker: string; at: number; kinds: Promise<AuthorityKinds> } | null = null;
const CACHE_MS = 600_000;

/**
 * The institutions of every kind: the authorities of marts.entity_profile
 * (every buyer with records), classified once per build. An institution
 * without a profile has no records and no kind. Read inside the caller's
 * transaction; the table names stay in the SQL text so a test fixture's
 * scoped connection reads its own tables.
 */
export async function readAuthorityKinds(q: DbSql): Promise<AuthorityKinds> {
  const [probe] = await q`select coalesce((select c.oid::text || '.' || c.relfilenode::text from pg_class c where c.oid = to_regclass('marts.entity_profile')), '') marker,
    to_regclass('reference.authority_uat') is not null codes, to_regclass('reference.uat') is not null registry`;
  const marker = String(probe?.marker ?? "");
  if (cached && cached.marker === marker && Date.now() - cached.at < CACHE_MS) return cached.kinds;
  const kinds = (async () => {
    const codes = probe?.codes ? q`(select au.uat_siruta from reference.authority_uat au where au.entity_id = ep.entity_id)` : q`null::integer`;
    const rows = await q`select ep.entity_id::text id, ep.name_display name, ep.county,
        case when e.cui_valid then e.cui_canonical end cui, ${codes} siruta
      from marts.entity_profile ep left join core.entities e on e.id = ep.entity_id
      where ep.role = 'authority' and ep.entity_id <= 9007199254740991 and ep.name_display is not null`;
    const units = probe?.registry ? await q`select siruta, tip, county from reference.uat where tip is not null` : [];
    const registry: LocalityRegistry = new Map(units.map((u) => [Number(u.siruta), { tip: String(u.tip), county: u.county == null ? null : String(u.county) }]));
    return classifyAuthorities(rows.map((r) => ({ id: String(r.id), name: String(r.name), county: r.county == null ? null : String(r.county),
      cui: r.cui == null ? null : String(r.cui), siruta: r.siruta == null ? null : Number(r.siruta) })), registry);
  })();
  cached = { marker, at: Date.now(), kinds };
  // A failed read is not kept: the next question reads again.
  kinds.catch(() => { if (cached?.kinds === kinds) cached = null; });
  return kinds;
}

/** Tests that write profiles inside one build: the next read classifies again. */
export function forgetAuthorityKinds(): void { cached = null; }

/**
 * The ids of one kind (ascending), or null without a kind. „Primăriile și consiliile județene” (local_admin, F5, map
 * final §3.3) are the strict list of the per-inhabitant ranking (per-capita.ts), with no name pattern behind it.
 */
export async function authorityKindIds(q: DbSql, kind: ParsedAuthorityKind | null | undefined): Promise<readonly string[] | null> {
  if (kind === LOCAL_ADMIN_KIND) return (await readPerCapitaPopulations(q)).ids;
  if (kind === TOWN_HALL_KIND) return townHallIds(await readAuthorityKinds(q));
  if (kind === MINISTRY_KIND || kind === UNIVERSITY_KIND) return (await readAuthorityKinds(q)).lists[kind];
  return kind ? (await readAuthorityKinds(q)).ids[kind] : null;
}

/** Every town hall (TOWN_HALL_KIND): the communes' and the towns' lists together, ascending; one array per read of the kinds. */
const townHalls = new WeakMap<AuthorityKinds, readonly string[]>();
function townHallIds(kinds: AuthorityKinds): readonly string[] {
  let ids = townHalls.get(kinds);
  if (!ids) townHalls.set(kinds, ids = [...kinds.ids.comuna, ...kinds.ids.oras_municipiu].sort((a, b) => Number(a) - Number(b)));
  return ids;
}

/** The kind of one institution id, as every SQL condition of this module reads it. */
export async function authorityPeerKind(q: DbSql, entityId: string): Promise<AuthorityKind | null> {
  return (await readAuthorityKinds(q)).byId.get(String(entityId)) ?? null;
}

/** `column` (an institution id) is one of the institutions of a kind (`ids` from authorityKindIds). */
export function authorityKindCond(sql: DbSql, ids: readonly string[], column: ReturnType<DbSql>): ReturnType<DbSql> {
  return sql`${column} = any(${sql.array([...ids])}::bigint[])`;
}

/** The kind of `column` (an institution id) in SQL, or null: the same lists. */
export function authorityKindExpression(sql: DbSql, kinds: Pick<AuthorityKinds, "ids">, column: ReturnType<DbSql>): ReturnType<DbSql> {
  const cases = AUTHORITY_KINDS.map((kind) => sql`when ${authorityKindCond(sql, kinds.ids[kind], column)} then ${kind}`).reduce((a, b) => sql`${a} ${b}`);
  return sql`(case ${cases} else null end)`;
}
