import {
  canonicalContract, CONTRACT_VALUE_CAP_RON, contractDatePlausible, contractKind, contractRonValue, contractTemporarilyExcluded, type DbSql,
} from "@seap/db";
import { andAll, DA_PLAFOND_RON, groupPredicates, rowPredicates, type PredicateCtx } from "./predicates";
import type { CoveragePeriods } from "./months-window";
import type { AskSpec, Dataset } from "./spec";
import {
  COMPETITION_PROCEDURES, FACT_CHECK_VERSION, OUTSIDE_ROWS_LIMIT, factLegacy, factNoReason, factRestricted, factVerdict,
  type FactCheckData, type FactOutsideCategory, type FactOutsideRow, type FactParty, type FactSample, type FactShare, type FactTwin,
} from "./fact-check-shared";

/*
 * The verification's answer (fact_check-2, plan §4.10, final fact_check §4–§5),
 * over the pair's own rows: a handful of statements on the id indexes of the
 * two entities, inside runSpec's read-only transaction.
 *
 * - The selection is the question's conditions (rowPredicates and the record
 *   threshold, as whereFrag), so the answer, its sources and the CSV count the
 *   same records. Each statement reads the whole relation once and marks the
 *   selection's rows (`sel`): the band "În toată relația" costs no other read.
 * - Outside the sums, from the same conditions without their value bounds:
 *   the direct acquisitions above the 2 mil. lei filter or without a positive
 *   value (marts.da_transactions), and from the source tables (core) the
 *   contracts of the pair the contract mart leaves out: framework ceilings,
 *   uncertain identities, above 1 mld. lei, an unclear kind. A contract the
 *   mart already holds is never listed again (a build from before the framework
 *   rule sums the ceilings: they are counted as such, `frameworks.inSums`).
 * - The weight of the relation, with the same conditions, without the other side.
 * - "Nu" in the whole archive: the partners of each side and an entity of
 *   exactly the same name that has records with the other side.
 */

type Fragment = ReturnType<DbSql>;

export interface FactCheckInput {
  spec: AskSpec;
  ctx: PredicateCtx;
  dataset: Dataset;
  /** The source the record threshold counts (compile.ts txAggFragment of the dataset). */
  agg: Fragment;
  authority: FactParty;
  supplier: FactParty;
  coverage: CoveragePeriods | null;
}

/** The pair's rows with the columns of the list and of the profile: both marts, as the union of the engine (txFragment). */
function pairTx(s: DbSql): Fragment {
  return s`(
    select 'da'::text src, sicap_da_id ref_id, da_code, authority_id, supplier_id, county, cpv_code, cpv_name, closing_value, finalization_date,
           estimated_value_ron, null::integer n_winners, null::numeric contract_value_full, null::text procedure_type,
           null::integer tenders_received, null::boolean is_single_bidder
    from marts.da_transactions
    union all
    select 'contracts'::text, contract_id, contract_no, authority_id, supplier_id, county, cpv_code, cpv_name, closing_value, finalization_date,
           null::numeric, n_winners, contract_value_full, procedure_type, tenders_received, is_single_bidder
    from marts.contract_transactions
  )`;
}

/**
 * The pair's procedure contracts in the source tables, under the contract
 * mart's names (the award's CPV, the authority's county, the contract's date
 * from CONTRACT_DATE_FLOOR), with why each is outside the sums, or null.
 */
