import type { DbSql } from "@seap/db";
import type { Dataset } from "./spec";
import { sumDecimalStrings } from "./evidence";
import { andAll, ownCountySql, rowPredicates, type PredicateCtx } from "./predicates";
import {
  DEPENDENCE_PAIR_SHARE, FIRM_SHARE_MIN, FIRM_SHARE_TOTAL, NETWORK_LISTS, NETWORK_ROWS, RELATION_SIGNALS, networkGroupOf,
  type NetworkData, type NetworkList, type NetworkListData, type NetworkPartner, type NetworkRow,
} from "./network-shared";
import { SANKEY_DOMAINS, SANKEY_PARTNERS, SANKEY_REST, type SankeyData, type SankeyDomain, type SankeyFlow, type SankeyPartner } from "./sankey-shared";

/*
 * The relations of one entity (plan §4.8, §4.9, F4): network-2 and sankey-2,
 * and the partners a network's group or its signals select for the sources
 * (runRows). Every condition comes from lib/ask/predicates.ts, so the answer,
 * its sources and its CSV read the same rows.
 *
 * Both read the two channels at once (relationUnion), the channel of the
 * question being a condition of its own (`src`): the network's groups are of
 * the whole relation, and both answers give the strip each channel's share in
 * the same selection, in one pass over the entity's records.
 */

type Fragment = ReturnType<DbSql>;

/**
 * The records of both channels with what a relation reads besides the slim
 * union (compile.ts txAggFragment): the contract's number of winners and its
 * id (a direct acquisition has one winner and no contract), the procedure
 * (F3, contracts only) and, when asked, the size of the whole purchase. The
 * direct acquisitions' columns are those of their covering id indexes, so
 * their side is read index-only.
 */
export function relationUnion(sql: DbSql, full = false): Fragment {
  const fullDa = full ? sql`, null::numeric as contract_value_full` : sql``;
  const fullContracts = full ? sql`, contract_value_full` : sql``;
  return sql`(
    select authority_id, supplier_id, county, cpv_code, closing_value, finalization_date,
           null::boolean as is_single_bidder, null::text as procedure_type, 1 as n_winners, null::bigint as contract_id, 'da'::text as src${fullDa}
    from marts.da_transactions
    union all
    select authority_id, supplier_id, county, cpv_code, closing_value, finalization_date,
           is_single_bidder, procedure_type, n_winners, contract_id, 'contracts'::text${fullContracts}
    from marts.contract_transactions
  )`;
}

/**
 * The conditions of the whole relation (network final §3.1, plan §4.8 `rel`):
 * the analysis population (a positive value, direct acquisitions up to the
 * ceiling, the contracts' reporting), the precise selection with its
 * exclusions and the partners' own conditions (their seat, size, kind, place,
 * administrator), on every channel, without the period, the domain, the kind,
 * procedure and size of the purchase or the single bidder: those only pick
 * what is listed. The record threshold of an old link stays the selection's.
 */
export function relationCtx(ctx: PredicateCtx): PredicateCtx {
  return {
    ...ctx, cpvPrefixes: [], cpvExclude: [], purchaseKind: null, procedure: null, purchaseValueMin: null, purchaseValueMax: null,
    singleBidder: false, yearFrom: null, yearTo: null, monthFrom: null, monthTo: null, trendMonths: null, seriesMonths: null,
    plafond: "da-branch", minimumRecords: null,
  };
}

/**
 * The question's selection on the relation union: its channel, every condition of its records (the period
 * with `years`), and an old link's record threshold (`threshold`: groupPredicates over the question's channel).
 */
export function selectionCond(sql: DbSql, ctx: PredicateCtx, dataset: Dataset, opts: { years: boolean; threshold?: readonly Fragment[] }): Fragment {
  const parts = rowPredicates(ctx, { years: opts.years });
  if (dataset !== "all") parts.push(sql`d.src = ${dataset}`);
  return andAll(sql, [...parts, ...(opts.threshold ?? [])]);
}

