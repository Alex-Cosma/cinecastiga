import { cuiCorroborated, onrcIdentityBirthDate, type DbSql } from "@seap/db";
import type { AskFilters } from "./spec";
import { aliasQueries, queryTokens } from "./entity-alias";
import { readLocalAuthorityIds, sectorUnit } from "../peer-population";
import { onrcBirthYear } from "../format";

/**
 * Grounding: turn the spec's free-text fields (cpvTerm, authorityName,
 * supplierName, county) into concrete database anchors (CPV prefixes, entity
 * ids, canonical county). Every grounding decision is surfaced back to the
 * user as a pill or caveat — the engine never silently reinterprets.
 */

export interface CpvGrounding {
  term: string;
  /** CPV code prefixes to match with `cpv_code like prefix || '%'`. */
  prefixes: string[];
  /** Human-readable CPV names matched, for the "am înțeles" pills. */
  matchedNames: string[];
  method: "code" | "synonym" | "fuzzy" | "none";
  /** Curated notes on the synonym rows used, shown to people with the subject and the answer. */
  notes?: string[];
  /**
   * Sub-trees left out of `prefixes` (synonym rows with exclude = true):
   * "medicamente" counts 336… but not 33696 (laboratory reagents).
   * Absent on groundings stored before exclusions existed.
   */
  excludePrefixes?: string[];
  /** Human-readable names of the excluded sub-trees, for "fără …". */
  excludedNames?: string[];
}

/** Every curated synonym note is meant for people ("include și semnalizarea rutieră…"). */
export const isPublicSynonymNote = (note: string | null | undefined): note is string => Boolean(note && note.trim());

export interface EntityGrounding {
  query: string;
  entityId: string | null;
  nameDisplay: string | null;
  county: string | null;
  /** Other plausible candidates, for the caveat "am ales X, nu Y". */
  alternatives: string[];
}

export interface UatGrounding {
  siruta: number;
  /** UAT name from the registry (uppercase old orthography) — display fallback. */
  name: string | null;
  county: string | null;
  /** Valid-CUI identities of the UAT's own local administration, strictly
   * associated (see localAuthorityIdsForUnit). Schools and other institutions
   * located in the UAT are not included. */
  authorityIds: string[];
  nAuthorities: number;
}

export interface AdminGrounding {
  query: string;
  personKey: string | null;
  /** "POPESCU ION (n. 1974, Cluj-Napoca)" — pill display. */
  display: string | null;
  /** Supplier entity ids of the person's firms present in our data. */
  supplierIds: string[];
  /** Total firms the person represents (incl. ones not in our data). */
  nFirms: number;
  alternatives: string[];
  /** The key exists in ONRC, but without a birth date that may identify a
   *  person (none, a placeholder or an implausible one; audit F32/F37). */
  unidentified?: boolean;
}

export interface Grounding {
  cpv?: CpvGrounding;
  authority?: EntityGrounding;
  supplier?: EntityGrounding;
  /** block=compare: the second entity, same role as the focal one. */
  compare?: EntityGrounding;
  county?: { query: string; canonical: string | null };
  uat?: UatGrounding;
  admin?: AdminGrounding;
}

/** Diacritic-fold + lowercase, same convention as lib/map.ts foldCounty. */
function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * CPV codes are hierarchical in the non-zero stem: 45233000 ("drumuri") is the
 * parent of 45233120, 45233140… Subtree match = strip trailing zeros before
 * prefix-matching, so the whole family is included.
 */
function cpvSubtreePrefix(code: string): string {
  const bare = code.split("-")[0]!;
  const stripped = bare.replace(/0+$/, "");
  return stripped.length >= 2 ? stripped : bare.slice(0, 2);
}

export interface SynonymRow { term: string; cpv_prefix: string; note: string | null; exclude?: boolean | null }

/**
 * Include and exclude prefixes of the synonym rows used for a subject. An
 * exclusion counts only inside one of the included sub-trees and never
 * removes what another picked term includes ("medicamente si reactivi");
 * notes come from the included rows.
 */