function coreContracts(s: DbSql, authorityId: string, supplierId: string): Fragment {
  return s`(
    select x.*, case
        when x.kind = 'framework' and x.in_sums then 'framework_in_sums'
        when x.kind = 'framework' and x.canonical and x.full_value > 0 then 'framework'
        when x.identity_excluded and x.kind in ('contract', 'calloff') and x.full_value > 0 then 'identity'
        when x.canonical and x.kind in ('contract', 'calloff') and x.full_value > ${CONTRACT_VALUE_CAP_RON} and not x.in_sums then 'above_cap'
        when x.canonical and x.kind = 'review' and x.full_value > 0 and not x.in_sums then 'kind'
      end category
    from (
      select c.id contract_id, c.ca_notice_contract_id nid, cw.entity_id supplier_id, aw.authority_entity_id authority_id,
             ae.county, aw.cpv_code, cpv.name_ro cpv_name, c.contract_no da_code, aw.procedure_type, 'contracts'::text src,
             case when ${contractDatePlausible(s)} then to_char(c.contract_date at time zone 'Europe/Bucharest', 'YYYY-MM-DD') end finalization_date,
             v.full_value, v.full_value / w.n closing_value, null::boolean is_single_bidder,
             v.kind, v.canonical, v.identity_excluded, v.in_sums
      from core.contract_winners cw
      join core.contracts c on c.id = cw.contract_id
      join core.awards aw on aw.ca_notice_id = c.ca_notice_id
      left join core.entities ae on ae.id = aw.authority_entity_id
      left join core.cpv_codes cpv on cpv.code = aw.cpv_code
      cross join lateral (select ${contractRonValue(s)} full_value, ${contractKind(s)} kind, ${canonicalContract(s)} canonical,
        ${contractTemporarilyExcluded(s)} identity_excluded,
        exists (select 1 from marts.contract_transactions ct where ct.contract_id = c.id and ct.supplier_id = cw.entity_id) in_sums) v
      cross join lateral (select greatest(count(*), 1) n from core.contract_winners w2
        where w2.contract_id = c.id and w2.entity_id is distinct from aw.authority_entity_id) w
      where cw.entity_id = ${supplierId} and aw.authority_entity_id = ${authorityId} and c.contract_date is not null
    ) x
  )`;
}

/** The pair alone: the whole relation (both channels, no period, domain or old condition). */
export function pairOnly(ctx: PredicateCtx): PredicateCtx {
  return {
    ...ctx, population: null, minimumRecords: null, cpvPrefixes: [], cpvExclude: [], county: null, kind: null, kindIds: null,
    uatSiruta: null, uatAuthorityIds: [], singleBidder: false, minEmployees: null, maxEmployees: null, yearFrom: null, yearTo: null,
    monthFrom: null, monthTo: null, trendMonths: null, adminSupplierIds: null, plafond: "da-branch", comparison: null,
  };
}

/**
 * The selection's condition on a row `d` of pairTx or coreContracts: its
 * channel, the question's conditions (without the value bounds for the rows
 * outside the sums) and the record threshold, counted over the records.
 */
function selectionWhere(s: DbSql, ctx: PredicateCtx, input: Pick<FactCheckInput, "agg" | "dataset">, values = true): Fragment {
  const counted = andAll(s, rowPredicates(ctx));
  const own = values ? counted : andAll(s, rowPredicates(ctx, { values: false }));
  return andAll(s, [input.dataset === "all" ? s`true` : s`d.src = ${input.dataset}`, own, ...groupPredicates(ctx, input.agg, counted)]);
}

const num = (v: string | number | null | undefined): number => v === null || v === undefined ? 0 : Number(v);
/** Sums of amounts to the ban: adding floats leaves noise (93301.26000000001). */
const cents = (n: number): number => Math.round(n * 100) / 100;
const centsOf = <T extends { value: number }>(at: T): T => ({ ...at, value: cents(at.value) });
const year = (v: string | null | undefined): number | null => v && /^\d{4}/.test(v) ? Number(v.slice(0, 4)) : null;