const partnerOf = (sql: DbSql, focalRole: "authority" | "supplier") => focalRole === "authority" ? sql`d.supplier_id` : sql`d.authority_id`;
const focalOf = (sql: DbSql, focalRole: "authority" | "supplier") => focalRole === "authority" ? sql`d.authority_id` : sql`d.supplier_id`;
/** The year of a record, null when its date has none. */
const yearOf = (sql: DbSql) => sql`case when substr(d.finalization_date, 1, 4) ~ '^[0-9]{4}$' then substr(d.finalization_date, 1, 4)::int end`;

/**
 * The official signals on the relation of each partner `p.pid` with the
 * centre (network final §3.4): a possible split of this pair, a shared
 * representative of the firm at this institution and, with an institution in
 * the centre, the firm's dependence on it (direct acquisitions, contracts):
 * a dependence counts here when the pair holds at least 85% of the signal's
 * total. The lists of examples (da_round, award_single_bid…) are not complete
 * lists and never count.
 */
function relationSignals(sql: DbSql, focalRole: "authority" | "supplier", focalId: string): Fragment {
  const authority = focalRole === "authority" ? sql`${focalId}::bigint` : sql`p.pid`;
  const supplier = focalRole === "authority" ? sql`p.pid` : sql`${focalId}::bigint`;
  const dependence = focalRole === "authority" ? sql`
      or (f.flag_code = 'da_dependence' and f.entity_id = p.pid and p.vrda >= ${DEPENDENCE_PAIR_SHARE} * f.total_ron)
      or (f.flag_code = 'award_dependence' and f.entity_id = p.pid and p.vrct >= ${DEPENDENCE_PAIR_SHARE} * f.total_ron)` : sql``;
  return sql`(
    select coalesce(array_agg(distinct f.flag_code), '{}') from marts.flag_instances f
    where (f.flag_code = 'da_split' and f.entity_id = ${authority} and f.partner_id = ${supplier})
       or (f.flag_code = 'net_shared_admin' and f.entity_id = ${supplier} and f.partner_id = ${authority})${dependence}
  )`;
}

export interface RelationQuery {
  /** The question's conditions (runSpec's `w`, runRows' `ctx`). */
  ctx: PredicateCtx;
  dataset: Dataset;
  focalRole: "authority" | "supplier";
  focalId: string;
  /** The record threshold of an old link (groupPredicates over the question's channel), applied to the selection. */
  threshold?: readonly Fragment[];
  /** The question on every channel (the strip's shares), null where a channel is the question itself (a procedure, a single bidder). */
  every: PredicateCtx | null;
}

interface PartnerRow {
  pid: string; y0: number | null; y1: number | null; yrs: number[] | null; vr: string; vrda: string; vrct: string;
  vs: string; ns: string; cs: string; vp: string; np: string; cp: string;
  eda: string; nda: string; ect: string; nct: string;
  nm: string | null; co: string | null; emp: number | null; ft: string | null; sig: string[];
}

/**
 * Every partner of the centre, grouped once (plan §4.8 `rel`, `sel`): the
 * whole relation's first and last year, its years and its value per channel;
 * the selection's value, records and value from contracts with several winners,
 * without the period (`s`: a group's) and with it (`p`: „Toți”'s); each
 * channel in the selection on every channel (`e`); the partner's profile and
 * the signals on the relation. One scan of the centre's records on its id
 * indexes, summed first by partner, year, channel, several winners and the
 * three selections (a few rows per partner: a large firm's 466 thousand
 * records come down to about 40 thousand), then by partner.
 */