export function splitSynonymRows(rows: SynonymRow[]): { prefixes: string[]; excludePrefixes: string[]; notes: string[] } {
  const prefixes = [...new Set(rows.filter((r) => !r.exclude).map((r) => cpvSubtreePrefix(r.cpv_prefix)))];
  const excludePrefixes = [...new Set(rows.filter((r) => r.exclude).map((r) => cpvSubtreePrefix(r.cpv_prefix)))]
    // inside an included sub-tree, and not re-included by another term of the same text
    .filter((x) => prefixes.some((p) => x.startsWith(p) && x !== p) && !prefixes.some((p) => p.startsWith(x)))
    .sort();
  const notes = [...new Set(rows.filter((r) => !r.exclude).map((r) => r.note).filter(isPublicSynonymNote))];
  return { prefixes, excludePrefixes, notes };
}

/**
 * Synonyms for a query that is not itself a curated term. Words are matched
 * from a word start, so letters inside another word do not count ("gaz" is
 * not in "gazon", "apa" is not in "capacitate"):
 *   - terms the query contains ("reabilitare drumuri scoala" → "reabilitare
 *     drumuri" and "scoala"), without those already inside a longer picked
 *     term ("drumuri" inside "reabilitare drumuri");
 *   - otherwise the shortest terms that contain the query ("ilum" → "iluminat").
 * Every row of a picked term is kept: a term's meaning is never cut short.
 */
export function pickContainedSynonyms(folded: string, candidates: SynonymRow[]): SynonymRow[] {
  const q = folded.replace(/[^a-z0-9]+/g, " ").trim();
  const at = (hay: string, needle: string) => ` ${hay}`.includes(` ${needle}`);
  // a whole term, inflected or not ("drumurile", "iluminatul"), never a longer word ("gazon")
  const whole = (hay: string, t: string) => new RegExp(`(?:^| )${t.replace(/[^a-z0-9 ]/g, "")}(?:ul|ului|le|lor|l|a|ei|i|e)?(?= |$)`).test(hay);
  const terms = [...new Set(candidates.map((r) => r.term))];
  const inQuery = terms.filter((t) => whole(q, t)).sort((a, b) => b.length - a.length || a.localeCompare(b));
  const picked: string[] = [];
  for (const t of inQuery) if (!picked.some((p) => at(p, t))) picked.push(t);
  if (!picked.length) {
    const containing = terms.filter((t) => at(t, q));
    const shortest = Math.min(...containing.map((t) => t.length));
    picked.push(...containing.filter((t) => t.length === shortest));
  }
  return candidates
    .filter((r) => picked.includes(r.term))
    .sort((a, b) => a.term.localeCompare(b.term) || a.cpv_prefix.localeCompare(b.cpv_prefix));
}

