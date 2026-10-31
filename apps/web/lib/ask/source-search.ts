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

/**
 * The stored text (S6; owner, 30 October 2026): a search no name narrows (a
 * number fragment, a record code, only common words) read today's condition
 * on every record of the list (5 s for „33600000” on a national trend's two
 * years; „s.r.l. bucuresti” past the budget). marts.source_search holds that
 * folded text once per record, with a trigram index (packages/db
 * source-search-text.ts, built after the site reopens each night): the
 * search is `t like '%text%'`, today's strpos on the same bytes, so the
 * records found are today's. A search the names narrow keeps them (faster:
 * their id and code indexes are bounded by the period). Until the night's
 * build is in, or whenever its state does not name the marts read, the
 * names-first path above is the one.
 */
let storedPresent: { ok: boolean; at: number } | null = null;
/** The state table exists (a build with this code ran once); cached ten minutes, as the other probes. */
export async function sourceSearchPresent(sql: DbSql): Promise<boolean> {
  if (storedPresent && Date.now() - storedPresent.at < 600_000) return storedPresent.ok;
  const [row] = (await sql`select to_regclass('marts.source_search_state') is not null ok`) as unknown as { ok: boolean }[];
  storedPresent = { ok: Boolean(row?.ok), at: Date.now() };
  return storedPresent.ok;
}
/** Tests: probe again. */
export function forgetSourceSearch(): void { storedPresent = null; }

/**
 * In the caller's snapshot, the stored text is that of the marts read: its
 * state names this source_search (a reader older than a swap sees the old
 * state and is refused) and the file nodes of both marts (each night's load
 * truncates them, so a build of an earlier night is refused). Per request,
 * never cached.
 */
export async function sourceSearchFresh(sql: DbSql): Promise<boolean> {
  const [row] = (await sql`
    select exists (
      select 1 from marts.source_search_state st
      where st.search_rel = to_regclass('marts.source_search')
        and st.da_node = pg_relation_filenode('marts.da_transactions')
        and st.ctx_node = pg_relation_filenode('marts.contract_transactions')
    ) ok
  `) as unknown as { ok: boolean }[];
  return Boolean(row?.ok);
}

/** A folded text the trigram index narrows: three letters or digits in a row hold a trigram of every match (else it reads the whole index). */
export const storedSearchable = (folded: string): boolean => /[a-z0-9]{3}/.test(folded);

/** `like` of the folded text anywhere, as strpos reads it: \, % and _ written literally. */
export const likeAnywhere = (folded: string): string => `%${folded.replace(/[\\%_]/g, "\\$&")}%`;

/** The years of a selection on the stored rows (y, the BRIN): a range holding every record of it, or none. */
export type SearchYears = readonly [number, number] | null;

const storedRows = (sql: DbSql, folded: string, years: SearchYears): Fragment => sql`
  marts.source_search s where s.t like ${likeAnywhere(folded)}${years ? sql` and s.y between ${years[0]} and ${years[1]}` : sql``}`;

/** The first `limit` stored records the text is in (src, key), for a search that finds few. */
export async function storedSearchKeys(sql: DbSql, folded: string, years: SearchYears, limit: number): Promise<{ src: "da" | "contracts"; ref: string }[]> {
  return (await sql`select s.src, s.ref_id::text ref from ${storedRows(sql, folded, years)} limit ${limit}`) as unknown as { src: "da" | "contracts"; ref: string }[];
}

/**
 * The drawer's rows `d` (the union, or one mart with its constant src) whose
 * stored text holds the folded search: a semi-join on the row's key (a
 * contract's winner too, 0 on a direct acquisition), at the top of the
 * statement's conditions so the planner joins it.
 */
export function storedSearchCond(sql: DbSql, folded: string, years: SearchYears): Fragment {
  return sql`(d.src, d.ref_id, case when d.src = 'da' then 0::bigint else d.supplier_id end) in (
    select s.src, s.ref_id, s.sid from ${storedRows(sql, folded, years)})`;
}

/**
 * The stored keys of a search that finds at most this many records in the selection's years: read once, then the
 * totals and the page read only them, by key (each read joining the stored rows again: ~0.5 s for 60,000 records,
 * 2.5 s for a phrase of common words). More, and each read joins them, within the search's budget.
 */
export const STORED_SEARCH_KEYS = 200_000;

/**
 * The drawer's rows `d` among stored keys: a direct acquisition by its key alone; a contract's key holds each of its
 * winners, so today's condition (`recheck`) checks its few rows.
 */
export function storedKeyCond(sql: DbSql, keys: readonly { src: "da" | "contracts"; ref: string }[], recheck: Fragment): Fragment {
  const of = (src: "da" | "contracts") => sql.array([...new Set(keys.filter((k) => k.src === src).map((k) => k.ref))]);
  return sql`((d.src = 'da' and d.ref_id = any(${of("da")}::bigint[])) or (d.src = 'contracts' and d.ref_id = any(${of("contracts")}::bigint[]) and ${recheck}))`;
}

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
 * `every`: each word narrows (none lists too many names); else the candidates
 * are those of the rarer words alone, rechecked against the whole text.
 */
export function searchCandidates(sql: DbSql, words: readonly string[], lists: readonly SearchLists[],
  o: { daCodesPlain: boolean; range: Fragment | null }): { cond: Fragment; indexed: boolean; every: boolean } | null {
  const conds: Fragment[] = [];
  let indexed = false, every = true;
  words.forEach((word, i) => {
    // A word without its lists, or listing too many, narrows nothing: the recheck alone reads it.
    const list = lists[i];
    if (!list || list.ids.length > SEARCH_LIST_CAP || list.codes.length > SEARCH_LIST_CAP) { every = false; return; }
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
  return conds.length ? { cond: conds.reduce((a, b) => sql`${a} and ${b}`), indexed, every } : null;
}