async function partnerRows(s: DbSql, q: RelationQuery): Promise<PartnerRow[]> {
  const { ctx, dataset, focalRole, focalId } = q;
  const pid = partnerOf(s, focalRole), partnerRole = focalRole === "authority" ? "supplier" : "authority";
  const rel = andAll(s, [...rowPredicates(relationCtx(ctx)), s`${pid} is not null`]);
  const sel = selectionCond(s, ctx, dataset, { years: false, ...(q.threshold ? { threshold: q.threshold } : {}) });
  const per = selectionCond(s, ctx, dataset, { years: true, ...(q.threshold ? { threshold: q.threshold } : {}) });
  const every = q.every ? andAll(s, rowPredicates(q.every)) : s`false`;
  const full = ctx.purchaseValueMin !== null || ctx.purchaseValueMax !== null;
  // The grouping is all in memory, on a few rows per partner: JIT would cost more than it saves (as the trend's).
  await s.unsafe("set local jit = off");
  return (await s`
    with r as (
      select ${pid} pid, ${yearOf(s)} y, d.src, d.n_winners > 1 j,
             coalesce(${sel}, false) sel, coalesce(${per}, false) per, coalesce(${every}, false) ev,
             sum(d.closing_value) v, count(*) n
      from ${relationUnion(s, full)} d
      where ${rel}
      group by 1, 2, 3, 4, 5, 6, 7
    ), p as (
      select pid, min(y) y0, max(y) y1, array_agg(distinct y order by y) filter (where y is not null) yrs,
             sum(v) vr, coalesce(sum(v) filter (where src = 'da'), 0) vrda, coalesce(sum(v) filter (where src = 'contracts'), 0) vrct,
             coalesce(sum(v) filter (where sel), 0) vs, coalesce(sum(n) filter (where sel), 0) ns, coalesce(sum(v) filter (where sel and j), 0) cs,
             coalesce(sum(v) filter (where per), 0) vp, coalesce(sum(n) filter (where per), 0) np, coalesce(sum(v) filter (where per and j), 0) cp,
             coalesce(sum(v) filter (where ev and src = 'da'), 0) eda, coalesce(sum(n) filter (where ev and src = 'da'), 0) nda,
             coalesce(sum(v) filter (where ev and src = 'contracts'), 0) ect, coalesce(sum(n) filter (where ev and src = 'contracts'), 0) nct
      from r group by pid
    )
    select p.pid::text pid, p.y0, p.y1, p.yrs, p.vr::text, p.vrda::text, p.vrct::text, p.vs::text, p.ns, p.cs::text, p.vp::text, p.np, p.cp::text,
           p.eda::text, p.nda, p.ect::text, p.nct,
           ep.name_display nm, ${ownCountySql(s, partnerRole, ctx.seatColumn)} co, ep.employees emp, ep.total_ron_split::text ft,
           ${relationSignals(s, focalRole, focalId)} sig
    from p
    left join marts.entity_profile ep on ep.entity_id = p.pid and ep.role = ${partnerRole}
  `) as unknown as PartnerRow[];
}

/** The streams of a selection on every channel, from the partners' sums. */
function streamsOf(rows: readonly PartnerRow[]): NonNullable<NetworkData["streams"]> {
  return {
    da: { value: Number(sumDecimalStrings(rows.map((r) => r.eda))), count: rows.reduce((n, r) => n + Number(r.nda), 0) },
    contracts: { value: Number(sumDecimalStrings(rows.map((r) => r.ect))), count: rows.reduce((n, r) => n + Number(r.nct), 0) },
  };
}

interface Listed { id: string; v: string; n: number; c: string; years: number }
const byValue = (a: Listed, b: Listed) => Number(b.v) - Number(a.v) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
/** The orders of a list (final §3.5): the value, the records, the years with records; ties by value. */
export const NETWORK_ORDER_COMPARE = {
  value: byValue,
  count: (a: Listed, b: Listed) => b.n - a.n || byValue(a, b),
  years: (a: Listed, b: Listed) => b.years - a.years || byValue(a, b),
} as const;