async function groundCpv(sql: DbSql, term: string): Promise<CpvGrounding> {
  const folded = fold(term);

  // 0. A CPV code typed directly ("45233", "45233120", "03413000-8"):
  // subtree-match it against the catalog, no synonym/fuzzy needed.
  const codeM = /^(\d{2,8})(?:-\d)?$/.exec(folded.replace(/\s+/g, ""));
  if (codeM) {
    const pref = cpvSubtreePrefix(codeM[1]!);
    const names = (await sql`
      select code, name_ro from core.cpv_codes
      where code like ${pref + "%"}
      order by length(code), code
      limit 3
    `) as unknown as { code: string; name_ro: string | null }[];
    if (names.length > 0) {
      return {
        term,
        prefixes: [pref],
        matchedNames: names
          .slice(0, 1)
          .map((n) => `${n.name_ro ?? "?"} (${n.code})`),
        method: "code",
      };
    }
    return { term, prefixes: [], matchedNames: [], method: "none" };
  }

  // 1. Curated synonym table. Rows written for exactly this term are its
  // whole meaning ("iluminat" → lamps, street lighting, its installation and
  // maintenance), so no longer term crowds them out and no unrelated term
  // that merely contains the letters joins in ("apa" ⊂ "aparatura medicala").
  // Only a term without rows of its own falls back to containment
  // (pickContainedSynonyms), which also takes every row of the terms it picks.
  // `exclude` is read through to_jsonb so a database not yet at migration 0081 still answers.
  const exact = (await sql`
    select term, cpv_prefix, note, coalesce((to_jsonb(s) ->> 'exclude')::boolean, false) as exclude
    from reference.cpv_synonym s
    where term = ${folded}
    order by cpv_prefix
    limit 40
  `) as unknown as SynonymRow[];
  const syn = exact.some((r) => !r.exclude) ? exact : pickContainedSynonyms(folded, (await sql`
    select term, cpv_prefix, note, coalesce((to_jsonb(s) ->> 'exclude')::boolean, false) as exclude
    from reference.cpv_synonym s
    where ${folded} like '%' || term || '%' or term like '%' || ${folded} || '%'
  `) as unknown as SynonymRow[]);
  const { prefixes, excludePrefixes, notes } = splitSynonymRows(syn);
  if (prefixes.length > 0) {
    // Catalog codes carry the check-digit suffix ("03413000-8"); synonyms store
    // bare prefixes — match by prefix, shortest catalog entry per prefix.
    const names = (await sql`
      select distinct on (p.pref) c.code, c.name_ro
      from unnest(${sql.array(prefixes)}::text[]) p(pref)
      join core.cpv_codes c on c.code like p.pref || '%'
      order by p.pref, length(c.code), c.code
    `) as unknown as { code: string; name_ro: string | null }[];
    const excluded = excludePrefixes.length ? (await sql`
      select distinct on (p.pref) c.code, c.name_ro
      from unnest(${sql.array(excludePrefixes)}::text[]) p(pref)
      join core.cpv_codes c on c.code like p.pref || '%'
      order by p.pref, length(c.code), c.code
    `) as unknown as { code: string; name_ro: string | null }[] : [];
    return {
      term,
      prefixes,
      matchedNames: names.map((n) => `${n.name_ro ?? "?"} (${n.code})`),
      method: "synonym",
      notes,
      ...(excludePrefixes.length ? { excludePrefixes, excludedNames: excluded.map((n) => `${n.name_ro ?? "?"} (${n.code})`) } : {}),
    };
  }

  // 2. Trigram similarity over the CPV catalog names.
  const fuzzy = (await sql`
    select code, name_ro, similarity(lower(unaccent(name_ro)), ${folded}) as sim
    from core.cpv_codes
    where lower(unaccent(name_ro)) % ${folded}
    order by sim desc
    limit 5
  `) as unknown as { code: string; name_ro: string | null; sim: number }[];
  if (fuzzy.length > 0) {
    // Keep only matches close to the best one — a lone strong hit shouldn't
    // drag in weakly-similar codes.
    const best = fuzzy[0]!.sim;
    const kept = fuzzy.filter((f) => f.sim >= Math.max(0.35, best - 0.12));
    return {
      term,
      // subtree match: strip check digit + trailing zeros (CPV hierarchy stem)
      prefixes: [...new Set(kept.map((f) => cpvSubtreePrefix(f.code)))],
      matchedNames: kept.map((f) => `${f.name_ro ?? "?"} (${f.code})`),
      method: "fuzzy",
    };
  }

  return { term, prefixes: [], matchedNames: [], method: "none" };
}

async function groundEntity(
  sql: DbSql,
  query: string,
  role: "authority" | "supplier",
): Promise<EntityGrounding> {
  const folded = fold(query);
  // "primăria Buzău" must find "MUNICIPIUL BUZAU": try every institutional
  // alias shape, plus all-tokens-anywhere (word order / parenthetical names).
  const pats = aliasQueries(folded).map((a) => `%${a}%`);
  const toks = queryTokens(folded);
  const tokFrag =
    toks.length > 1
      ? sql`or lower(unaccent(name_display)) like all(${sql.array(toks.map((t) => `%${t}%`))}::text[])`
      : sql``;
  const rows = (await sql`
    select entity_id, name_display, county, total_ron_full
    from marts.entity_profile
    where role = ${role}
      and (lower(unaccent(name_display)) like any(${sql.array(pats)}::text[]) ${tokFrag})
    order by
      (lower(unaccent(name_display)) = ${folded}) desc,
      (lower(unaccent(name_display)) like ${"%" + folded + "%"}) desc,
      total_ron_full desc nulls last
    limit 4
  `) as unknown as {
    entity_id: string;
    name_display: string | null;
    county: string | null;
    total_ron_full: string | null;
  }[];
  if (rows.length === 0) {
    // Fall back to trigram for typos / word-order differences.
    const fz = (await sql`
      select entity_id, name_display, county, total_ron_full
      from marts.entity_profile
      where role = ${role} and lower(unaccent(name_display)) % ${folded}
      order by similarity(lower(unaccent(name_display)), ${folded}) desc
      limit 4
    `) as unknown as typeof rows;
    rows.push(...fz);
  }
  const first = rows[0];
  return {
    query,
    entityId: first ? String(first.entity_id) : null,
    nameDisplay: first?.name_display ?? null,
    county: first?.county ?? null,
    alternatives: rows.slice(1).map((r) => r.name_display ?? "?"),
  };
}

