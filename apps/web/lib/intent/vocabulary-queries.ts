import { onrcIdentityBirthDate, type DbSql } from "@seap/db";
import { aliasQueries, queryTokens } from "../ask/entity-alias";

/**
 * The vocabulary lookups behind /api/suggest (the builder's typeahead), shared
 * with the free-text interpreter so both understand the same words. Every
 * function expects an already folded query (lowercase, no diacritics). The
 * suggest route maps these rows to its unchanged response shape.
 */

/** Diacritic-fold + lowercase + trim. */
export function foldSuggest(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** "MUNICIPIUL  CLUJ-NAPOCA" → "Cluj-Napoca" (registry names are shouty). */
export function prettyUat(name: string): string {
  const stripped = name
    .replace(/^\s*(municipiul|oras|oraş|oraș)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return stripped.replace(/(^|[\s\-".(])(\p{L})/gu, (m, pre, ch: string) => pre + ch.toUpperCase());
}

export const TIP_LABEL: Record<string, string> = {
  "1": "municipiu",
  "2": "oraș",
  "3": "comună",
  "4": "municipiu",
  "9": "municipiu",
  sector: "sector",
};

// Bind text[] explicitly, including on the first request before the driver
// has discovered array types. Otherwise a string array can bind as text.
const textArray = (sql: DbSql, values: string[]) => sql.typed(values, 1009);

export interface CpvRow { term: string; cpv_name: string | null }
export interface UatRow { siruta: number; name: string; tip: string | null; county: string | null; pos: number }
export interface EntityRow { entity_id: string | null; name_display: string | null; county: string | null }
export interface PersonRow { person_key: string; nm: string; by: number | null; sy: number | null; bl: string | null; nf: string }

/** CPV catalogue labels and colloquial synonyms; a typed code searches by prefix. */
export function suggestCpv(sql: DbSql, q: string): Promise<CpvRow[]> {
  // A CPV code typed directly ("45", "45233", "45233120-6") → catalog by prefix.
  const codeM = /^(\d{2,8})(?:-\d)?$/.exec(q.replace(/\s+/g, ""));
  if (codeM)
    return sql`
      select c.code as term, c.name_ro as cpv_name
      from core.cpv_codes c
      where c.code like ${codeM[1] + "%"}
      order by length(c.code), c.code
      limit 5
    ` as unknown as Promise<CpvRow[]>;
  // Search the official Romanian labels as well as colloquial synonyms.
  // Separate words tolerate intervening words, word order and inflections
  // such as "spatii" inside "spatiilor". Punctuation is not a SQL wildcard.
  const cpvWords = q.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const cpvPhrase = cpvWords.join(" ");
  const cpvPatterns = cpvWords.map((word) => `%${word}%`);
  return sql`
    with catalog_matches as (
      select c.code as term, c.name_ro as cpv_name,
             case
               when lower(unaccent(c.name_ro)) = ${cpvPhrase} then 0
               when lower(unaccent(c.name_ro)) like ${cpvPhrase + "%"} then 1
               when lower(unaccent(c.name_ro)) like ${"%" + cpvPhrase + "%"} then 2
               else 3
             end as priority,
             length(c.name_ro) as label_length
      from core.cpv_codes c
      where ${cpvWords.length > 0}
        and lower(unaccent(c.name_ro)) like all(${textArray(sql, cpvPatterns)}::text[])
    ), synonym_matches as (
      select distinct on (s.term) s.term,
             (select c.name_ro from core.cpv_codes c
              where c.code like s.cpv_prefix || '%'
              order by length(c.code), c.code limit 1) cpv_name,
             case when lower(unaccent(s.term)) = ${cpvPhrase} then 0 else 4 end as priority,
             length(s.term) as label_length
      from reference.cpv_synonym s
      where ${cpvWords.length > 0}
        and lower(unaccent(s.term)) like all(${textArray(sql, cpvPatterns)}::text[])
      order by s.term, length(s.cpv_prefix) desc, s.cpv_prefix
    )
    select term, cpv_name from (
      select * from catalog_matches
      union all
      select * from synonym_matches
    ) matches
    order by priority, label_length, term
    limit 8
  ` as unknown as Promise<CpvRow[]>;
}

/** Localities (reference.uat) containing the query, optionally in one county. */
export function suggestUat(sql: DbSql, q: string, county: string): Promise<UatRow[]> {
  // The legacy reference.uat population is unsourced 2011-era data; the
  // displayed and ranking population is the official RPL 2021 catalog.
  return sql`
    select u.siruta, u.name, u.tip, u.county, position(${q} in lower(unaccent(u.name))) pos
    from reference.uat u
    where lower(unaccent(u.name)) like ${`%${q}%`}
      and (${county} = '' or u.county = ${county})
    order by pos, u.siruta
    limit 60
  ` as unknown as Promise<UatRow[]>;
}

/** Buying authorities: institutional aliases ("primaria X") + all-tokens fallback. */
export function suggestAuthorities(sql: DbSql, q: string): Promise<EntityRow[]> {
  const authPats = aliasQueries(q).map((a) => `%${a}%`);
  const toks = queryTokens(q).map((t) => `%${t}%`);
  const tokFrag =
    toks.length > 1
      ? sql`or lower(unaccent(ep.name_display)) like all(${textArray(sql, toks)}::text[])`
      : sql``;
  return sql`
    select entity_id, name_display, county from (
      select distinct on (lower(unaccent(ep.name_display)))
             ep.entity_id, ep.name_display, ep.county, ep.total_ron_full
      from marts.entity_profile ep
      where ep.role = 'authority'
        and (lower(unaccent(ep.name_display)) like any(${textArray(sql, authPats)}::text[]) ${tokFrag})
      order by lower(unaccent(ep.name_display)), ep.total_ron_full desc nulls last
    ) d
    order by d.total_ron_full desc nulls last
    limit 5
  ` as unknown as Promise<EntityRow[]>;
}

/** Suppliers whose name contains the query, or every word of it. */
export function suggestSuppliers(sql: DbSql, q: string): Promise<EntityRow[]> {
  const toks = queryTokens(q).map((t) => `%${t}%`);
  const tokFrag =
    toks.length > 1
      ? sql`or lower(unaccent(ep.name_display)) like all(${textArray(sql, toks)}::text[])`
      : sql``;
  return sql`
    select entity_id, name_display, county from (
      select distinct on (lower(unaccent(ep.name_display)))
             ep.entity_id, ep.name_display, ep.county, ep.total_ron_full
      from marts.entity_profile ep
      where ep.role = 'supplier'
        and (lower(unaccent(ep.name_display)) like ${`%${q}%`} ${tokFrag})
      order by lower(unaccent(ep.name_display)), ep.total_ron_full desc nulls last
    ) d
    order by d.total_ron_full desc nulls last
    limit 5
  ` as unknown as Promise<EntityRow[]>;
}

/**
 * ONRC administrators (solid identities only: name + a birth date that may
 * identify a person, so no placeholder or implausible one, audit F37). ilike
 * rides the trigram GIN index; needs 4+ chars to stay cheap on 3.7M rows.
 */
export function suggestPersons(sql: DbSql, q: string): Promise<PersonRow[]> {
  if (q.length < 4) return Promise.resolve([]);
  return sql`
    select r.person_key, max(r.person_name) nm,
           max(extract(year from r.birth_date))::int by,
           max(extract(year from r.snapshot_date))::int sy,
           max(r.birth_locality) bl, count(distinct r.cui) nf
    from reference.company_reps r
    where ${onrcIdentityBirthDate(sql, "r")} and r.person_name ilike ${`%${q}%`}
    group by r.person_key
    order by nf desc
    limit 4
  ` as unknown as Promise<PersonRow[]>;
}