/** One list: its totals over every partner, and the first rows of every order, by value. */
function listOf(listed: Listed[]): NetworkListData {
  const held = new Set<string>();
  for (const compare of Object.values(NETWORK_ORDER_COMPARE)) for (const row of [...listed].sort(compare).slice(0, NETWORK_ROWS)) held.add(row.id);
  const rows: NetworkRow[] = listed.filter((row) => held.has(row.id)).sort(byValue)
    .map((row) => ({ entityId: row.id, value: Number(row.v), count: row.n, joint: Number(row.c) }));
  return {
    partners: listed.length, value: Number(sumDecimalStrings(listed.map((row) => row.v))), count: listed.reduce((n, row) => n + row.n, 0),
    oneOff: listed.filter((row) => row.n === 1).length, joint: Number(sumDecimalStrings(listed.map((row) => row.c))), rows,
  };
}

/**
 * network-2 (plan §4.8, final network §3): the four lists of the centre's
 * partners against the reference year `since`, each with its totals and the
 * first rows of each order, the facts of every partner held, the latest first
 * year in the selection and the channels' shares. `signals`: only the partners
 * with an official signal on the relation (a selection: they leave every list
 * and every total). Null when no partner has a record in the selection.
 */
export async function networkAnswer(s: DbSql, q: RelationQuery & { since: number; complete: number; signals: boolean; focalName: string; list: NetworkList }): Promise<NetworkData | null> {
  const all = await partnerRows(s, q);
  const rows = q.signals ? all.filter((row) => row.sig.length > 0) : all;
  const lists: Record<NetworkList, Listed[]> = { all: [], new: [], continuing: [], gone: [] };
  let lastNew: number | null = null;
  for (const row of rows) {
    const years = row.yrs?.length ?? 0;
    if (Number(row.np) > 0) lists.all.push({ id: row.pid, v: row.vp, n: Number(row.np), c: row.cp, years });
    if (Number(row.ns) > 0 && row.y0 !== null && row.y1 !== null) {
      lists[networkGroupOf(row.y0, row.y1, q.since)].push({ id: row.pid, v: row.vs, n: Number(row.ns), c: row.cs, years });
      lastNew = Math.max(lastNew ?? row.y0, row.y0);
    }
  }
  if (!NETWORK_LISTS.some((list) => lists[list].length)) return null;
  const data = Object.fromEntries(NETWORK_LISTS.map((list) => [list, listOf(lists[list])])) as Record<NetworkList, NetworkListData>;
  const held = new Set(NETWORK_LISTS.flatMap((list) => data[list].rows.map((row) => row.entityId)));
  const partners: Record<string, NetworkPartner> = {};
  for (const row of rows) {
    if (!held.has(row.pid)) continue;
    const firmTotal = row.ft === null ? 0 : Number(row.ft), share = firmTotal > 0 ? Number(row.vr) / firmTotal : 0;
    const dependent = row.sig.includes("da_dependence") || row.sig.includes("award_dependence");
    partners[row.pid] = {
      entityId: row.pid, name: row.nm ?? "?", county: row.co, employees: row.emp,
      first: row.y0 ?? 0, last: row.y1 ?? 0, years: row.yrs ?? [],
      signals: RELATION_SIGNALS.filter((code) => row.sig.includes(code)),
      firmShare: q.focalRole === "authority" && !dependent && firmTotal >= FIRM_SHARE_TOTAL && share >= FIRM_SHARE_MIN ? Math.min(1, share) : null,
    };
  }
  return {
    block: "network", focal: { entityId: q.focalId, name: q.focalName, role: q.focalRole }, since: q.since, complete: q.complete, list: q.list,
    lists: data, partners, lastNew, ...(q.every ? { streams: streamsOf(rows) } : {}),
  };
}

/**
 * The partners of a network's group and signals, as a semi-join for the
 * sources (runRows: "grupa și „Cu semnale” intră în surse ca subinterogare pe
 * ID-urile partenerilor", final network §Surse): the same grouping as the
 * answer, the partners whose relation falls in the group and has a record in
 * the selection (without the period: a group has none), with an official
 * signal when asked. Null when the question lists every partner.
 */