/** The verification's answer: the verdict, the profile, the rows outside the sums and the relation around it. */
export async function factCheckData(s: DbSql, input: FactCheckInput): Promise<FactCheckData> {
  const { ctx, spec } = input;
  const A = input.authority.entityId, S = input.supplier.entityId;
  const tx = pairTx(s);
  const bare = pairOnly(ctx);
  const sel = selectionWhere(s, ctx, input);
  const restricted = factRestricted(spec), legacy = factLegacy(spec);

  // The relation's records, grouped by channel, year and division, with the selection's marked.
  const profile = (await s`
    select coalesce((${sel}), false) sel, d.src, substr(d.finalization_date, 1, 4) y, substr(d.cpv_code, 1, 2) div,
           count(*)::int n, coalesce(sum(d.closing_value), 0)::text v,
           count(*) filter (where d.n_winners > 1)::int cons_n,
           coalesce(sum(d.closing_value) filter (where d.n_winners > 1), 0)::text cons_v,
           coalesce(sum(d.contract_value_full) filter (where d.n_winners > 1), 0)::text cons_full,
           count(*) filter (where d.procedure_type = any(${s.array([...COMPETITION_PROCEDURES])}::text[]) and d.is_single_bidder)::int single,
           count(*) filter (where d.procedure_type = any(${s.array([...COMPETITION_PROCEDURES])}::text[]) and d.tenders_received > 1)::int multi,
           min(d.finalization_date) first, max(d.finalization_date) last
    from ${tx} d where ${andAll(s, rowPredicates(bare))}
    group by 1, 2, 3, 4
  `) as unknown as { sel: boolean; src: "da" | "contracts"; y: string | null; div: string | null; n: number; v: string; cons_n: number; cons_v: string; cons_full: string; single: number; multi: number; first: string | null; last: string | null }[];

  // The direct acquisitions the sums leave out (> 2 mil. lei, ≤ 0), and the contracts the contract mart leaves out.
  const outsideDa = (await s`
    select coalesce((${selectionWhere(s, ctx, input, false)}), false) sel, d.ref_id::text ref, d.da_code code, substr(d.finalization_date, 1, 10) date,
           d.cpv_name what, d.closing_value::text v, d.estimated_value_ron::text est,
           case when d.closing_value > ${DA_PLAFOND_RON} then 'da_above' else 'da_nonpositive' end category
    from ${tx} d
    where d.src = 'da' and ${andAll(s, rowPredicates(bare, { values: false }))}
      and not (coalesce(d.closing_value, 0) > 0 and d.closing_value <= ${DA_PLAFOND_RON})
    order by d.closing_value desc nulls last, d.ref_id desc
    limit 500
  `) as unknown as OutsideRow[];
  const outsideContracts = (await s`
    select coalesce((${selectionWhere(s, ctx, input, false)}), false) sel, d.contract_id::text ref, d.nid::text nid, d.da_code code, d.finalization_date date,
           d.cpv_name what, d.full_value::text v, null::text est, d.procedure_type procedure, d.category
    from ${coreContracts(s, A, S)} d
    where d.category is not null and ${andAll(s, rowPredicates(bare, { values: false }))}
    order by d.full_value desc nulls last, d.contract_id desc
    limit 500
  `) as unknown as OutsideRow[];

  const mine = profile.filter((r) => r.sel);
  const count = mine.reduce((n, r) => n + r.n, 0);
  const value = mine.reduce((n, r) => n + num(r.v), 0);
  const outside = [...outsideDa, ...outsideContracts];
  const selOutside = outside.filter((r) => r.sel);
  const excludedRows = selOutside.filter((r) => r.category !== "framework" && r.category !== "framework_in_sums");
  const frameworkRows = selOutside.filter((r) => r.category === "framework");
  const inSumsRows = selOutside.filter((r) => r.category === "framework_in_sums");
  const state = factVerdict({ count, excluded: excludedRows.length, frameworks: frameworkRows.length });

  const relationCount = profile.reduce((n, r) => n + r.n, 0);
  const relationOutside = outside.filter((r) => r.category !== "framework_in_sums");
  const relationHas = relationCount > 0 || relationOutside.length > 0;

  const [samples, parties, share, names] = await Promise.all([
    count > 0 ? readSamples(s, tx, sel) : Promise.resolve([] as FactSample[]),
    readParties(s, A, S),
    count > 0 ? readShare(s, tx, input) : Promise.resolve(null),
    readDivisionNames(s, [...new Set(mine.map((r) => r.div).filter((d): d is string => Boolean(d)))]),
  ]);
  const none = state === "no" && !relationHas;
  const [partners, twins] = none
    ? await Promise.all([readPartners(s, tx, A, S), readTwins(s, tx, A, S)])
    : [null, [] as FactTwin[]];

  const years = new Map<number, { count: number; value: number }>();
  const domains = new Map<string, { count: number; value: number }>();
  const channels = { da: { count: 0, value: 0 }, contracts: { count: 0, value: 0 } };
  const undated = { count: 0, value: 0 };
  let single = 0, multiple = 0, consN = 0, consShare = 0, consFull = 0, contractsN = 0;
  let first: string | null = null, last: string | null = null;
  for (const r of mine) {
    const y = year(r.y), v = num(r.v);
    if (y === null) { undated.count += r.n; undated.value += v; }
    else { const at = years.get(y) ?? { count: 0, value: 0 }; at.count += r.n; at.value += v; years.set(y, at); }
    if (r.div) { const at = domains.get(r.div) ?? { count: 0, value: 0 }; at.count += r.n; at.value += v; domains.set(r.div, at); }
    channels[r.src].count += r.n; channels[r.src].value += v;
    if (r.src === "contracts") contractsN += r.n;
    single += r.single; multiple += r.multi;
    consN += r.cons_n; consShare += num(r.cons_v); consFull += num(r.cons_full);
    if (r.first && (!first || r.first < first)) first = r.first;
    if (r.last && (!last || r.last > last)) last = r.last;
  }
  const lastDay = [input.coverage?.da.to, input.coverage?.contracts.to].filter((d): d is string => Boolean(d)).map((d) => d.slice(0, 10)).sort().at(-1) ?? null;
  const partialYear = lastDay && lastDay.slice(5, 10) !== "12-31" ? Number(lastDay.slice(0, 4)) : null;
  const relation = restricted || legacy ? (() => {
    const dated = profile.map((r) => year(r.y)).filter((y): y is number => y !== null);
    return {
      count: relationCount, value: cents(profile.reduce((n, r) => n + num(r.v), 0)),
      yearFirst: dated.length ? Math.min(...dated) : null, yearLast: dated.length ? Math.max(...dated) : null,
      frameworks: relationOutside.filter((r) => r.category === "framework").length,
      excluded: relationOutside.filter((r) => r.category !== "framework").length,
    };
  })() : null;

  const yearList = [...years.entries()].sort((a, b) => a[0] - b[0]).map(([y, at]) => ({ year: y, ...centsOf(at) }));
  return {
    version: FACT_CHECK_VERSION, state,
    ...(state === "no" ? { reason: factNoReason({ legacy, relationHas }) } : {}),
    restricted, legacy,
    verdict: state === "yes",
    authority: parties.get(A) ? { ...input.authority, ...parties.get(A) } : input.authority,
    supplier: parties.get(S) ? { ...input.supplier, ...parties.get(S) } : input.supplier,
    count, value: cents(value),
    yearFirst: yearList[0]?.year ?? null, yearLast: yearList.at(-1)?.year ?? null,
    dateFirst: first ? first.slice(0, 10) : null, dateLast: last ? last.slice(0, 10) : null,
    samples,
    undated: centsOf(undated), years: yearList, partialYear, channels: { da: centsOf(channels.da), contracts: centsOf(channels.contracts) },
    domains: [...domains.entries()].map(([code, at]) => ({ code, name: names.get(code) ?? null, ...centsOf(at) })).sort((a, b) => b.value - a.value || a.code.localeCompare(b.code)),
    competition: single + multiple > 0 ? { single, multiple, unknown: contractsN - single - multiple } : null,
    consortium: consN > 0 ? { count: consN, share: cents(consShare), full: cents(consFull) } : null,
    frameworks: {
      count: frameworkRows.length, ceiling: cents(frameworkRows.reduce((n, r) => n + num(r.v), 0)),
      inSums: inSumsRows.length, inSumsCeiling: cents(inSumsRows.reduce((n, r) => n + num(r.v), 0)),
      rows: frameworkRows.slice(0, OUTSIDE_ROWS_LIMIT).map(outsideRow),
    },
    excluded: { count: excludedRows.length, rows: excludedRows.slice(0, OUTSIDE_ROWS_LIMIT).map(outsideRow) },
    share, relation,
    coverage: { da: input.coverage?.da.to?.slice(0, 10) ?? null, contracts: input.coverage?.contracts.to?.slice(0, 10) ?? null },
    partners, twins,
  };
}

