import type { DbSql } from "@seap/db";
import { trendGroupSql, type TrendGroup } from "./predicates";
import { changeYear, type TrendList, type TrendRowFacts } from "./trend-shared";

// The lists, the row facts and their labels are the screen's too: trend-shared.ts, without SQL.
export { TREND_LISTS, changeYear, trendGroupOfRow, trendRowLabels, type TrendList, type TrendRowFacts, type TrendRowLabel } from "./trend-shared";

/*
 * The trend's partition (plan §4.7; trend final §3.1, §3.4): every entity or
 * county of the two years is a growth, a new one, a decrease, a gone one or
 * equal. One statement over the grouped result (the live union or a rollup)
 * gives the composition (number and sums of each group) and the first N of
 * every group, so the answer's five buttons switch without a query, and each
 * group's members and records per channel, which group-ids.ts keeps for the
 * group's source drawer (plan §2.5). A second
 * one reads the row facts of the shown entities only (the largest record, the
 * share of contracts with several winners, the main partner), and a third
 * their profile (name, county, first and last record, valid CUI). The group
 * conditions and orders are trendGroupSql's, shared with the sources.
 */

type Fragment = ReturnType<DbSql>;

/** What the composition counts: the lists, the equal ones, and with the order in percent the growths from the base. */
export type TrendPart = TrendList | "equal" | "eligible";
/** A part of the composition: how many entities (or counties), with the totals of both years. */
export interface TrendPartTotals { count: number; valueA: number; valueB: number }
export type TrendComposition = Partial<Record<TrendPart, TrendPartTotals>>;

/** One grouped row: the id (an entity id, or a county), with the sums of year A and year B (exact numeric text). */
export interface TrendPartitionRow { id: string; va: string; vb: string }
/**
 * The records of one channel of a part, as its source drawer totals them: the
 * number of records, their exact value, the first and last day ('YYYY-MM-DD';
 * null without records, or when the grouped input does not know the days).
 */
export interface TrendChannelSources { n: number; v: string; first: string | null; last: string | null }
export interface TrendPartSources { da: TrendChannelSources; contracts: TrendChannelSources }
/** The parts a source drawer can list: the groups, the first-year new ones, and with the order in percent the growths from the base. */
export const TREND_MEMBER_PARTS = ["up", "new", "first", "down", "gone", "eligible"] as const;
export type TrendMemberPart = (typeof TREND_MEMBER_PARTS)[number];
export interface TrendPartition {
  lists: Partial<Record<TrendList, TrendPartitionRow[]>>;
  composition: TrendComposition;
  /** Per part, the records of each channel (the sources of a group, the selection with `all`). */
  sources: Partial<Record<TrendPart, TrendPartSources>>;
  /** Per part a drawer can list, every member (entity ids in id order, or county names). */
  members: Partial<Record<TrendMemberPart, string[]>>;
  /**
   * With an entity attribute (the firms' employees, TrendAttribute): per list, the firms of that group
   * the attribute leaves out for want of a filing ("Fără bilanț: N firme noi, nu intră"), and the
   * selection the groups are part of, every firm of the two years with its records per channel.
   */
  withoutFiling?: Partial<Record<TrendList, number>>;
  selection?: { totals: TrendPartTotals; sources: TrendPartSources };
}

/**
 * An attribute of the grouped entities (trend final §3.10; plan §4.7 P3a, trend-2): the firms' employees
 * of their latest filing. The groups, their lists and composition keep the firms it selects (`keep`, a
 * condition on k.id); `filed` says which firms have a filing at all, to count those left out without one.
 */
export interface TrendAttribute { keep: Fragment; filed: Fragment }

/** The list a spec shows (data.rowsTrend): its change, the first-year new ones with `firstOnly`. */
export const trendListOf = (group: TrendGroup): TrendList => group.change === "new" && group.firstOnly ? "first" : group.change;

