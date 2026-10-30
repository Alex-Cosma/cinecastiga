import type { DbSql } from "@seap/db";
import { fold } from "./predicates";

type Fragment = ReturnType<DbSql>;

/**
 * „Caută în surse”, names first (S5 PRE-trend; owner, 26 October 2026): the
 * drawer's search is today's condition, the folded text inside the folded
 * concat_ws(' ', code, institution, firm, CPV name, CPV code, county, record
 * number) of each record, read on every record of the selection (12 s on the
 * 4.9M records of a national trend's two years). Before it, each word of the
 * text is looked up where its field lives: the names of the institutions and
 * firms (entity_profile, the marts' own name of every id), the CPV catalogue,
 * the 42 counties, and the record codes for the words that can be one. A
 * record keeps only when every word is in one of its fields, read on the id,
 * code and county indexes; today's condition then checks those records alone.
 *
 * Exact, so the result is today's: the folded text inside the folded concat
 * puts each of its whitespace-free words inside it, and a word without a space
 * cannot cross the space between two fields, so it lies inside one of them.
 * Hence every record today's condition keeps is a candidate, and the
 * recheck keeps exactly those. A phrase over two fields („SRL CLUJ”: the firm,
 * then the county) is a candidate by its words and kept by the recheck, as
 * today. Relies on two properties of the marts (checked by the parity test):
 * an id's name in the marts is its entity_profile name, a code's name its
 * catalogue name. A word listing too many names (over SEARCH_LIST_CAP ids,
 * "srl") narrows nothing and is left to the recheck.
 */

/** Ids, codes or counties one word may list before it stops narrowing: more would cost more than the rows they find. */
export const SEARCH_LIST_CAP = 5000;

/** A search read on every row with at most this many records: its totals and page are read by their keys (runRows). */
export const SEARCH_FEW_RECORDS = 1000;

/** The words of a search as the drawer reads it: the folded text split at whitespace, each once. */
export function searchWords(search: string): string[] {
  return [...new Set(fold(search).split(/\s+/).filter(Boolean))];
}

/** A word that can lie inside a code of SEAP's form for a direct acquisition, "DA" and digits, folded: d, da…, a…, digits. */
export const inDaCode = (word: string): boolean => /^(?:d|da\d*|a\d*|\d+)$/.test(word);

export interface SearchLists { ids: string[]; codes: string[]; counties: string[] }

/** Each word's institutions and firms, CPV codes and counties, by today's folding (lower(unaccent(…))), in one statement. */
export async function searchLists(sql: DbSql, words: readonly string[]): Promise<SearchLists[]> {
  const rows = (await sql`
    with w as (select word, i from unnest(${sql.array([...words])}::text[]) with ordinality u(word, i)),
    names as materialized (select ep.entity_id, lower(unaccent(ep.name_display)) n from marts.entity_profile ep where ep.name_display is not null),
    codes as materialized (select c.code, lower(unaccent(concat_ws(' ', c.name_ro, c.code))) n from core.cpv_codes c),
    counties as materialized (select m.county, lower(unaccent(m.county)) n from marts.agg_map_county m where m.county is not null)
    select w.i,
      (select coalesce(array_agg(x.entity_id::text), '{}') from (select distinct entity_id from names where strpos(names.n, w.word) > 0 limit ${SEARCH_LIST_CAP + 1}) x) ids,
      (select coalesce(array_agg(x.code), '{}') from (select code from codes where strpos(codes.n, w.word) > 0 limit ${SEARCH_LIST_CAP + 1}) x) codes,
      (select coalesce(array_agg(counties.county), '{}') from counties where strpos(counties.n, w.word) > 0) counties
    from w order by w.i
  `) as unknown as { i: string; ids: string[]; codes: string[]; counties: string[] }[];
  return rows.map((r) => ({ ids: r.ids, codes: r.codes, counties: r.counties }));
}

/**
 * The candidates of a search on the drawer's rows `d` (the union of the two
 * marts, each branch with its constant src), or null when no word narrows:
 * the AND over the words of the fields each may be in. A word in a record
 * number or CPV code is read on the row (only digits, or digits and dashes,
 * can be); a contract number is free text, so every word is read on the
 * contracts' rows; a DA code only for a word of its form, while `daCodesPlain`
 * (every code of that form, agg_da_year_keys), else on every row. `range`, the
 * selection's period as a range on finalization_date (it holds every record of
 * the selection), bounds the id indexes (id, finalization_date) of the names
 * and the codes' (da_tx_cpv_cover_idx: code, finalization_date).
 * `indexed`: some word finds its direct acquisitions on indexes alone; else
 * every direct acquisition of the selection is read (a code, a number), and a
 * page should not walk the primary key looking for them (one record: 9.2 s).
 */
export function searchCandidates(sql: DbSql, words: readonly string[], lists: readonly SearchLists[],
  o: { daCodesPlain: boolean; range: Fragment | null }): { cond: Fragment; indexed: boolean } | null {
  const conds: Fragment[] = [];
  let indexed = false;
  words.forEach((word, i) => {
    // A word without its lists, or listing too many, narrows nothing: the recheck alone reads it.
    const list = lists[i];
    if (!list || list.ids.length > SEARCH_LIST_CAP || list.codes.length > SEARCH_LIST_CAP) return;
    const parts: Fragment[] = [];
    const within = o.range ? sql` and ${o.range}` : sql``;
    if (list.ids.length) {
      const ids = sql.array(list.ids);
      parts.push(sql`(d.authority_id = any(${ids}::bigint[])${within})`, sql`(d.supplier_id = any(${ids}::bigint[])${within})`);
    }
    if (list.codes.length) parts.push(sql`(d.cpv_code = any(${sql.array(list.codes)}::text[])${within})`);
    if (list.counties.length) parts.push(sql`d.county = any(${sql.array(list.counties)}::text[])`);
    // Read on each row: the direct acquisitions' then make the word a scan (`indexed` stays false for it).
    const before = parts.length;
    if (/^\d+$/.test(word)) parts.push(sql`strpos(d.ref_id::text, ${word}) > 0`);
    if (/^[0-9-]+$/.test(word)) parts.push(sql`strpos(lower(unaccent(d.cpv_code)), ${word}) > 0`);
    if (!o.daCodesPlain || inDaCode(word)) parts.push(sql`(d.src = 'da' and strpos(lower(unaccent(d.da_code)), ${word}) > 0)`);
    if (parts.length === before) indexed = true;
    parts.push(sql`(d.src = 'contracts' and strpos(lower(unaccent(d.da_code)), ${word}) > 0)`);
    conds.push(sql`(${parts.reduce((a, b) => sql`${a} or ${b}`)})`);
  });
  return conds.length ? { cond: conds.reduce((a, b) => sql`${a} and ${b}`), indexed } : null;
}