interface OutsideRow { sel: boolean; ref: string; nid?: string | null; code: string | null; date: string | null; what: string | null; v: string | null; est: string | null; procedure?: string | null; category: FactOutsideCategory | "framework_in_sums" }
const outsideRow = (r: OutsideRow): FactOutsideRow => ({
  category: r.category as FactOutsideCategory, src: r.category === "da_above" || r.category === "da_nonpositive" ? "da" : "contracts",
  refId: r.ref, nid: r.nid ?? null, code: r.code, date: r.date, what: r.what, value: r.v === null ? null : Number(r.v),
  estimated: r.est === null ? null : Number(r.est), procedure: r.procedure ?? null,
});

/** The five largest records of the selection and the most recent one, when it is not among them (final §4.6). */
async function readSamples(s: DbSql, tx: Fragment, sel: Fragment): Promise<FactSample[]> {
  const rows = (await s`
    select x.*, k.nid, k.kind from (
      (select 'top' k, d.src, d.ref_id::text ref, d.da_code, substr(d.finalization_date, 1, 10) date, d.cpv_name, d.closing_value::text v,
              d.procedure_type, d.n_winners, d.contract_value_full::text full_value, d.tenders_received
       from ${tx} d where ${sel} order by d.closing_value desc, d.ref_id desc limit 5)
      union all
      (select 'recent', d.src, d.ref_id::text, d.da_code, substr(d.finalization_date, 1, 10), d.cpv_name, d.closing_value::text,
              d.procedure_type, d.n_winners, d.contract_value_full::text, d.tenders_received
       from ${tx} d where ${sel} order by d.finalization_date desc nulls last, d.ref_id desc limit 1)
    ) x
    left join lateral (select c.ca_notice_contract_id::text nid, ${contractKind(s)} kind from core.contracts c
      where x.src = 'contracts' and c.id = x.ref::bigint) k on true
    order by x.k = 'recent', x.v::numeric desc, x.ref desc
  `) as unknown as { k: "top" | "recent"; src: "da" | "contracts"; ref: string; da_code: string | null; date: string | null; cpv_name: string | null; v: string; procedure_type: string | null; n_winners: number | null; full_value: string | null; tenders_received: number | null; nid: string | null; kind: string | null }[];
  const top = rows.filter((r) => r.k === "top");
  const recent = rows.find((r) => r.k === "recent");
  const listed = recent && !top.some((r) => r.src === recent.src && r.ref === recent.ref) ? [...top, recent] : top;
  return listed.map((r) => ({
    daCode: r.da_code, date: r.date, cpvName: r.cpv_name, value: Number(r.v),
    src: r.src, refId: r.ref, nid: r.nid, procedure: r.src === "contracts" ? r.procedure_type : null,
    nWinners: r.n_winners, fullValue: r.full_value === null ? null : Number(r.full_value), bids: r.tenders_received, kind: r.kind,
    ...(r.k === "recent" ? { recent: true as const } : {}),
  }));
}