/**
 * The partition of `grouped` (`select <id> id, <va> va, <vb> vb, <the channel
 * columns of trendChannelColumns> … group by <id>`, no HAVING, no ORDER
 * BY): the composition and the first `topN` of every list, each in its
 * own order, then the id (or county) on equal values, as the single-group
 * queries order them. `group` gives the order of the growths (in lei, or in
 * percent from its base); `first` (entities only) the role and year B of
 * "Prima dată". The growths, the new, the decreases, the gone and the equal
 * ones add up to `all`. The same statement gives each part's records per
 * channel and the members of each part a drawer lists (group-ids.ts keeps
 * them): a group's sources need no second grouping.
 */
export async function trendPartition(sql: DbSql, grouped: Fragment,
  o: { group: TrendGroup; topN: number; first: { role: "authority" | "supplier"; yearB: number } | null; attribute?: TrendAttribute | null }): Promise<TrendPartition> {
  const va: Fragment = sql`k.va`, vb: Fragment = sql`k.vb`;
  const kid: Fragment = sql`k.id`;
  const at = (group: Partial<TrendGroup> & Pick<TrendGroup, "change">) =>
    trendGroupSql(sql, va, vb, { order: "lei", minBase: null, firstOnly: false, ...group }, o.first ? { id: kid, role: o.first.role, yearB: o.first.yearB } : undefined);
  const percent = o.group.order === "percent";
  // Each list in the order of its group (the growths in the spec's order), as trendGroupSql gives it.
  const lists: [TrendList, { having: Fragment | null; order: Fragment }][] = [
    ["all", at({ change: "all" })],
    ["up", at({ change: "up", order: o.group.order, minBase: o.group.minBase })],
    ["new", at({ change: "new" })],
    ...(o.first ? [["first", at({ change: "new", firstOnly: true })] as [TrendList, { having: Fragment | null; order: Fragment }]] : []),
    ["down", at({ change: "down" })],
    ["gone", at({ change: "gone" })],
  ];
  // The composition counts every growth, whatever the order (trend final §3.9: "Compoziția nu se schimbă").
  const parts: [TrendPart, Fragment | null][] = [
    ["all", null], ["up", at({ change: "up" }).having], ["new", at({ change: "new" }).having],
    ...(o.first ? [["first", at({ change: "new", firstOnly: true }).having] as [TrendPart, Fragment | null]] : []),
    ["down", at({ change: "down" }).having], ["gone", at({ change: "gone" }).having], ["equal", sql`${va} = ${vb}`],
    ...(percent ? [["eligible", at({ change: "up", order: "percent", minBase: o.group.minBase }).having] as [TrendPart, Fragment | null]] : []),
  ];
  const where = (having: Fragment | null): Fragment => having ? sql`where ${having}` : sql``;
  // The members a drawer lists (each group, the first-year new ones, the growths from the base), in the
  // same pass as their totals: one text of ids in id order (or county names), separated by U+001F.
  const memberParts = new Set<TrendPart>(TREND_MEMBER_PARTS);
  const channel = (n: string, v: string, f: string, l: string): Fragment => sql`json_build_object(
    'n', coalesce(sum(k.${sql(n)}), 0), 'v', coalesce(sum(k.${sql(v)}), 0)::text, 'first', min(k.${sql(f)}), 'last', max(k.${sql(l)}))`;
  // An attribute: the groups are of the entities it keeps (k); every entity of the selection is g, for the
  // selection's totals and, per list, the entities without a filing it leaves out (same pass, same HAVINGs on k.*).
  const attribute = o.attribute ?? null;
  const unfiled: Fragment[] = !attribute ? [] : [
    sql`(select 'selection'::text, null::text, coalesce(sum(k.va), 0)::text, coalesce(sum(k.vb), 0)::text, count(*), null::bigint,
      json_build_object('da', ${channel("n_da", "v_da", "f_da", "l_da")}, 'contracts', ${channel("n_ct", "v_ct", "f_ct", "l_ct")}), null::text from g k)`,
    ...lists.map(([list, { having }]): Fragment => sql`(
      select ${`none:${list}`}::text, null::text, null::text, null::text, count(*), null::bigint, null::json, null::text
      from g k where not (${attribute.filed})${having ? sql` and ${having}` : sql``})`),
  ];
  // Each list numbers its rows after its own top-N sort (`r`), so the union's order does not matter
  // (the first branch, a list, names the columns).
  const selects: Fragment[] = [
    ...lists.map(([list, { having, order }]): Fragment => sql`(
      select ${list}::text part, x.id, x.va, x.vb, null::bigint n, row_number() over () r, null::json x, null::text ids from (
        select k.id::text id, k.va::text va, k.vb::text vb from k ${where(having)} order by ${order} desc, k.id limit ${o.topN}) x)`),
    ...parts.map(([part, having]): Fragment => sql`(
      select ${`sum:${part}`}::text, null::text, coalesce(sum(k.va), 0)::text, coalesce(sum(k.vb), 0)::text, count(*), null::bigint,
        json_build_object('da', ${channel("n_da", "v_da", "f_da", "l_da")}, 'contracts', ${channel("n_ct", "v_ct", "f_ct", "l_ct")}),
        ${memberParts.has(part) ? sql`string_agg(k.id::text, chr(31) order by k.id)` : sql`null::text`}
      from k ${where(having)})`),
    ...unfiled,
  ];
  const inputs: Fragment = attribute
    ? sql`with g as materialized (${grouped}), k as materialized (select * from g k where ${attribute.keep})`
    : sql`with k as materialized (${grouped})`;
  const rows = (await sql`
    ${inputs}
    ${selects.reduce((a, b): Fragment => sql`${a} union all ${b}`)}
  `) as unknown as { part: string; id: string | null; va: string; vb: string; n: string | null; r: string | null; x: TrendPartSources | null; ids: string | null }[];
  const out: TrendPartition = { lists: {}, composition: {}, sources: {}, members: {} };
  for (const [list] of lists) out.lists[list] = [];
  for (const r of [...rows].sort((a, b) => Number(a.r ?? 0) - Number(b.r ?? 0))) {
    if (r.part === "selection") {
      out.selection = { totals: { count: Number(r.n), valueA: Number(r.va), valueB: Number(r.vb) },
        sources: { da: channelSources(r.x!.da), contracts: channelSources(r.x!.contracts) } };
    } else if (r.part.startsWith("none:")) {
      (out.withoutFiling ??= {})[r.part.slice(5) as TrendList] = Number(r.n);
    } else if (r.part.startsWith("sum:")) {
      const part = r.part.slice(4) as TrendPart;
      out.composition[part] = { count: Number(r.n), valueA: Number(r.va), valueB: Number(r.vb) };
      if (r.x) out.sources[part] = { da: channelSources(r.x.da), contracts: channelSources(r.x.contracts) };
      if (memberParts.has(part)) out.members[part as TrendMemberPart] = r.ids ? r.ids.split("\u001f") : [];
    } else out.lists[r.part as TrendList]!.push({ id: r.id!, va: r.va, vb: r.vb });
  }
  return out;
}
const channelSources = (c: { n: number | string; v: string; first: string | null; last: string | null }): TrendChannelSources =>
  ({ n: Number(c.n), v: c.v, first: c.first, last: c.last });

