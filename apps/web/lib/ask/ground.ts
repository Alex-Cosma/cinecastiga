import type { DbSql } from "@seap/db";
import type { AskFilters } from "./spec";
import { aliasQueries, queryTokens } from "./entity-alias";

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
}

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
  /** How many buying authorities map to this UAT (primărie, școli, spital…). */
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
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
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
        matchedNames: names.slice(0, 1).map((n) => `${n.name_ro ?? "?"} (${n.code})`),
        method: "code",
      };
    }
    return { term, prefixes: [], matchedNames: [], method: "none" };
  }

  // 1. Curated synonym table (exact term or term contained in the query).
  const syn = (await sql`
    select cpv_prefix, note from reference.cpv_synonym
    where ${folded} like '%' || term || '%' or term like '%' || ${folded} || '%'
    order by length(term) desc
    limit 4
  `) as unknown as { cpv_prefix: string; note: string | null }[];
  if (syn.length > 0) {
    const prefixes = [...new Set(syn.map((r) => cpvSubtreePrefix(r.cpv_prefix)))];
    // Catalog codes carry the check-digit suffix ("03413000-8"); synonyms store
    // bare prefixes — match by prefix, shortest catalog entry per prefix.
    const names = (await sql`
      select distinct on (p.pref) c.code, c.name_ro
      from unnest(${sql.array(prefixes)}::text[]) p(pref)
      join core.cpv_codes c on c.code like p.pref || '%'
      order by p.pref, length(c.code), c.code
    `) as unknown as { code: string; name_ro: string | null }[];
    return {
      term,
      prefixes,
      matchedNames: names.map((n) => `${n.name_ro ?? "?"} (${n.code})`),
      method: "synonym",
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
    where role = ${role} and entity_id = ${id}
    limit 1
  `) as unknown as { entity_id: string; name_display: string | null; county: string | null }[];
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
             max(r.birth_locality) bl,
             count(distinct r.cui) nf,
             max((lower(unaccent(r.person_name)) like ${"%" + folded + "%"})::int) has_sub,
             max(similarity(lower(unaccent(r.person_name)), ${folded})) sim
      from reference.company_reps r
      where r.birth_date is not null
        and (lower(unaccent(r.person_name)) like ${"%" + folded + "%"}
             or lower(unaccent(r.person_name)) % ${folded})
      group by r.person_key
      order by has_sub desc, sim desc, nf desc
      limit 4
    `) as unknown as { person_key: string; nm: string; by: number | null; bl: string | null; nf: string }[];
    const first = cands[0];
    if (first) {
      personKey = first.person_key;
      alternatives = cands
        .slice(1)
        .map((c) => `${c.nm}${c.by ? ` (n. ${c.by})` : ""}`);
    }
  }
  if (!personKey) return { query: q.name ?? "?", personKey: null, display: null, supplierIds: [], nFirms: 0, alternatives };
  const rows = (await sql`
    select max(r.person_name) nm, max(extract(year from r.birth_date))::int by,
           max(r.birth_locality) bl, count(distinct r.cui) nf,
           array_agg(distinct e.id) filter (where e.id is not null) ids
    from reference.company_reps r
    left join core.entities e on e.cui_canonical = r.cui
    where r.person_key = ${personKey}
  `) as unknown as { nm: string | null; by: number | null; bl: string | null; nf: string; ids: string[] | null }[];
  const r = rows[0];
  if (!r?.nm) return { query: q.name ?? personKey, personKey: null, display: null, supplierIds: [], nFirms: 0, alternatives };
  return {
    query: q.name ?? r.nm,
    personKey,
    display: `${r.nm}${r.by ? ` (n. ${r.by}${r.bl ? `, ${r.bl}` : ""})` : ""}`,
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
    select u.name, u.county,
           (select count(*) from reference.authority_uat au where au.uat_siruta = u.siruta) n
    from reference.uat u
    where u.siruta = ${siruta}
  `) as unknown as { name: string | null; county: string | null; n: string }[];
  const r = rows[0];
  return {
    siruta,
    name: r?.name ?? null,
    county: r?.county ?? null,
    nAuthorities: r ? Number(r.n) : 0,
  };
}

export async function ground(sql: DbSql, filters: AskFilters): Promise<Grounding> {
  const g: Grounding = {};
  // compareWith takes the same role as the focal entity (authority unless the
  // focal is a supplier).
  const compareRole: "authority" | "supplier" =
    !filters.authorityName && filters.supplierName ? "supplier" : "authority";
  const [cpv, authority, supplier, compare, county, uat, admin] = await Promise.all([
    filters.cpvTerm ? groundCpv(sql, filters.cpvTerm) : Promise.resolve(undefined),
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
    filters.compareWith
      ? groundEntity(sql, filters.compareWith, compareRole)
      : Promise.resolve(undefined),
    filters.county ? groundCounty(sql, filters.county) : Promise.resolve(undefined),
    filters.uatSiruta ? groundUat(sql, filters.uatSiruta) : Promise.resolve(undefined),
    filters.adminPersonKey || filters.adminName
      ? groundAdmin(sql, { key: filters.adminPersonKey, name: filters.adminName })
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
