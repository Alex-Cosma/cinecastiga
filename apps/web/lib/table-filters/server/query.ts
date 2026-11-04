import type { DbSql } from "@seap/db";
import { isActive } from "../codec";
import type { Facet, FilterState, FilterValue, OptionCount, TableColumns } from "../types";

export type Fragment = ReturnType<DbSql>;

/*
 * The SQL side of the column filters. A table is read through one or more channels (a table of direct acquisitions
 * and one of contracts, say): each channel says where its rows are and how each column reads in them (a Binding).
 * From that alone this module builds the rows' condition for any filters and counts any column's options under the
 * other filters (the spreadsheet rule). A new table declares its channels; nothing here changes.
 */

/** How one column reads in one channel's rows. */
export type Binding =
  /** A date as 'YYYY-MM-DD' text (null when the record has none). */
  | { kind: "dates"; date: Fragment }
  /** A number. */
  | { kind: "range"; value: Fragment }
  /**
   * The option(s) of a row as text. `value` may return several rows (unnest of an array) when `match` says how a
   * chosen set keeps a row. A value is named by `names` (a lookup run only for the options shown: a partner's id is
   * counted from an index, its name read for 50 ids, not for half a million rows), else by `label` on the row, else
   * by the source's `labelOf` or the column's fixed labels. Options come by their rows, or by the sum of `weight`
   * when set (a supplier's value, where each supplier is one row).
   */
  | { kind: "list"; value: Fragment; label?: Fragment; names?: Names; weight?: Fragment; match?: (values: string[]) => Fragment }
  /** The channel itself is the option (the record's type): it is kept or dropped whole. */
  | { kind: "constant"; value: string };

/** How the values of a pick column are named and searched, outside the rows. */
export interface Names {
  /** Rows (v text, l text) naming the given values. */
  lookup: (values: string[]) => Fragment;
  /** A condition on a channel's row: its value's name or code matches the search. */
  search: (term: string) => Fragment;
}

export interface Channel {
  /** A short name, for tests and logs. */
  name: string;
  /** `marts.da_transactions t`: what follows `from`. */
  from: Fragment;
  /** The channel's rows before any filter. */
  where: Fragment;
  bindings: Readonly<Record<string, Binding>>;
  /**
   * The channel is read only when this column's filter chooses it by its constant (the excluded records appear only
   * when asked for); the column's own funnel always counts it.
   */
  optIn?: string;
}

export interface FilterSource {
  columns: TableColumns;
  channels: readonly Channel[];
  /** A value's label when the binding has none (a signal's name for its code). */
  labelOf?: (key: string, value: string) => string | undefined;
}

const fold = (text: string): string => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const escapeLike = (text: string): string => text.replace(/[\\%_]/g, (c) => `\\${c}`);
const likeAny = (term: string): string => `%${escapeLike(fold(term))}%`;

/** A search term as core.entities.name_normalized holds names: lower case, no diacritics, words only. */
export const normalizedPattern = (term: string): string =>
  `%${escapeLike(fold(term).replace(/[^\p{L}\p{N}]+/gu, " ").trim())}%`;

/** The condition one active filter puts on a channel's rows; `null` when the channel cannot hold a matching row. */
function condition(sql: DbSql, binding: Binding | undefined, value: FilterValue): Fragment | null | true {
  if (!binding) return null;
  if (binding.kind === "constant") return value.kind !== "dates" && value.kind !== "range" && value.values.includes(binding.value) ? true : null;
  if (binding.kind === "dates" && value.kind === "dates") {
    if (value.years.length > 0) return sql`left(${binding.date}, 4) = any(${sql.array(value.years)}::text[])`;
    const from = value.from ? sql` and left(${binding.date}, 7) >= ${value.from}` : sql``;
    const to = value.to ? sql` and left(${binding.date}, 7) <= ${value.to}` : sql``;
    return sql`${binding.date} is not null${from}${to}`;
  }
  if (binding.kind === "range" && value.kind === "range") {
    const lo = value.min !== null ? sql` and ${binding.value} >= ${value.min}::numeric` : sql``;
    const hi = value.max !== null ? sql` and ${binding.value} <= ${value.max}::numeric` : sql``;
    return sql`${binding.value} is not null${lo}${hi}`;
  }
  if (binding.kind === "list" && (value.kind === "options" || value.kind === "pick")) {
    return binding.match ? binding.match(value.values) : sql`${binding.value} = any(${sql.array(value.values)}::text[])`;
  }
  return null;
}