/** A watch's fixed members (plan §2.8): the first N in the group's order, their totals, and how many are still in the group. */
export interface TrendMembersFigures { rows: TrendPartitionRow[]; totals: Pick<TrendPartTotals, "valueA" | "valueB">; withRecords: number; stayed: number }
/**
 * The figures of a watch's fixed members, over `grouped` restricted to them
 * (same columns as trendPartition's input). Every member is listed in the
 * order of the group, whether or not its values still put it there (a growth
 * in percent without a base value goes last), so a member that leaves the
 * live group changes nothing unless its own records do. `stayed` counts those
 * the group's condition still selects, for the watch's note only.
 */
export async function trendMembersFigures(sql: DbSql, grouped: Fragment,
  o: { group: TrendGroup; topN: number; first: { role: "authority" | "supplier"; yearB: number } | null }): Promise<TrendMembersFigures> {
  const va: Fragment = sql`k.va`, vb: Fragment = sql`k.vb`;
  const { having, order } = trendGroupSql(sql, va, vb, o.group, o.first ? { id: sql`k.id`, role: o.first.role, yearB: o.first.yearB } : undefined);
  const ranked: Fragment = o.group.order === "percent" ? sql`case when k.va > 0 then ${order} end` : order;
  const rows = (await sql`
    with k as materialized (${grouped})
    (select 'row'::text part, x.id, x.va, x.vb, null::bigint n, row_number() over () r from (
      select k.id::text id, k.va::text va, k.vb::text vb from k order by ${ranked} desc nulls last, k.id limit ${o.topN}) x)
    union all (select 'sum', null, coalesce(sum(k.va), 0)::text, coalesce(sum(k.vb), 0)::text, count(*), null from k)
    union all (select 'stayed', null, null, null, count(*), null from k ${having ? sql`where ${having}` : sql``})
  `) as unknown as { part: string; id: string | null; va: string | null; vb: string | null; n: string | null; r: string | null }[];
  const sum = rows.find((r) => r.part === "sum");
  return {
    rows: rows.filter((r) => r.part === "row").sort((a, b) => Number(a.r) - Number(b.r)).map((r) => ({ id: r.id!, va: r.va!, vb: r.vb! })),
    totals: { valueA: Number(sum?.va ?? 0), valueB: Number(sum?.vb ?? 0) },
    withRecords: Number(sum?.n ?? 0),
    stayed: Number(rows.find((r) => r.part === "stayed")?.n ?? 0),
  };
}

