import type { DbSql } from "@seap/db";
import { trendGroupSql, type TrendGroup } from "./predicates";
import type { AskSpec, TrendChange } from "./spec";

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

/** The lists of the answer: every change, each group, and the new ones whose first record is in year B (entities only). */
export const TREND_LISTS = ["all", "up", "new", "first", "down", "gone"] as const;
export type TrendList = (typeof TREND_LISTS)[number];
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
}

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
  o: { group: TrendGroup; topN: number; first: { role: "authority" | "supplier"; yearB: number } | null }): Promise<TrendPartition> {
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
  // Each list numbers its rows after its own top-N sort (`r`), so the union's order does not matter.
  const selects: Fragment[] = [
    ...lists.map(([list, { having, order }]): Fragment => sql`(
      select ${list}::text part, x.id, x.va, x.vb, null::bigint n, row_number() over () r, null::json x, null::text ids from (
        select k.id::text id, k.va::text va, k.vb::text vb from k ${where(having)} order by ${order} desc, k.id limit ${o.topN}) x)`),
    ...parts.map(([part, having]): Fragment => sql`(
      select ${`sum:${part}`}::text, null::text, coalesce(sum(k.va), 0)::text, coalesce(sum(k.vb), 0)::text, count(*), null::bigint,
        json_build_object('da', ${channel("n_da", "v_da", "f_da", "l_da")}, 'contracts', ${channel("n_ct", "v_ct", "f_ct", "l_ct")}),
        ${memberParts.has(part) ? sql`string_agg(k.id::text, chr(31) order by k.id)` : sql`null::text`}
      from k ${where(having)})`),
  ];
  const rows = (await sql`
    with k as materialized (${grouped})
    ${selects.reduce((a, b): Fragment => sql`${a} union all ${b}`)}
  `) as unknown as { part: string; id: string | null; va: string; vb: string; n: string | null; r: string | null; x: TrendPartSources | null; ids: string | null }[];
  const out: TrendPartition = { lists: {}, composition: {}, sources: {}, members: {} };
  for (const [list] of lists) out.lists[list] = [];
  for (const r of [...rows].sort((a, b) => Number(a.r ?? 0) - Number(b.r ?? 0))) {
    if (r.part.startsWith("sum:")) {
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

/** What the trend's groups are called after the selection (trend final §1): firms of a chosen buyer are its suppliers, institutions of a chosen firm its clients. */
export type TrendNoun = "firme" | "furnizori" | "instituții" | "clienți" | "județe";
export function trendNoun(spec: Pick<AskSpec, "dim" | "filters">): TrendNoun {
  const f = spec.filters;
  if (spec.dim === "county") return "județe";
  if (spec.dim === "supplier") return f.authorityId || f.authorityName || f.uatSiruta ? "furnizori" : "firme";
  return f.supplierId || f.supplierName ? "clienți" : "instituții";
}

/**
 * The facts of a shown row (trend final §3.4), read for the shown entities
 * only, in the answer's selection and months: they explain a row, they do not
 * filter it. `year` is the year that makes the change (B for a growth or a new
 * one, A for a decrease or a gone one); the record, the joint share and the
 * partner are of that year.
 */
export interface TrendRowFacts {
  year: number;
  /** The entity's value in that year (the row's valueA or valueB). */
  value: number;
  /** Its largest record that year, and the channel ("1 contract" / "1 achiziție directă"). */
  largest: { value: number; src: "da" | "contracts" } | null;
  /** Of that year's value, the contract shares with more than one winner (n_winners > 1, divided equally). */
  joint: number;
  /** The main partner that year: the buyer of a firm, the firm of an institution. */
  partner: { entityId: string; name: string; value: number } | null;
  /** First and last record of the entity anywhere in the archive (marts.entity_profile), not only in this selection. */
  firstActivity: string | null;
  lastActivity: string | null;
  /** core.entities.cui_valid; null when the identity has no record of it. */
  cuiValid: boolean | null;
  /** A foreign firm's country code (its row shows the country, not a county). */
  country: string | null;
}

/** The year whose records make a row's change: B when it grew (or is new, or equal), A when it fell (or is gone). */
export const changeYear = (row: { valueA: number; valueB: number }, yearA: number, yearB: number): number =>
  row.valueB >= row.valueA ? yearB : yearA;

/** Per entity and year: the value, the joint share, the largest record and the main partner (factsRows). */
export interface TrendFactsRow {
  id: string; y: string; v: string; joint: string;
  largest: string | null; largest_src: "da" | "contracts" | null;
  partner: string | null; partner_v: string | null;
}

/**
 * The row facts of `ids` in both years, from the transaction marts on the id
 * indexes ((supplier_id | authority_id, finalization_date)): `source` is a
 * union with src and n_winners (factsSource), `where` the answer's selection
 * with its two years and months, `id` and `partner` the columns of the ranked
 * role and of the other one. The finalization_date range bounds the index scan
 * (substr() in `where` hides the column from it).
 */
export async function trendFactsRows(sql: DbSql, o: { source: Fragment; where: Fragment; id: Fragment; partner: Fragment; ids: readonly string[]; yearA: number; yearB: number }):
  Promise<TrendFactsRow[]> {
  if (o.ids.length === 0) return [];
  const from = String(Math.min(o.yearA, o.yearB)), to = String(Math.max(o.yearA, o.yearB) + 1);
  return (await sql`
    with x as materialized (
      select ${o.id}::text id, substr(d.finalization_date, 1, 4) y, d.src, ${o.partner} partner,
             sum(d.closing_value) v, max(d.closing_value) mx,
             coalesce(sum(d.closing_value) filter (where d.n_winners > 1), 0) joint
      from ${o.source} d
      where ${o.where} and ${o.id} = any(${sql.array([...o.ids])}::bigint[])
        and d.finalization_date >= ${from} and d.finalization_date < ${to}
      group by 1, 2, 3, 4
    ), t as (select id, y, sum(v) v, sum(joint) joint from x group by 1, 2),
    l as (select distinct on (id, y) id, y, src, mx from x order by id, y, mx desc, src),
    p as (
      select distinct on (id, y) id, y, partner, v
      from (select id, y, partner, sum(v) v from x where partner is not null group by 1, 2, 3) z
      order by id, y, v desc, partner
    )
    select t.id, t.y, t.v::text v, t.joint::text joint, l.mx::text largest, l.src largest_src, p.partner::text partner, p.v::text partner_v
    from t left join l on l.id = t.id and l.y = t.y left join p on p.id = t.id and p.y = t.y
  `) as unknown as TrendFactsRow[];
}

/** The union the facts read: the slim union's columns, the channel and the number of winners (null on direct acquisitions). */
export function factsSource(sql: DbSql, dataset: "all" | "da" | "contracts", withNames: boolean): Fragment {
  const names: Fragment = withNames ? sql`authority_name, supplier_name, ` : sql``;
  const da: Fragment = sql`select authority_id, supplier_id, ${names}county, cpv_code, closing_value, finalization_date,
    null::boolean as is_single_bidder, 'da'::text as src, null::integer as n_winners from marts.da_transactions`;
  const contracts: Fragment = sql`select authority_id, supplier_id, ${names}county, cpv_code, closing_value, finalization_date,
    is_single_bidder, 'contracts'::text as src, n_winners from marts.contract_transactions`;
  return dataset === "da" ? sql`(${da})` : dataset === "contracts" ? sql`(${contracts})` : sql`(${da} union all ${contracts})`;
}

/** The profile of the shown entities and partners: display name, county or country, first and last record, valid CUI. */
export interface TrendProfile {
  name: string | null; county: string | null; country: string | null; foreign: boolean;
  firstActivity: string | null; lastActivity: string | null; cuiValid: boolean | null;
}
export async function trendProfiles(sql: DbSql, wanted: { role: "authority" | "supplier"; ids: readonly string[] }[]): Promise<Map<string, TrendProfile>> {
  const asked = wanted.filter((w) => w.ids.length > 0);
  if (asked.length === 0) return new Map();
  const rows = (await sql`
    select ep.role, ep.entity_id::text id, ep.name_display, ep.county, ep.country_code, coalesce(ep.is_foreign, false) is_foreign,
           ep.first_activity, ep.last_activity, e.cui_valid
    from marts.entity_profile ep left join core.entities e on e.id = ep.entity_id
    where ${asked.map((w): Fragment => sql`(ep.role = ${w.role} and ep.entity_id = any(${sql.array([...new Set(w.ids)])}::bigint[]))`).reduce((a, b): Fragment => sql`${a} or ${b}`)}
  `) as unknown as { role: string; id: string; name_display: string | null; county: string | null; country_code: string | null; is_foreign: boolean;
    first_activity: string | null; last_activity: string | null; cui_valid: boolean | null }[];
  return new Map(rows.map((r) => [`${r.role}:${r.id}`, {
    name: r.name_display, county: r.is_foreign ? null : r.county, country: r.is_foreign ? r.country_code : null, foreign: r.is_foreign,
    firstActivity: r.first_activity?.slice(0, 10) ?? null, lastActivity: r.last_activity?.slice(0, 10) ?? null, cuiValid: r.cui_valid,
  }]));
}

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

/** A label of a shown row (trend final §3.4), at most three, in this order. */
export type TrendRowLabel =
  | { kind: "noValidCui" }
  | { kind: "firstYear"; year: number }
  | { kind: "activeSince"; year: number }
  | { kind: "activeIn"; year: number }
  | { kind: "oneRecord"; share: number; src: "da" | "contracts" }
  | { kind: "joint"; share: number };

/**
 * The labels of a row from its facts: "fără CUI valid" (a domestic identity
 * without a valid CUI), "prima dată în B" / "activă din …" on the new ones,
 * "activă în …" on the gone ones that have records after B, "o înregistrare:
 * N%" when the largest record of the change year is at least half of the
 * change (the share capped at 100%), "în asociere" when at least half of
 * that year's value is in contracts with several winners. At most three.
 */
export function trendRowLabels(row: { valueA: number; valueB: number }, facts: TrendRowFacts, years: { yearA: number; yearB: number }): TrendRowLabel[] {
  const out: TrendRowLabel[] = [];
  if (facts.cuiValid !== true && facts.country === null) out.push({ kind: "noValidCui" });
  const first = facts.firstActivity ? Number(facts.firstActivity.slice(0, 4)) : null;
  const last = facts.lastActivity ? Number(facts.lastActivity.slice(0, 4)) : null;
  if (row.valueA === 0 && row.valueB > 0 && first !== null)
    out.push(first === years.yearB ? { kind: "firstYear", year: first } : { kind: "activeSince", year: first });
  if (row.valueB === 0 && row.valueA > 0 && last !== null && last > years.yearB) out.push({ kind: "activeIn", year: last });
  const change = Math.abs(row.valueB - row.valueA);
  if (facts.largest && change > 0 && facts.largest.value >= change / 2)
    out.push({ kind: "oneRecord", share: Math.min(1, facts.largest.value / change), src: facts.largest.src });
  if (facts.value > 0 && facts.joint >= facts.value / 2) out.push({ kind: "joint", share: facts.joint / facts.value });
  return out.slice(0, 3);
}

/** The group a row is in by its two values, as trendGroupSql's HAVINGs select it (the group of each row of „Toate”). */
export function trendGroupOfRow(row: { valueA: number; valueB: number }): Exclude<TrendChange, "all"> | "equal" {
  const { valueA: a, valueB: b } = row;
  if (a > 0 && b > a) return "up";
  if (a === 0 && b > 0) return "new";
  if (b > 0 && b < a) return "down";
  if (a > 0 && b === 0) return "gone";
  return "equal";
}