/** Deep links carry exact entity ids — no name ambiguity, no lottery. */
async function groundEntityById(
  sql: DbSql,
  id: number,
  role: "authority" | "supplier",
): Promise<EntityGrounding> {
  const rows = (await sql`
    select entity_id, name_display, county from marts.entity_profile
    where role = ${role} and entity_id = core.canonical_entity_id(${id}::bigint)
    limit 1
  `) as unknown as {
    entity_id: string;
    name_display: string | null;
    county: string | null;
  }[];
  const first = rows[0];
  return {
    query: String(id),
    entityId: first ? String(first.entity_id) : null,
    nameDisplay: first?.name_display ?? null,
    county: first?.county ?? null,
    alternatives: [],
  };
}

/**
 * "Firme conduse de X" → the person's firms → our supplier entity ids.
 * By exact person key (builder pick) or by name (LLM path: best match =
 * the person with most represented firms among name matches).
 */
async function groundAdmin(
  sql: DbSql,
  q: { key?: string | undefined; name?: string | undefined },
): Promise<AdminGrounding> {
  let personKey: string | null = q.key ?? null;
  let display: string | null = null;
  let alternatives: string[] = [];
  if (!personKey && q.name) {
    const folded = fold(q.name);
    // name closeness FIRST, firm count only as tiebreak — "becali virgil" must
    // not resolve to a better-connected BAICU VIRGIL
    const cands = (await sql`
      select r.person_key,
             max(r.person_name) nm,
             max(extract(year from r.birth_date))::int by,
             max(extract(year from r.snapshot_date))::int sy,
             max(r.birth_locality) bl,
             count(distinct r.cui) nf,
             max((lower(unaccent(r.person_name)) like ${"%" + folded + "%"})::int) has_sub,
             max(similarity(lower(unaccent(r.person_name)), ${folded})) sim
      from reference.company_reps r
      where ${onrcIdentityBirthDate(sql, "r")}
        and (lower(unaccent(r.person_name)) like ${"%" + folded + "%"}
             or lower(unaccent(r.person_name)) % ${folded})
      group by r.person_key
      order by has_sub desc, sim desc, nf desc
      limit 4
    `) as unknown as {
      person_key: string;
      nm: string;
      by: number | null;
      sy: number | null;
      bl: string | null;
      nf: string;
    }[];
    const first = cands[0];
    if (first) {
      personKey = first.person_key;
      alternatives = cands
        .slice(1)
        .map((c) => {
          // implausible ONRC dates (before 1910, future, under 16) are not shown as a year
          const { birthYear } = onrcBirthYear(c.by, c.sy);
          return `${c.nm}${birthYear ? ` (n. ${birthYear})` : ""}`;
        });
    }
  }
  if (!personKey)
    return {
      query: q.name ?? "?",
      personKey: null,
      display: null,
      supplierIds: [],
      nFirms: 0,
      alternatives,
    };
  const rows = (await sql`
    select max(r.person_name) nm, max(extract(year from r.birth_date))::int by,
           max(extract(year from r.snapshot_date))::int sy,
           max(r.birth_locality) bl, count(distinct r.cui) nf,
           -- only entities that actually appear as suppliers: bare core.entities
           -- rows can be ghosts with zero transactions, which would inflate the
           -- "N firme cu bani publici" caveat
           array_agg(distinct e.id) filter (where ep.entity_id is not null) ids
    from reference.company_reps r
    -- corroborated CUI only: a foreign number that passes the CUI checksum is
    -- not this person's firm (audit F03)
    left join core.entities e on e.cui_canonical = r.cui and ${cuiCorroborated(sql, "e")}
    left join marts.entity_profile ep on ep.entity_id = e.id and ep.role = 'supplier'
    -- a key without a birth date that may identify a person (none, placeholder
    -- or implausible: audit F32/F37) merges namesakes, so it groups no firms
    where r.person_key = ${personKey} and ${onrcIdentityBirthDate(sql, "r")}
  `) as unknown as {
    nm: string | null;
    by: number | null;
    sy: number | null;
    bl: string | null;
    nf: string;
    ids: string[] | null;
  }[];
  const r = rows[0];
  if (!r?.nm) {
    const [known] = await sql`
      select 1 from reference.company_reps where person_key = ${personKey} limit 1
    `;
    return {
      query: q.name ?? personKey,
      personKey: null,
      display: null,
      supplierIds: [],
      nFirms: 0,
      alternatives,
      ...(known ? { unidentified: true } : {}),
    };
  }
  // ONRC birth localities can be punctuation-only junk (".") — drop those
  const loc = r.bl && /\p{L}/u.test(r.bl) ? r.bl : null;
  const { birthYear } = onrcBirthYear(r.by, r.sy);
  return {
    query: q.name ?? r.nm,
    personKey,
    display: `${r.nm}${birthYear ? ` (n. ${birthYear}${loc ? `, ${loc}` : ""})` : ""}`,
    supplierIds: (r.ids ?? []).map(String).slice(0, 1000),
    nFirms: Number(r.nf ?? 0),
    alternatives,
  };
}