/**
 * The channel columns of a trend's grouped input, per entity or county: the
 * records, value and first and last day of each channel (n_da, v_da, f_da,
 * l_da; n_ct, v_ct, f_ct, l_ct), the source drawer's totals (the state of a
 * direct acquisition is 'Oferta acceptata' and of a contract null, so there a
 * channel is a state). A dataset of one channel gives zeros and nulls for the
 * other; `of(src)` gives the aggregates of one channel, with null days when
 * the input does not know them.
 */
export function trendChannelColumns(sql: DbSql, dataset: "all" | "da" | "contracts",
  of: (src: "da" | "contracts") => { n: Fragment; v: Fragment; first: Fragment | null; last: Fragment | null }): Fragment {
  const columns = (src: "da" | "contracts", suffix: "da" | "ct"): Fragment => {
    const name = (column: string) => sql(`${column}_${suffix}`);
    if (dataset !== "all" && dataset !== src)
      return sql`0::bigint ${name("n")}, 0::numeric ${name("v")}, null::text ${name("f")}, null::text ${name("l")}`;
    const c = of(src);
    return sql`coalesce(${c.n}, 0)::bigint ${name("n")}, coalesce(${c.v}, 0) ${name("v")},
      (${c.first ?? sql`null`})::text ${name("f")}, (${c.last ?? sql`null`})::text ${name("l")}`;
  };
  return sql`${columns("da", "da")}, ${columns("contracts", "ct")}`;
}

/**
 * The channel columns of the live grouping (the slim union `d`, with `src` on
 * both channels): each channel's rows, value and first and last day, in byte
 * order as the rollups keep them.
 */
export function liveTrendChannels(sql: DbSql, dataset: "all" | "da" | "contracts"): Fragment {
  return trendChannelColumns(sql, dataset, (src) => {
    // A one-channel dataset reads its mart directly, without `src`.
    const only: Fragment = dataset === "all" ? sql` filter (where d.src = ${src})` : sql``;
    return {
      n: sql`count(*)${only}`, v: sql`sum(d.closing_value)${only}`,
      first: sql`min(left(d.finalization_date, 10) collate "C")${only}`, last: sql`max(left(d.finalization_date, 10) collate "C")${only}`,
    };
  });
}

// The groups' noun is the builder's too ("Furnizori noi" in "Ce fel de schimbare?"): kept beside the trend's filters, without SQL.
export { trendNoun, type TrendNoun } from "./filters/defs/trend";

/** Per entity and year: the value, the joint share, the largest record and the main partner (factsRows). */
export interface TrendFactsRow {
  id: string; y: string; v: string; joint: string;
  largest: string | null; largest_src: "da" | "contracts" | null;
  partner: string | null; partner_v: string | null;
}

/**
 * The ids of each year whose facts a row reads: its change year only
 * (changeYear; factsOfRow reads no other), so a growth reads year B and a
 * decrease year A, never both (catalog:trend: 63k records instead of 98k).
 */