export function networkMembersCond(s: DbSql, q: RelationQuery & { group: NetworkList; since: number; signals: boolean }): Fragment | null {
  if (q.group === "all" && !q.signals) return null;
  const pid = partnerOf(s, q.focalRole);
  const rel = andAll(s, [...rowPredicates(relationCtx(q.ctx)), s`${pid} is not null`]);
  // A group's question has no period (NETWORK_RULES); „Toți” keeps its own.
  const sel = selectionCond(s, q.ctx, q.dataset, { years: true, ...(q.threshold ? { threshold: q.threshold } : {}) });
  const group = q.group === "new" ? s`p.y0 >= ${q.since}` : q.group === "continuing" ? s`p.y0 < ${q.since} and p.y1 >= ${q.since}`
    : q.group === "gone" ? s`p.y1 < ${q.since}` : s`true`;
  const members = s`(
    select p.pid from (
      select ${pid} pid, min(${yearOf(s)}) y0, max(${yearOf(s)}) y1,
             coalesce(sum(d.closing_value) filter (where d.src = 'da'), 0) vrda, coalesce(sum(d.closing_value) filter (where d.src = 'contracts'), 0) vrct,
             count(*) filter (where coalesce(${sel}, false)) ns
      from ${relationUnion(s, q.ctx.purchaseValueMin !== null || q.ctx.purchaseValueMax !== null)} d
      where ${rel}
      group by 1
    ) p
    where p.ns > 0 and ${group}
      ${q.signals ? s`and cardinality(${relationSignals(s, q.focalRole, q.focalId)}) > 0` : s``}
  )`;
  return s`${pid} in ${members}`;
}

interface FlowRow { pid: string; stem: string; src: "da" | "contracts"; v: string; n: string; c: string; ev: string; en: string }

/**
 * The domain of a record at the flow's level (final sankey §3.3): the first
 * `stemLen` digits of its code, two deeper than the chosen domain (2 → 4 → 6
 * → 8, as the breakdown); a term of several prefixes ("iluminat") shows the
 * prefixes themselves, the longest that matches.
 */
export function sankeyStem(s: DbSql, prefixes: readonly string[]): { stem: Fragment; stemLen: number } {
  if (prefixes.length > 1) {
    const ordered = [...prefixes].sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
    const cases = ordered.map((p) => s`when d.cpv_code like ${p + "%"} then ${p}::text`).reduce((a, b) => s`${a} ${b}`);
    return { stem: s`(case ${cases} end)`, stemLen: 0 };
  }
  const plen = prefixes[0]?.length ?? 0;
  const stemLen = plen === 0 ? 2 : Math.min(plen + 2, 8);
  return { stem: s`substr(d.cpv_code, 1, ${stemLen})`, stemLen };
}

/** Catalogue names of the domains (2-, 4-, 6- or 8-digit stems, a term's prefixes): the code padded to 8 digits. */
async function domainNames(s: DbSql, stems: readonly string[]): Promise<Map<string, string | null>> {
  const padded = stems.filter((stem) => stem !== SANKEY_REST).map((stem) => stem.padEnd(8, "0"));
  if (!padded.length) return new Map();
  const rows = (await s`
    select distinct on (substr(c.code, 1, 8)) substr(c.code, 1, 8) stem8, c.name_ro
    from core.cpv_codes c where substr(c.code, 1, 8) = any(${s.array(padded)}::text[])
    order by substr(c.code, 1, 8), length(c.code)
  `) as unknown as { stem8: string; name_ro: string | null }[];
  const names = new Map<string, string | null>();
  for (const stem of stems) names.set(stem, rows.find((r) => r.stem8 === stem.padEnd(8, "0"))?.name_ro ?? null);
  return names;
}

/**
 * sankey-2 (plan §4.9, final sankey §3): the centre's partners × domains of
 * the selection, the first 15 partners and 5 domains with their records, the
 * rest of each side as one node, every flow between them, the value from
 * contracts with several winners and, with an institution in the centre, the
 * firms each partner shares those contracts with. Null when the selection is
 * empty.
 */