async function groundCounty(
  sql: DbSql,
  query: string,
): Promise<{ query: string; canonical: string | null }> {
  const folded = fold(query.replace(/^jude[țt]ul\s+/i, ""));
  const rows = (await sql`
    select county from marts.spend_by_county
    where lower(unaccent(county)) = ${folded}
    limit 1
  `) as unknown as { county: string }[];
  return { query, canonical: rows[0]?.county ?? null };
}

async function groundUat(sql: DbSql, siruta: number): Promise<UatGrounding> {
  const rows = (await sql`
    select u.name, u.county from reference.uat u where u.siruta = ${siruta}
  `) as unknown as { name: string | null; county: string | null }[];
  // reference.uat has no București sectors; their code and name come from the RPL 2021 catalog (owner decision F05).
  const sector = sectorUnit(siruta);
  const r = rows[0] ?? (sector ? { name: sector.name, county: "bucuresti" } : undefined);
  // Audit F15: never the raw legacy code, which links communes of other counties.
  const authorityIds = r ? await readLocalAuthorityIds(sql, siruta) : [];
  return {
    siruta,
    name: r?.name ?? null,
    county: r?.county ?? null,
    authorityIds,
    nAuthorities: authorityIds.length,
  };
}

export async function ground(
  sql: DbSql,
  filters: AskFilters,
): Promise<Grounding> {
  const g: Grounding = {};
  // compareWith takes the same role as the focal entity (authority unless the
  // focal is a supplier).
  const compareRole: "authority" | "supplier" =
    !(filters.authorityName || filters.authorityId) &&
    (filters.supplierName || filters.supplierId)
      ? "supplier"
      : "authority";
  const [cpv, authority, supplier, compare, county, uat, admin] =
    await Promise.all([
      filters.cpvTerm
        ? groundCpv(sql, filters.cpvTerm)
        : Promise.resolve(undefined),
      filters.authorityId
        ? groundEntityById(sql, filters.authorityId, "authority")
        : filters.authorityName
          ? groundEntity(sql, filters.authorityName, "authority")
          : Promise.resolve(undefined),
      filters.supplierId
        ? groundEntityById(sql, filters.supplierId, "supplier")
        : filters.supplierName
          ? groundEntity(sql, filters.supplierName, "supplier")
          : Promise.resolve(undefined),
      filters.compareWithId
        ? groundEntityById(sql, filters.compareWithId, compareRole)
        : filters.compareWith
          ? groundEntity(sql, filters.compareWith, compareRole)
          : Promise.resolve(undefined),
      filters.county
        ? groundCounty(sql, filters.county)
        : Promise.resolve(undefined),
      filters.uatSiruta
        ? groundUat(sql, filters.uatSiruta)
        : Promise.resolve(undefined),
      filters.adminPersonKey || filters.adminName
        ? groundAdmin(sql, {
            key: filters.adminPersonKey,
            name: filters.adminName,
          })
        : Promise.resolve(undefined),
    ]);
  if (cpv) g.cpv = cpv;
  if (authority) g.authority = authority;
  if (supplier) g.supplier = supplier;
  if (compare) g.compare = compare;
  if (county) g.county = county;
  if (uat) g.uat = uat;
  if (admin) g.admin = admin;
  return g;
}