export function factsYears(rows: readonly TrendPartitionRow[], yearA: number, yearB: number): { year: number; ids: string[] }[] {
  const ids = new Map<number, Set<string>>([[yearB, new Set()], [yearA, new Set()]]);
  for (const r of rows) ids.get(changeYear({ valueA: Number(r.va), valueB: Number(r.vb) }, yearA, yearB))!.add(r.id);
  return [...ids].map(([year, set]) => ({ year, ids: [...set] }));
}

/**
 * The row facts of the ids of `byYear` (factsYears), each in its own year,
 * from the transaction marts on the id indexes ((supplier_id | authority_id,
 * finalization_date)): `source` is a union with src and n_winners
 * (factsSource), `where` the answer's selection with its two years and
 * months, `id` and `partner` the columns of the ranked role and of the other
 * one. Each year's finalization_date range bounds its index scan (substr() in
 * `where` hides the column from it); the groups key on the ids and byte-order
 * text, not on collated text.
 */
export async function trendFactsRows(sql: DbSql, o: { source: Fragment; where: Fragment; id: Fragment; partner: Fragment; byYear: readonly { year: number; ids: readonly string[] }[] }):
  Promise<TrendFactsRow[]> {
  const wanted = o.byYear.filter((b) => b.ids.length > 0);
  if (wanted.length === 0) return [];
  const ofYear = wanted.map(({ year, ids }): Fragment => sql`(${o.id} = any(${sql.array([...ids])}::bigint[])
    and d.finalization_date >= ${String(year)} and d.finalization_date < ${String(year + 1)})`);
  return (await sql`
    with x as materialized (
      select ${o.id} id, substr(d.finalization_date, 1, 4) collate "C" y, d.src collate "C" src, ${o.partner} partner,
             sum(d.closing_value) v, max(d.closing_value) mx,
             coalesce(sum(d.closing_value) filter (where d.n_winners > 1), 0) joint
      from ${o.source} d
      where ${o.where} and (${ofYear.reduce((a, b): Fragment => sql`${a} or ${b}`)})
      group by 1, 2, 3, 4
    ), t as (select id, y, sum(v) v, sum(joint) joint from x group by 1, 2),
    l as (select distinct on (id, y) id, y, src, mx from x order by id, y, mx desc, src),
    p as (
      select distinct on (id, y) id, y, partner, v
      from (select id, y, partner, sum(v) v from x where partner is not null group by 1, 2, 3) z
      order by id, y, v desc, partner
    )
    select t.id::text id, t.y, t.v::text v, t.joint::text joint, l.mx::text largest, l.src largest_src, p.partner::text partner, p.v::text partner_v
    from t left join l on l.id = t.id and l.y = t.y left join p on p.id = t.id and p.y = t.y
  `) as unknown as TrendFactsRow[];
}

/**
 * The union the facts read: the slim union's columns, the channel and the number of winners (null on
 * direct acquisitions); with `f3`, what F3's conditions read (rowPredicates): the procedure and the
 * whole value, only then (a union carries every column it lists).
 */
export function factsSource(sql: DbSql, dataset: "all" | "da" | "contracts", withNames: boolean, f3 = false): Fragment {
  const names: Fragment = withNames ? sql`authority_name, supplier_name, ` : sql``;
  const daF3: Fragment = f3 ? sql`, null::text as procedure_type, null::numeric as contract_value_full` : sql``;
  const contractsF3: Fragment = f3 ? sql`, procedure_type, contract_value_full` : sql``;
  const da: Fragment = sql`select authority_id, supplier_id, ${names}county, cpv_code, closing_value, finalization_date,
    null::boolean as is_single_bidder, 'da'::text as src, null::integer as n_winners${daF3} from marts.da_transactions`;
  const contracts: Fragment = sql`select authority_id, supplier_id, ${names}county, cpv_code, closing_value, finalization_date,
    is_single_bidder, 'contracts'::text as src, n_winners${contractsF3} from marts.contract_transactions`;
  return dataset === "da" ? sql`(${da})` : dataset === "contracts" ? sql`(${contracts})` : sql`(${da} union all ${contracts})`;
}