/** CUI and county of the two entities: the same name may belong to several (final §4.2). */
async function readParties(s: DbSql, A: string, S: string): Promise<Map<string, { cui: string | null; county: string | null }>> {
  const rows = (await s`select id::text id, cui_canonical cui, county from core.entities where id in (${A}, ${S})`) as unknown as { id: string; cui: string | null; county: string | null }[];
  return new Map(rows.map((r) => [r.id, { cui: r.cui, county: r.county }]));
}

/** The short names come from lib/cpv-aliases (the page); the official name of each division, from the catalogue. */
async function readDivisionNames(s: DbSql, divisions: readonly string[]): Promise<Map<string, string | null>> {
  if (!divisions.length) return new Map();
  const rows = (await s`
    select distinct on (substr(code, 1, 2)) substr(code, 1, 2) div, name_ro from core.cpv_codes
    where substr(code, 1, 2) = any(${s.array([...divisions])}::text[]) and substr(code, 3, 6) = '000000'
    order by substr(code, 1, 2), code
  `) as unknown as { div: string; name_ro: string | null }[];
  return new Map(rows.map((r) => [r.div, r.name_ro]));
}

/**
 * The relation's weight (final §4.3): the buyer among the firm's clients and
 * the firm among the buyer's suppliers, by value, with the same conditions
 * except the other side. The rank counts the partners with more.
 */