/**
 * A channel's full condition under the filters, leaving out the column `except` (whose funnel is being counted); `null`
 * when the channel holds no matching row and is left out of the query.
 */
export function channelWhere(sql: DbSql, channel: Channel, state: FilterState, except?: string): Fragment | null {
  if (channel.optIn && channel.optIn !== except) {
    const chosen = state[channel.optIn];
    const own = channel.bindings[channel.optIn];
    if (!isActive(chosen) || condition(sql, own, chosen) !== true) return null;
  }
  let where = channel.where;
  for (const [key, value] of Object.entries(state)) {
    if (key === except || !isActive(value)) continue;
    const cond = condition(sql, channel.bindings[key], value);
    if (cond === null) return null;
    if (cond !== true) where = sql`${where} and ${cond}`;
  }
  return where;
}

/**
 * The rows of every channel the filters keep, each projected by `project` (the channels must project the same
 * columns), joined with `union all`; `null` when no channel is left.
 */
export function unionOf(
  sql: DbSql, channels: readonly Channel[], state: FilterState, project: (channel: Channel) => Fragment, except?: string,
  extra?: (channel: Channel) => Fragment | null,
): Fragment | null {
  let body: Fragment | null = null;
  for (const channel of channels) {
    const where = channelWhere(sql, channel, state, except);
    if (where === null) continue;
    const more = extra?.(channel);
    const part: Fragment = sql`select ${project(channel)} from ${channel.from} where ${where}${more ? sql` and ${more}` : sql``}`;
    body = body === null ? part : sql`${body} union all ${part}`;
  }
  return body;
}

export interface FacetRequest {
  /** Search in the options (names, codes); options and pick columns only. */
  term?: string;
  /** At most this many options, the chosen ones first (default 50). */
  limit?: number;
}

const RANGE_BINS = 8;

/** A column's options under every other filter: what its funnel shows. */
export async function facetOf(sql: DbSql, source: FilterSource, key: string, state: FilterState, request: FacetRequest = {}): Promise<Facet> {
  const column = source.columns.find((c) => c.key === key);
  if (!column) throw new Error(`unknown filter column: ${key}`);
  const bound = source.channels.filter((c) => c.bindings[key]);

  if (column.kind === "dates") {
    const body = unionOf(sql, bound, state, (c) => sql`${(c.bindings[key] as Extract<Binding, { kind: "dates" }>).date} d`, key);
    if (!body) return { kind: "dates", months: [], undated: 0 };
    const rows = (await sql`select left(d, 7) m, count(*)::int n from (${body}) x group by 1 order by 1`) as unknown as { m: string | null; n: number }[];
    return {
      kind: "dates",
      months: rows.filter((r) => r.m && /^\d{4}-\d{2}$/.test(r.m)).map((r) => ({ month: r.m!, n: Number(r.n) })),
      undated: rows.filter((r) => !r.m || !/^\d{4}-\d{2}$/.test(r.m)).reduce((n, r) => n + Number(r.n), 0),
    };
  }

  if (column.kind === "range") {
    const body = unionOf(sql, bound, state, (c) => sql`(${(c.bindings[key] as Extract<Binding, { kind: "range" }>).value})::float8 v`, key);
    if (!body) return { kind: "range", min: null, max: null, bins: [] };
    // Bins of equal width on a logarithmic scale: values run from a few lei to millions.
    const rows = (await sql`
      with x as (select v from (${body}) u where v is not null),
           s as (select min(v) lo, max(v) hi from x),
           l as (select lo, hi, log(greatest(lo, 1)) llo, log(greatest(hi, 1)) lhi from s)
      select l.lo, l.hi, b.bin, b.n from l left join lateral (
        select case when l.lhi <= l.llo then 1
                    else least(${RANGE_BINS}::int, floor((log(greatest(x.v, 1)) - l.llo) / (l.lhi - l.llo) * ${RANGE_BINS}::int)::int + 1) end bin,
               count(*)::int n
        from x group by 1
      ) b on true
      order by b.bin
    `) as unknown as { lo: number | null; hi: number | null; bin: number | null; n: number | null }[];
    const lo = rows[0]?.lo ?? null;
    const hi = rows[0]?.hi ?? null;
    if (lo === null || hi === null) return { kind: "range", min: null, max: null, bins: [] };
    const llo = Math.log10(Math.max(lo, 1));
    const step = (Math.log10(Math.max(hi, 1)) - llo) / RANGE_BINS;
    const counts = new Map(rows.filter((r) => r.bin !== null).map((r) => [Number(r.bin), Number(r.n)]));
    const bins = step <= 0
      ? [{ from: lo, to: hi, n: counts.get(1) ?? 0 }]
      : Array.from({ length: RANGE_BINS }, (_, i) => ({ from: 10 ** (llo + i * step), to: 10 ** (llo + (i + 1) * step), n: counts.get(i + 1) ?? 0 }));
    return { kind: "range", min: Number(lo), max: Number(hi), bins };
  }

  return listFacet(sql, source, key, state, bound, request);
}