/** The profile of the shown entities and partners: display name, county or country, first and last record, valid CUI. */
export interface TrendProfile {
  name: string | null; county: string | null; country: string | null; foreign: boolean;
  firstActivity: string | null; lastActivity: string | null; cuiValid: boolean | null;
}
/**
 * The profile of each asked id, from marts.entity_profile and core.entities
 * by id: the identity's own `cui_valid` (and name, county and country, when
 * the profile lacks them), so an entity whose profile a later marts stage
 * has not written yet is never labelled without a valid CUI. A seat county
 * kept as "NA" or "Necunoscut" is unknown, as elsewhere (to-spec, the
 * alternatives' labels). A firm's county is its seat once the column is
 * filled (`seat`, mart-columns.ts; owner-seat-switch, F4): the latest ONRC
 * registration, then SEAP; a foreign seat has no county, its country instead.
 */
export async function trendProfiles(sql: DbSql, wanted: { role: "authority" | "supplier"; ids: readonly string[] }[], seat = false): Promise<Map<string, TrendProfile>> {
  const asked = wanted.filter((w) => w.ids.length > 0);
  if (asked.length === 0) return new Map();
  const ids: Fragment = asked.map((w): Fragment => sql`select ${w.role}::text role, unnest(${sql.array([...new Set(w.ids)])}::bigint[]) id`)
    .reduce((a, b): Fragment => sql`${a} union ${b}`);
  const firmSeat: Fragment = seat ? sql`x.role = 'supplier' and ep.entity_id is not null` : sql`false`;
  const rows = (await sql`
    select x.role, x.id::text id, coalesce(ep.name_display, e.name_display) name_display,
           case when ${firmSeat} then ep.seat_county else coalesce(ep.county, e.county) end county,
           coalesce(ep.country_code, e.country_code) country_code,
           case when ${firmSeat} then ep.seat_source = 'foreign' else coalesce(ep.is_foreign, e.is_foreign, false) end is_foreign,
           ep.first_activity, ep.last_activity, e.cui_valid
    from (${ids}) x
    left join marts.entity_profile ep on ep.role = x.role and ep.entity_id = x.id
    left join core.entities e on e.id = x.id
    where ep.entity_id is not null or e.id is not null
  `) as unknown as { role: string; id: string; name_display: string | null; county: string | null; country_code: string | null; is_foreign: boolean;
    first_activity: string | null; last_activity: string | null; cui_valid: boolean | null }[];
  return new Map(rows.map((r) => [`${r.role}:${r.id}`, {
    name: r.name_display, county: r.is_foreign || !r.county || UNKNOWN_COUNTY.test(r.county) ? null : r.county,
    country: r.is_foreign ? r.country_code : null, foreign: r.is_foreign,
    firstActivity: r.first_activity?.slice(0, 10) ?? null, lastActivity: r.last_activity?.slice(0, 10) ?? null, cuiValid: r.cui_valid,
  }]));
}
/** Seat counties the marts keep as text for "no county". */
const UNKNOWN_COUNTY = /^(na|necunoscut)$/i;

/** A row's facts from its rows of factsRows and its profiles (`role:id` keys of trendProfiles). */
export function factsOfRow(row: { entityId: string; valueA: number; valueB: number }, years: { yearA: number; yearB: number },
  facts: readonly TrendFactsRow[], profiles: ReadonlyMap<string, TrendProfile>, roles: { own: "authority" | "supplier"; partner: "authority" | "supplier" }): TrendRowFacts {
  const year = changeYear(row, years.yearA, years.yearB);
  const f = facts.find((x) => x.id === row.entityId && x.y === String(year));
  const own = profiles.get(`${roles.own}:${row.entityId}`);
  const partner = f?.partner ? profiles.get(`${roles.partner}:${f.partner}`) : undefined;
  return {
    year,
    value: year === years.yearB ? row.valueB : row.valueA,
    largest: f?.largest && f.largest_src ? { value: Number(f.largest), src: f.largest_src } : null,
    joint: Number(f?.joint ?? 0),
    partner: f?.partner ? { entityId: f.partner, name: partner?.name ?? "(fără nume)", value: Number(f.partner_v) } : null,
    firstActivity: own?.firstActivity ?? null,
    lastActivity: own?.lastActivity ?? null,
    cuiValid: own ? own.cuiValid : null,
    country: own?.country ?? null,
  };
}