export async function sankeyAnswer(s: DbSql, q: RelationQuery & { focalName: string; prefixes: readonly string[] }): Promise<SankeyData | null> {
  const { ctx, dataset, focalRole, focalId } = q;
  const pid = partnerOf(s, focalRole), partnerRole = focalRole === "authority" ? "supplier" : "authority";
  const { stem, stemLen } = sankeyStem(s, q.prefixes);
  const sel = selectionCond(s, ctx, dataset, { years: true, ...(q.threshold ? { threshold: q.threshold } : {}) });
  // Every channel bounds the scan (the strip's shares come from the same pass); without it, the selection itself.
  const where = andAll(s, [...rowPredicates(q.every ?? ctx), s`${pid} is not null`, s`d.cpv_code is not null`]);
  const full = ctx.purchaseValueMin !== null || ctx.purchaseValueMax !== null;
  const rows = (await s`
    select x.pid::text pid, x.stem, x.src, coalesce(sum(x.v) filter (where x.sel), 0)::text v, count(*) filter (where x.sel) n,
           coalesce(sum(x.v) filter (where x.sel and x.nw > 1), 0)::text c, coalesce(sum(x.v), 0)::text ev, count(*) en
    from (
      select ${pid} pid, ${stem} stem, d.src, d.closing_value v, d.n_winners nw, coalesce(${sel}, false) sel
      from ${relationUnion(s, full)} d where ${where}
    ) x
    where x.stem is not null
    group by 1, 2, 3
  `) as unknown as FlowRow[];
  const selected = rows.filter((row) => Number(row.n) > 0);
  if (!selected.length) return null;
  // Each partner and each domain over the whole selection.
  const partnerSums = new Map<string, { v: string[]; n: number; c: string[]; stems: Set<string> }>();
  const domainSums = new Map<string, { v: string[]; n: number; partners: Set<string> }>();
  for (const row of selected) {
    const p = partnerSums.get(row.pid) ?? { v: [], n: 0, c: [], stems: new Set<string>() };
    p.v.push(row.v); p.n += Number(row.n); p.c.push(row.c); p.stems.add(row.stem);
    partnerSums.set(row.pid, p);
    const d = domainSums.get(row.stem) ?? { v: [], n: 0, partners: new Set<string>() };
    d.v.push(row.v); d.n += Number(row.n); d.partners.add(row.pid);
    domainSums.set(row.stem, d);
  }
  const ranked = <K>(map: Map<string, K & { v: string[] }>) => [...map.entries()].map(([key, at]) => ({ key, at, value: sumDecimalStrings(at.v) }))
    .sort((a, b) => Number(b.value) - Number(a.value) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const partnerRank = ranked(partnerSums), domainRank = ranked(domainSums);
  const topPartners = new Set(partnerRank.slice(0, SANKEY_PARTNERS).map((p) => p.key));
  const topDomains = new Set(domainRank.slice(0, SANKEY_DOMAINS).map((d) => d.key));
  const [names, cpvNames, shared] = await Promise.all([
    s`select ep.entity_id::text id, ep.name_display nm from marts.entity_profile ep
      where ep.entity_id = any(${s.array([...topPartners])}::bigint[]) and ep.role = ${partnerRole}` as unknown as Promise<{ id: string; nm: string | null }[]>,
    domainNames(s, [...topDomains]),
    focalRole === "authority" ? jointWith(s, sel, focalId, partnerRank.slice(0, SANKEY_PARTNERS).filter((p) => Number(sumDecimalStrings(p.at.c)) > 0).map((p) => p.key), full)
      : Promise.resolve(new Map<string, { names: string[]; more: number }>()),
  ]);
  const nameOf = new Map(names.map((r) => [r.id, r.nm ?? "?"]));
  const flows = new Map<string, SankeyFlow & { vs: string[] }>();
  for (const row of selected) {
    const partnerId = topPartners.has(row.pid) ? row.pid : SANKEY_REST, categoryCode = topDomains.has(row.stem) ? row.stem : SANKEY_REST;
    const key = `${partnerId}|${categoryCode}`;
    const flow = flows.get(key) ?? {
      partnerId, partner: partnerId === SANKEY_REST ? "alți parteneri" : nameOf.get(partnerId) ?? "?",
      categoryCode, category: categoryCode === SANKEY_REST ? "alte domenii" : cpvNames.get(categoryCode) ?? null, value: 0, count: 0, vs: [],
    };
    flow.vs.push(row.v); flow.count += Number(row.n);
    flows.set(key, flow);
  }
  const partners: SankeyPartner[] = partnerRank.slice(0, SANKEY_PARTNERS).map(({ key, at, value }) => {
    const joint = shared.get(key);
    return {
      entityId: key, name: nameOf.get(key) ?? "?", value: Number(value), count: at.n, domains: at.stems.size, joint: Number(sumDecimalStrings(at.c)),
      ...(joint ? { with: joint.names, withMore: joint.more } : {}),
    };
  });
  const domains: SankeyDomain[] = domainRank.slice(0, SANKEY_DOMAINS).map(({ key, at, value }) => ({
    code: key, name: cpvNames.get(key) ?? null, value: Number(value), count: at.n, partners: at.partners.size,
  }));
  return {
    block: "sankey", focal: { entityId: focalId, name: q.focalName, role: focalRole },
    flows: [...flows.values()].map(({ vs, ...flow }) => ({ ...flow, value: Number(sumDecimalStrings(vs)) }))
      .sort((a, b) => b.value - a.value || (a.partnerId < b.partnerId ? -1 : a.partnerId > b.partnerId ? 1 : a.categoryCode < b.categoryCode ? -1 : 1)),
    partners, domains,
    totals: {
      value: Number(sumDecimalStrings(selected.map((row) => row.v))), count: selected.reduce((n, row) => n + Number(row.n), 0),
      partners: partnerSums.size, domains: domainSums.size,
    },
    stemLen, joint: Number(sumDecimalStrings(selected.map((row) => row.c))),
    ...(q.every ? { streams: {
      da: { value: Number(sumDecimalStrings(rows.filter((r) => r.src === "da").map((r) => r.ev))), count: rows.filter((r) => r.src === "da").reduce((n, r) => n + Number(r.en), 0) },
      contracts: { value: Number(sumDecimalStrings(rows.filter((r) => r.src === "contracts").map((r) => r.ev))), count: rows.filter((r) => r.src === "contracts").reduce((n, r) => n + Number(r.en), 0) },
    } } : {}),
  };
}

/** The firms that won the selection's contracts together with each partner (final sankey §3.10): the three most frequent by name, and how many more. */
async function jointWith(s: DbSql, sel: Fragment, focalId: string, partnerIds: readonly string[], full: boolean): Promise<Map<string, { names: string[]; more: number }>> {
  if (!partnerIds.length) return new Map();
  const rows = (await s`
    select x.pid::text pid, coalesce(ep.name_display, o.supplier_name, '?') nm, count(distinct x.cid) k
    from (
      select d.supplier_id pid, d.contract_id cid from ${relationUnion(s, full)} d
      where ${sel} and d.authority_id = ${focalId} and d.src = 'contracts' and d.n_winners > 1
        and d.supplier_id = any(${s.array([...partnerIds])}::bigint[]) and d.cpv_code is not null
    ) x
    join marts.contract_transactions o on o.contract_id = x.cid and o.supplier_id <> x.pid
    left join marts.entity_profile ep on ep.entity_id = o.supplier_id and ep.role = 'supplier'
    group by 1, 2
    order by 1, 3 desc, 2
  `) as unknown as { pid: string; nm: string; k: string }[];
  const out = new Map<string, { names: string[]; more: number }>();
  for (const row of rows) {
    const at = out.get(row.pid) ?? { names: [], more: 0 };
    if (at.names.length < 3) at.names.push(row.nm); else at.more++;
    out.set(row.pid, at);
  }
  return out;
}