/** An options or pick column's facet: its values counted, the chosen ones first, then by rows. */
async function listFacet(
  sql: DbSql, source: FilterSource, key: string, state: FilterState, bound: readonly Channel[], request: FacetRequest,
): Promise<Facet> {
  const column = source.columns.find((c) => c.key === key)!;
  const kind = column.kind as "options" | "pick";
  const chosen = state[key];
  const selected = chosen && (chosen.kind === "options" || chosen.kind === "pick") ? chosen.values : [];
  const limit = request.limit ?? 50;
  const term = request.term?.trim() ?? "";
  const listOf = (c: Channel) => c.bindings[key] as Extract<Binding, { kind: "list" | "constant" }>;
  const names = bound.map(listOf).find((b): b is Extract<Binding, { kind: "list" }> => b.kind === "list" && Boolean(b.names))?.names;

  const body = unionOf(sql, bound, state, (c) => {
    const b = listOf(c);
    if (b.kind === "constant") return sql`${b.value}::text v, null::text l, 1::float8 w`;
    return sql`(${b.value})::text v, ${names ? sql`null::text` : sql`(${b.label ?? sql`null`})::text`} l, (${b.weight ?? sql`1`})::float8 w`;
  }, key, (c) => {
    const b = listOf(c);
    return term && names && b.kind === "list" ? names.search(term) : null;
  });
  if (!body) return { kind, options: [], more: false };
  const search = term && !names
    ? sql`and (lower(unaccent(coalesce(l, ''))) like ${likeAny(term)} or v like ${`${escapeLike(term)}%`})`
    : sql``;
  const rows = (await sql`
    select v, max(l) l, count(*)::int n from (${body}) x
    where v is not null ${search}
    group by v
    order by (v = any(${sql.array(selected)}::text[])) desc, sum(w) desc nulls last, count(*) desc, max(l) asc nulls last, v asc
    limit ${limit + 1}
  `) as unknown as { v: string; l: string | null; n: number }[];
  const shown = rows.slice(0, limit);
  // A chosen value the rows no longer hold stays offered, at 0, so it can be taken out.
  const missing = term ? [] : selected.filter((v) => !shown.some((r) => r.v === v));
  const named = new Map<string, string>();
  if (names && shown.length + missing.length > 0) {
    const found = (await names.lookup([...shown.map((r) => r.v), ...missing])) as unknown as { v: string; l: string | null }[];
    for (const r of found) if (r.l) named.set(String(r.v), r.l);
  }
  const labelFor = (v: string, l: string | null) => named.get(v) ?? l ?? source.labelOf?.(key, v) ?? column.labels?.[v] ?? v;
  const options: OptionCount[] = [
    ...shown.map((r) => ({ value: r.v, label: labelFor(r.v, r.l), n: Number(r.n) })),
    ...missing.map((v) => ({ value: v, label: labelFor(v, null), n: 0 })),
  ];
  return { kind, options, more: rows.length > limit };
}
