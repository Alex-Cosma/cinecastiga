import type { DbSql } from "@seap/db";
import { countyFold, localAdministrationName, populationForMapping, sectorTownHallUnit, type PopulationMappingRow } from "../peer-population";
import { AUTHORITY_KINDS, type AuthorityKind } from "./spec";

/*
 * The kind of a buying institution (plan §2.5, D1): one classification for
 * the answers, their sources, the risk profiles and the peer groups, so
 * "spitalele" are the same institutions on a ranking and in a comparison.
 *
 * - Town halls (comuna, oras_municipiu) come from the locality registry:
 *   reference.authority_uat → reference.uat.tip (3 = comună; 1, 2, 4, 9 =
 *   municipiu, oraș, București), with the rule of the locality scope (F15,
 *   localAuthorityIdsForUnit): a legacy code counts only in the institution's
 *   own county and for a name with a local-administration legal form. Without
 *   a code, the strict name + county match of the population join (one
 *   candidate); the six București sector town halls (owner decision F05) are
 *   town halls. A legacy code that does not corroborate is not used.
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
export const KIND_LABEL: Record<AuthorityKind, string> = {
  comuna: "comune",
  oras_municipiu: "orașe/municipii",
  consiliu_judetean: "consilii județene / județe",
  spital: "spitale",
  scoala: "școli/licee/grădinițe",
};

/** Where each kind comes from, for the "avansat" SQL text. */
export const KIND_SOURCE: Record<AuthorityKind, string> = {
  comuna: "registrul localităților, apoi numele",
  oras_municipiu: "registrul localităților, apoi numele",
  consiliu_judetean: "după nume",
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

/** reference.uat: the type and county of each SIRUTA code. */
export type LocalityRegistry = ReadonlyMap<number, { tip: string; county: string | null }>;
/** What the classification reads of an institution: marts.entity_profile, core.entities (a valid CUI) and its legacy code. */
export type AuthorityKindRow = PopulationMappingRow;

const unitKind = (tip: string | undefined): "comuna" | "oras_municipiu" | null =>
  tip === "3" ? "comuna" : tip === "1" || tip === "2" || tip === "4" || tip === "9" ? "oras_municipiu" : null;

/** The kind of a town hall from the locality registry, or null when the registry does not place it. */
export function townHallKind(row: AuthorityKindRow, registry: LocalityRegistry): "comuna" | "oras_municipiu" | null {
  // Owner decision F05: a București sector's own town hall (sectorTownHallUnit checks its code).
  if (sectorTownHallUnit(row)) return "oras_municipiu";
  if (row.siruta !== null && row.siruta > 0) {
    const unit = registry.get(row.siruta);
    const corroborated = unit && row.county && unit.county && countyFold(row.county) === countyFold(unit.county) && localAdministrationName(row.name);
    return corroborated ? unitKind(unit.tip) : null;
  }
  // No positive legacy code: the exact name + county match of the population join, one candidate.
  const population = populationForMapping({ ...row, siruta: null });
  return population?.level === "local" && population.siruta !== undefined ? unitKind(registry.get(population.siruta)?.tip) : null;
}

/** The kind of one institution: a town hall the registry places, else its name. */
export function classifyAuthority(row: AuthorityKindRow, registry: LocalityRegistry): AuthorityKind | null {
  return townHallKind(row, registry) ?? nameKind(row.name);
}

export interface AuthorityKinds {
  /** The kind of each classified institution id. */
  byId: ReadonlyMap<string, AuthorityKind>;
  /** The ids of each kind, ascending. */
  ids: Readonly<Record<AuthorityKind, readonly string[]>>;
}

export function classifyAuthorities(rows: readonly AuthorityKindRow[], registry: LocalityRegistry): AuthorityKinds {
  const byId = new Map<string, AuthorityKind>();
  const ids = Object.fromEntries(AUTHORITY_KINDS.map((kind) => [kind, [] as string[]])) as Record<AuthorityKind, string[]>;
  for (const row of [...rows].sort((a, b) => Number(a.id) - Number(b.id))) {
    const kind = classifyAuthority(row, registry);
    if (!kind || byId.has(row.id)) continue;
    byId.set(row.id, kind);
    ids[kind].push(row.id);
  }
  return { byId, ids };
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

/** The ids of one kind (ascending), or null without a kind. */
export async function authorityKindIds(q: DbSql, kind: AuthorityKind | null | undefined): Promise<readonly string[] | null> {
  return kind ? (await readAuthorityKinds(q)).ids[kind] : null;
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
export function authorityKindExpression(sql: DbSql, kinds: AuthorityKinds, column: ReturnType<DbSql>): ReturnType<DbSql> {
  const cases = AUTHORITY_KINDS.map((kind) => sql`when ${authorityKindCond(sql, kinds.ids[kind], column)} then ${kind}`).reduce((a, b) => sql`${a} ${b}`);
  return sql`(case ${cases} else null end)`;
}