async function readShare(s: DbSql, tx: Fragment, input: FactCheckInput): Promise<{ ofSupplier: FactShare; ofAuthority: FactShare } | null> {
  const A = input.authority.entityId, S = input.supplier.entityId;
  const side = async (column: "authority_id" | "supplier_id", own: string, ctx: PredicateCtx): Promise<FactShare | null> => {
    const key = s(column);
    const [r] = (await s`
      with g as (select d.${key} id, sum(d.closing_value) v from ${tx} d where ${selectionWhere(s, ctx, input)} and d.${key} is not null group by 1)
      select (select count(*) from g)::int n, (select coalesce(sum(v), 0) from g)::text total, (select v from g where id = ${own})::text own,
             (select count(*) from g where v > (select v from g where id = ${own}))::int above
    `) as unknown as { n: number; total: string; own: string | null; above: number }[];
    if (!r || r.own === null) return null;
    return { rank: r.above + 1, of: r.n, share: num(r.total) > 0 ? num(r.own) / num(r.total) : 0 };
  };
  const [ofSupplier, ofAuthority] = await Promise.all([
    side("authority_id", A, { ...input.ctx, authorityId: null }),
    side("supplier_id", S, { ...input.ctx, supplierId: null }),
  ]);
  return ofSupplier && ofAuthority ? { ofSupplier, ofAuthority } : null;
}

/** "Nu" in the whole archive (final §5.4): how many firms the buyer bought from, how many buyers the firm sold to. */
async function readPartners(s: DbSql, tx: Fragment, A: string, S: string): Promise<{ authoritySuppliers: number; supplierAuthorities: number }> {
  const sums = s`d.closing_value > 0 and (d.src = 'contracts' or d.closing_value <= ${DA_PLAFOND_RON})`;
  const [r] = (await s`
    select (select count(distinct d.supplier_id) from ${tx} d where d.authority_id = ${A} and d.supplier_id is not null and ${sums})::int a,
           (select count(distinct d.authority_id) from ${tx} d where d.supplier_id = ${S} and d.authority_id is not null and ${sums})::int s
  `) as unknown as { a: number; s: number }[];
  return { authoritySuppliers: r?.a ?? 0, supplierAuthorities: r?.s ?? 0 };
}

/**
 * Entities with exactly the same name (core.entities.name_normalized) as one
 * side that have records with the other (final §5.4): two CUIs of one
 * institution. Similar names are never proposed.
 */
async function readTwins(s: DbSql, tx: Fragment, A: string, S: string): Promise<FactTwin[]> {
  const twins = (await s`
    select t.id::text id, t.name_display name, t.cui_canonical cui, t.county, case when e.id = ${A} then 'authority' else 'supplier' end role
    from core.entities e join core.entities t on t.name_normalized = e.name_normalized and t.id <> e.id
    where e.id in (${A}, ${S})
    order by t.id limit 20
  `) as unknown as { id: string; name: string; cui: string | null; county: string | null; role: "authority" | "supplier" }[];
  if (!twins.length) return [];
  const authorities = twins.filter((t) => t.role === "authority").map((t) => t.id), suppliers = twins.filter((t) => t.role === "supplier").map((t) => t.id);
  const sums = s`d.closing_value > 0 and (d.src = 'contracts' or d.closing_value <= ${DA_PLAFOND_RON})`;
  const records = (await s`
    select d.authority_id::text a, d.supplier_id::text s, count(*)::int n, min(substr(d.finalization_date, 1, 4)) y1, max(substr(d.finalization_date, 1, 4)) y2
    from ${tx} d
    where ${sums} and ((d.authority_id = any(${s.array(authorities.length ? authorities : ["0"])}::bigint[]) and d.supplier_id = ${S})
       or (d.supplier_id = any(${s.array(suppliers.length ? suppliers : ["0"])}::bigint[]) and d.authority_id = ${A}))
    group by 1, 2
  `) as unknown as { a: string; s: string; n: number; y1: string | null; y2: string | null }[];
  return twins.flatMap((t): FactTwin[] => {
    const r = records.find((x) => t.role === "authority" ? x.a === t.id && x.s === S : x.s === t.id && x.a === A);
    return r ? [{ role: t.role, entityId: t.id, name: t.name, cui: t.cui, county: t.county, count: r.n, yearFirst: year(r.y1), yearLast: year(r.y2) }] : [];
  });
}
