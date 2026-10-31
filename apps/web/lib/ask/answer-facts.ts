import { contractAboveValueCap, contractRonValue, type DbSql } from "@seap/db";
import { ground } from "./ground";
import { andAll, employeesCond, firmSeatCond, groupPredicates, procedureCond, purchaseKindCond, rowPredicates, seatCountyCond, type PredicateCtx } from "./predicates";
import {
  FACET_TTL_MS, domainBound, facetStamp, inFacetTransaction, kindOfCode, nationalLive, prepare, procedureOf, runner, sizeOf, timedOut,
  type FacetFailure, type Prepared, type Runner,
} from "./facets";
import { mixRollupReady, mixWhere, monthsWhere } from "./series-rollups";
import { PROCEDURE_ORDER, VALUE_RANGES } from "./purchase";
import { questionKey, type QuestionSpec } from "./question-ui";
import { ABOVE_CAP_ROWS, type AboveCapRow, type BarsResult, type MixResult, type MixRow, type PodiumResult } from "./facet-parts";
import { podiumFactsOf, type PodiumFactRows, type PodiumProfileRows } from "./entity-card";
import { PODIUM_PLACES } from "./entity-card-shared";
import { factsSource } from "./trend-partition";
import { rankedFacts, type FirmFacts } from "./winners";
import type { AskSpec } from "./spec";
import { martColumns } from "./mart-columns";
import { readPerCapitaPopulations } from "./per-capita";
import { assembleMapFacts, DOMAIN_LIVE_ROWS, domainOnIndex, localAdminMap, mapFactsSql, mapRollupFilters, mapRollupReady, mapRows, type MapFacts, type MapFactsRow } from "./map-facts";
import { cpvCoverReady, rollupsReady } from "./rollups";

/*
 * Facts asked about an answer once it is on screen (F3), behind the same
 * route, pool, slots and limits as the windows' counts (POST /api/ask/facets,
 * lib/ask/facets.ts), so they never delay the answer and never hold one of its
 * connections:
 * - `mix`, stat's „Din care” (plan §4.1, final stat §3.7): the total by kind of
 *   purchase, procedure, size of the whole purchase and offers, from
 *   agg_national_mix where it answers, else one grouped pass (grouping sets)
 *   over the answer's own records;
 * - `bars`, the evolution's bar facts (final timeseries §3.10): each bar's
 *   largest record (agg_months, or the live grouping of an anchored selection)
 *   and the contracts above the 1 bn lei analysis cap of each bar's period,
 *   on the source contracts (contractAboveValueCap, @seap/db), counted and the
 *   largest named; never summed into a bar.
 * The conditions are the answer's (predicates.ts, prepare): a row of a tab is
 * the answer after choosing it („Doar acestea ›”), to the leu.
 */

type Fragment = ReturnType<DbSql>;

/** The PRECOMPUTE.md entries these facts wait on where the rollups do not answer a national selection. */
export const MIX_LIVE = "„Din care” pe o selecție națională fără rollup";
export const BARS_LIVE = "Cea mai mare înregistrare a barelor, pe o selecție națională fără rollup";
export const MAP_LIVE = "Faptele județelor pe o hartă națională fără rollup (domeniu, luni, mărime)";

const kept = new Map<string, { value: MixResult | BarsResult | MapFacts | PodiumResult; at: number }>();
/** Facts kept at most (one per answer: a few numbers). */
const FACT_ENTRIES = 200;
export function forgetAnswerFacts(): void { kept.clear(); }

/**
 * One fact of an answer: kept for 10 minutes on the question, the data
 * checkpoint and the marts build (as the counts), else computed in a read-only
 * transaction with the counts' limit. A limit passed is `{ timeout: true }`.
 */
async function answerFact<T extends MixResult | BarsResult | MapFacts | PodiumResult>(
  sql: DbSql, spec: AskSpec, part: T["part"], signal: AbortSignal | undefined,
  work: (tx: DbSql, p: Prepared, run: Runner, mixReady: boolean, checkpoint: string | null, started: number) => Promise<T | FacetFailure>,
  /** What else the fact depends on (the podium's ids), in its key. */
  also: string = "",
): Promise<T | FacetFailure> {
  const stamp = await facetStamp(sql);
  const key = stamp.build ? JSON.stringify([stamp.build, stamp.checkpoint, part, also, questionKey(spec as unknown as QuestionSpec)]) : null;
  const hit = key ? kept.get(key) : undefined;
  if (key && hit && Date.now() - hit.at <= FACET_TTL_MS) return { ...(hit.value as T), tookMs: 0 };
  const started = Date.now();
  try {
    const grounding = await ground(sql, spec.filters, spec.population);
    // Probed with the pool, before the transaction (series-rollups.ts).
    const mixReady = await mixRollupReady(sql);
    const result = await inFacetTransaction(sql, async (tx) => {
      const p = await prepare(tx, spec, grounding);
      if ("error" in p) return p;
      return await work(tx, p, runner(signal), mixReady, stamp.checkpoint, started);
    });
    if (key && "part" in result) {
      kept.delete(key);
      kept.set(key, { value: result, at: Date.now() });
      for (const oldest of kept.keys()) { if (kept.size <= FACT_ENTRIES) break; kept.delete(oldest); }
    }
    return result;
  } catch (e) {
    if (timedOut(e)) return { timeout: true };
    throw e;
  }
}

/**
 * The records of a live composition: both marts with the columns a tab groups
 * by (the slim union has none of them), or the one the stream keeps.
 */
function mixSource(sql: DbSql, dataset: Prepared["dataset"]): Fragment {
  const da = sql`
    select authority_id, supplier_id, county, cpv_code, closing_value, finalization_date, 'da'::text src,
           null::text procedure_type, null::numeric contract_value_full, null::boolean is_single_bidder
    from marts.da_transactions`;
  const contracts = sql`
    select authority_id, supplier_id, county, cpv_code, closing_value, finalization_date, 'contracts'::text src,
           procedure_type, contract_value_full, is_single_bidder
    from marts.contract_transactions`;
  return dataset === "da" ? sql`(${da})` : dataset === "contracts" ? sql`(${contracts})` : sql`(${da} union all ${contracts})`;
}

interface MixGrouped { gk: number; gp: number; gs: number; go: number; kind: string | null; proc: string | null; size: string | null; offers: string | null; v: string; n: string }

/** „Din care” of a total (stat): the composition of its selection, or why it is not computed now. */
export async function mixFacts(sql: DbSql, spec: AskSpec, opts: { signal?: AbortSignal } = {}): Promise<MixResult | FacetFailure> {
  if (spec.block !== "stat") return { error: "„Din care” descrie un total." };
  // Probed with the pool, before the transaction (rollups.ts).
  const cover = await rollupsReady(sql) && await cpvCoverReady(sql);
  return await answerFact<MixResult>(sql, spec, "mix", opts.signal, async (tx, p, run, mixReady, checkpoint, started) => {
    const rolled = mixReady ? mixWhere(tx, p.ctx, "p") : null;
    let rows: MixGrouped[];
    // The tabs' groupings over the same rows, once (grouping sets on the aliases: a parameter repeated in an
    // expression of the GROUP BY would not match its select-list twin).
    const grouped = (from: Fragment, n: Fragment): Fragment => tx`
      select grouping(kind) gk, grouping(proc) gp, grouping(size) gs, grouping(offers) go, kind, proc, size, offers,
             coalesce(sum(v), 0) v, ${n} n
      from ${from} x
      group by grouping sets ((kind), (proc), (size), (offers))`;
    if (rolled && "where" in rolled) {
      rows = await run<MixGrouped>(grouped(tx`(
        select ${kindOfCode(tx, tx`p.cpv2`)} kind,
               (case when p.src = 'da' then 'da' else ${procedureOf(tx, tx`p.procedure_type`)} end) proc,
               p.size::text size, (case when p.src = 'contracts' then coalesce(p.offers::text, 'unknown') end) offers, p.v v, p.n n
        from marts.agg_national_mix p where ${rolled.where}
      )`, tx`sum(n)`));
    } else {
      // A national selection no index anchors and no rollup answers reads the direct acquisitions of every
      // institution (with a domain 2.8–6.2 s, with employees 6.9 s): PRECOMPUTE.md, as the windows' counts (F3f-national-live).
      // A domain the code's covering index bounds is read on it (S5 PRE-answers: medicines 2025 0.34 s; DOMAIN_LIVE_ROWS).
      if (nationalLive(p) && !(await domainBound(tx, p, cover, DOMAIN_LIVE_ROWS))) return { precompute: MIX_LIVE };
      const source = mixSource(tx, p.dataset);
      const base = andAll(tx, rowPredicates(p.ctx));
      const where = andAll(tx, [base, ...groupPredicates(p.ctx, source, base)]);
      const whole: Fragment = p.ctx.plafond === "strict" ? tx`d.closing_value` : tx`coalesce(d.contract_value_full, d.closing_value)`;
      rows = await run<MixGrouped>(grouped(tx`(
        select ${kindOfCode(tx, tx`d.cpv_code`)} kind,
               (case when d.src = 'da' then 'da' else ${procedureOf(tx, tx`d.procedure_type`)} end) proc,
               ${sizeOf(tx, whole)} size, (case when d.src = 'contracts' then coalesce(d.is_single_bidder::text, 'unknown') end) offers,
               d.closing_value v
        from ${source} d where ${where}
      )`, tx`count(*)`));
    }
    return { ...assembleMix(rows), checkpoint, tookMs: Date.now() - started };
  });
}

const OFFERS_KEYS: Record<string, string> = { true: "one", false: "several", unknown: "unknown" };

/** The grouped rows as the tabs' rows, each share of the total's value (of the contracts', on the offers tab). */
export function assembleMix(rows: readonly MixGrouped[]): Omit<MixResult, "checkpoint" | "tookMs"> {
  const tab = (pick: (r: MixGrouped) => string | null | undefined) => {
    const out = new Map<string, { n: number; v: number }>();
    for (const r of rows) {
      const key = pick(r);
      if (key === undefined || key === null) continue;
      const at = out.get(key) ?? { n: 0, v: 0 };
      out.set(key, { n: at.n + Number(r.n), v: at.v + Number(r.v) });
    }
    return out;
  };
  const kinds = tab((r) => Number(r.gk) === 0 ? r.kind ?? "none" : undefined);
  const procedures = tab((r) => Number(r.gp) === 0 ? r.proc : undefined);
  const sizes = tab((r) => Number(r.gs) === 0 ? r.size : undefined);
  const offers = tab((r) => Number(r.go) === 0 && r.offers !== null ? OFFERS_KEYS[r.offers] : undefined);
  const total = [...kinds.values()].reduce((t, x) => ({ n: t.n + x.n, value_ron: t.value_ron + x.v }), { n: 0, value_ron: 0 });
  const rowsOf = (map: Map<string, { n: number; v: number }>, order: readonly string[], over: number): MixRow[] =>
    order.filter((key) => (map.get(key)?.n ?? 0) > 0).map((key) => {
      const at = map.get(key)!;
      return { value: key, n: at.n, value_ron: at.v, share: over > 0 ? at.v / over : 0 };
    });
  const contracts = [...offers.values()].reduce((t, x) => t + x.v, 0);
  const kindOrder = [...kinds.entries()].filter(([key]) => key !== "none").sort((a, b) => b[1].v - a[1].v).map(([key]) => key);
  const offerRows = rowsOf(offers, ["one", "several", "unknown"], contracts);
  return {
    part: "mix",
    kind: rowsOf(kinds, [...kindOrder, "none"], total.value_ron),
    procedure: rowsOf(procedures, ["da", ...PROCEDURE_ORDER], total.value_ron),
    size: rowsOf(sizes, VALUE_RANGES.map((_, i) => String(i)), total.value_ron),
    offers: offerRows.length ? { known: offerRows.filter((r) => r.value !== "unknown").reduce((t, r) => t + r.share, 0), rows: offerRows } : null,
    total,
  };
}

/**
 * The selection on the source contracts above the cap (alias c, award a,
 * authority entity ae), as the contract mart writes its rows (marts.ts: the
 * award's CPV, procedure and authority, the authority's county, the contract's
 * date); null where it cannot be said there (a precise selection, a threshold,
 * the single bidder, a size whose bound is under the cap, the direct acquisitions).
 */
function aboveCapWhere(sql: DbSql, ctx: PredicateCtx): Fragment | null {
  if (ctx.plafond === "strict" || ctx.population || ctx.minimumRecords || ctx.singleBidder || ctx.comparison || ctx.purchaseValueMax !== null) return null;
  // The contract's day in Romania, as the contract mart writes finalization_date (marts.ts, time zone Europe/Bucharest).
  const day = sql`to_char(c.contract_date at time zone 'Europe/Bucharest', 'YYYY-MM-DD')`;
  const parts: Fragment[] = [contractAboveValueCap(sql) as unknown as Fragment];
  const month = (year: number, m: number) => `${year}-${String(m).padStart(2, "0")}`;
  if (ctx.yearFrom !== null) parts.push(ctx.monthFrom !== null ? sql`substr(${day}, 1, 7) >= ${month(ctx.yearFrom, ctx.monthFrom)}` : sql`substr(${day}, 1, 4) >= ${String(ctx.yearFrom)}`);
  if (ctx.yearTo !== null) parts.push(ctx.monthTo !== null ? sql`substr(${day}, 1, 7) <= ${month(ctx.yearTo, ctx.monthTo)}` : sql`substr(${day}, 1, 4) <= ${String(ctx.yearTo)}`);
  if (ctx.seriesMonths) parts.push(sql`substr(${day}, 6, 2) between ${String(ctx.seriesMonths[0]).padStart(2, "0")} and ${String(ctx.seriesMonths[1]).padStart(2, "0")}`);
  if (ctx.purchaseValueMin !== null) parts.push(sql`${contractRonValue(sql) as unknown as Fragment} >= ${ctx.purchaseValueMin}::numeric`);
  if (ctx.county) parts.push(sql`ae.county = ${ctx.county}`);
  const like = (prefixes: readonly string[]) => prefixes.map((x) => sql`a.cpv_code like ${x + "%"}`).reduce((x, y) => sql`${x} or ${y}`);
  if (ctx.cpvPrefixes.length) parts.push(sql`(${like(ctx.cpvPrefixes)})`);
  if (ctx.cpvExclude.length) parts.push(sql`not coalesce(${like(ctx.cpvExclude)}, false)`);
  if (ctx.purchaseKind) parts.push(purchaseKindCond(sql, ctx.purchaseKind, sql`a.cpv_code`));
  if (ctx.procedure) parts.push(procedureCond(sql, ctx.procedure, sql`a.procedure_type`));
  if (ctx.kind) parts.push(sql`a.authority_entity_id = any(${sql.array([...ctx.kindIds!])}::bigint[])`);
  if (ctx.authorityId) parts.push(sql`a.authority_entity_id = ${ctx.authorityId}`);
  if (ctx.uatSiruta !== null) parts.push(sql`a.authority_entity_id = any(${sql.array(ctx.uatAuthorityIds)}::bigint[])`);
  // A winner of the contract: the firm, the person's firms, the band of employees (any of its winners).
  const winner = (cond: Fragment): Fragment => sql`exists (select 1 from core.contract_winners cw where cw.contract_id = c.id and ${cond})`;
  if (ctx.supplierId) parts.push(winner(sql`cw.entity_id = ${ctx.supplierId}`));
  if (ctx.adminSupplierIds !== null) parts.push(winner(sql`cw.entity_id = any(${sql.array(ctx.adminSupplierIds)}::bigint[])`));
  if (ctx.minEmployees !== null || ctx.maxEmployees !== null) parts.push(winner(employeesCond(sql, ctx.minEmployees, ctx.maxEmployees, sql`cw.entity_id`)));
  // F4: the winner's seat against the buyer's county (firmSeat), or its own county (seatCounty), as on the records (S4 review:
  // „cu sediul în străinătate” listed the same contracts as every seat).
  if (ctx.firmSeat) parts.push(winner(firmSeatCond(sql, ctx.firmSeat, ctx.seatColumn, { supplier: sql`cw.entity_id`, county: sql`ae.county` })));
  if (ctx.seatCounty) parts.push(winner(seatCountyCond(sql, ctx.seatCounty, ctx.seatColumn, sql`cw.entity_id`)));
  return andAll(sql, parts);
}

/** The facts of an evolution's bars, by the bar's key ("2025", "2025-03"). */
export async function barFacts(sql: DbSql, spec: AskSpec, opts: { signal?: AbortSignal } = {}): Promise<BarsResult | FacetFailure> {
  if (spec.block !== "timeseries") return { error: "Faptele barelor descriu o evoluție." };
  const month = spec.timeseries?.grain === "month";
  const cover = await rollupsReady(sql) && await cpvCoverReady(sql);
  return await answerFact<BarsResult>(sql, spec, "bars", opts.signal, async (tx, p, run, mixReady, checkpoint, started) => {
    const months = mixReady ? monthsWhere(tx, p.ctx, "p") : null;
    let largest: { k: string | null; src: "da" | "contracts"; mx: string | null }[] | null = null;
    if (months && "where" in months) {
      largest = await run(tx`
        select ${month ? tx`p.y || '-' || p.m` : tx`p.y`} k, p.src, max(p.mx) mx from marts.agg_months p where ${months.where} group by 1, 2`);
    } else if (!nationalLive(p) || await domainBound(tx, p, cover)) {
      const source = mixSource(tx, p.dataset);
      const base = andAll(tx, rowPredicates(p.ctx));
      largest = await run(tx`
        select substr(d.finalization_date, 1, ${month ? 7 : 4}) k, d.src, max(d.closing_value) mx
        from ${source} d where ${andAll(tx, [base, ...groupPredicates(p.ctx, source, base)])} group by 1, 2`);
    }
    const max: BarsResult["max"] = largest ? {} : null;
    for (const row of largest ?? []) {
      if (!row.k || row.mx === null) continue;
      const value = Number(row.mx), at = max![row.k];
      if (!at || value > at.value) max![row.k] = { value, src: row.src };
    }
    const where = aboveCapWhere(tx, p.ctx);
    const above: BarsResult["above"] = where ? {} : null;
    if (where) {
      const rows = await run<{ k: string; n: number; top: { id: string | null; t: string | null; v: string }[] }>(tx`
        select substr(to_char(c.contract_date at time zone 'Europe/Bucharest', 'YYYY-MM-DD'), 1, ${month ? 7 : 4}) k, count(*)::int n,
               (jsonb_agg(jsonb_build_object('id', c.ca_notice_contract_id::text, 't', coalesce(c.title, a.title), 'v', ${contractRonValue(tx) as unknown as Fragment}::text)
                 order by ${contractRonValue(tx) as unknown as Fragment} desc, c.id)) top
        from core.contracts c
        join core.awards a on a.ca_notice_id = c.ca_notice_id
        left join core.entities ae on ae.id = a.authority_entity_id
        where ${where}
        group by 1`);
      for (const row of rows) {
        const list: AboveCapRow[] = row.top.slice(0, ABOVE_CAP_ROWS).filter((x) => x.id).map((x) => ({ natId: x.id!, title: x.t, value: Number(x.v) }));
        above![row.k] = { n: row.n, rows: list };
      }
    }
    return { part: "bars", max, above, checkpoint, tookMs: Date.now() - started };
  });
}

/**
 * The county facts of a map (F5, plan §4.4, map final §3.7–§3.11; lib/ask/map-facts.ts): each county's seat split,
 * largest buyer, number of buyers and largest record, and beside a firm or a person the same selection without them
 * („Cota firmei”), from agg_map_year where it answers, else live on the answer's records. The map of the local
 * administrations groups by the county each one administers.
 */
export async function mapFacts(sql: DbSql, spec: AskSpec, opts: { signal?: AbortSignal } = {}): Promise<MapFacts | FacetFailure> {
  if (spec.block !== "map") return { error: "Faptele județelor descriu o hartă." };
  // Probed with the pool, before the transaction (mart-columns.ts, map-facts.ts).
  const [ready, columns, rollups] = await Promise.all([mapRollupReady(sql), martColumns(sql), rollupsReady(sql)]);
  const cover = rollups && await cpvCoverReady(sql);
  return await answerFact<MapFacts>(sql, spec, "map", opts.signal, async (tx, p, run, _mixReady, checkpoint, started) => {
    const local = localAdminMap(p.ctx) ? await readPerCapitaPopulations(tx) : null;
    // Null where neither agg_map_year nor an index answers (PRECOMPUTE.md): a national selection with months or a size,
    // or a domain of more records than its code index reads in the bar (domainOnIndex).
    const facts = async (ctx: PredicateCtx) => {
      const rolled = ready ? mapRollupFilters(ctx, p.dataset) : null;
      const national = !rolled && nationalLive({ ...p, ctx });
      // S5 PRE-answers: on the code's covering index (da_tx_cpv_cover_idx) a domain's direct acquisitions come from the
      // index alone, with the planner's own plan (medicines 2024–2025: 0.55 s warm, against 2.0 s on the plain code
      // index), up to DOMAIN_LIVE_ROWS; before that build, MAP_DOMAIN_ROWS on the plain code index.
      if (national && !(rollups && await domainOnIndex(tx, ctx, p.dataset, cover ? DOMAIN_LIVE_ROWS : undefined))) return null;
      const rows = mapRows(tx, { ctx, dataset: p.dataset, rolled, seat: columns.seat, local });
      // Without the covering index the planner reads both marts' covering id indexes whole for a domain (9 s for
      // medicines 2024–2025, at either random_page_cost); on the code index it reads the domain's rows only (2.0 s):
      // this statement only.
      const steer = national && !cover;
      if (steer) await tx.unsafe("set local enable_seqscan = off; set local enable_indexonlyscan = off");
      try {
        return assembleMapFacts(await run<MapFactsRow>(mapFactsSql(tx, rows)), columns.seat);
      } finally {
        if (steer) await tx.unsafe("set local enable_seqscan = on; set local enable_indexonlyscan = on");
      }
    };
    const counties = await facts(p.ctx);
    if (!counties) return { precompute: MAP_LIVE };
    // „Cota firmei” (map final §3.10): the same selection without the firm or the person's firms, county by county.
    const firm = Boolean(p.ctx.supplierId || p.ctx.adminSupplierIds);
    const base = firm ? await facts({ ...p.ctx, supplierId: null, adminSupplierIds: null }) : null;
    for (const [county, f] of Object.entries(counties)) {
      const b = base?.[county];
      if (b) f.base = { value: b.value, count: b.count };
    }
    return { part: "map", counties, seat: columns.seat, share: Boolean(base), checkpoint, tookMs: Date.now() - started };
  });
}

/**
 * The facts of the podium's places (F6c, final entity_card §3.9): of each place's value the part that comes from
 * contracts with several winners, its largest record in the selection, and the firm's latest filing (employees and
 * its year) and first activity. The records are the answer's own (the ranking's selection, a place's records only
 * through the id indexes), asked once the podium is drawn: they never delay it. `ids`: the places, at most three.
 */
export async function podiumFacts(sql: DbSql, spec: AskSpec, ids: readonly string[], opts: { signal?: AbortSignal } = {}): Promise<PodiumResult | FacetFailure> {
  if (spec.block !== "entity_card" || spec.rankBy !== "value") return { error: "Faptele locurilor descriu clasamentul „Cine conduce?” pe valoare." };
  const places = [...new Set(ids)].filter((id) => /^\d{1,18}$/.test(id)).slice(0, PODIUM_PLACES);
  if (places.length === 0) return { error: "Lipsesc locurile." };
  const role = spec.dim === "supplier" ? "supplier" : "authority";
  return await answerFact<PodiumResult>(sql, spec, "podium", opts.signal, async (tx, p, run, _mixReady, checkpoint, started) => {
    const source = factsSource(tx, p.dataset, false, true);
    const id = role === "supplier" ? tx`d.supplier_id` : tx`d.authority_id`;
    // The band of CÂȘTIGĂTORII is the list's, not a selection of the records (p.ctx holds it as the records' size): a place passes it already.
    // The record threshold is counted over the same rows, as the ranking's whereFrag does: a place's facts are its ranked records'.
    const selection = { ...p.ctx, minEmployees: null, maxEmployees: null };
    const base = andAll(tx, rowPredicates(selection));
    const where = andAll(tx, [base, ...groupPredicates(selection, source, base)]);
    const records = await run<PodiumFactRows>(tx`
      select ${id}::text id, d.src collate "C" largest_src, max(d.closing_value)::text largest,
             coalesce(sum(d.closing_value) filter (where d.n_winners > 1), 0)::text joint
      from ${source} d
      where ${where} and ${id} = any(${tx.array(places)}::bigint[])
      group by 1, 2
    `);
    const profiles = await run<PodiumProfileRows>(tx`
      select ep.entity_id::text id, ep.employees, ep.employees_year, ep.first_activity
      from marts.entity_profile ep where ep.role = ${role} and ep.entity_id = any(${tx.array(places)}::bigint[])
    `);
    // The data's latest filing year (18 ms warm on local seap, kept with the facts per build): an old balance sheet is old against it.
    const [latest] = role === "supplier"
      ? await run<{ y: number | null }>(tx`select max(ep.employees_year) y from marts.entity_profile ep where ep.role = 'supplier'`) : [];
    const balanceYear = latest?.y === null || latest?.y === undefined ? null : Number(latest.y);
    // „Firme noi” (S6): the firm's register year and its first record with the named buyer, as the ranking's rows read them.
    const chosen = role === "supplier" && p.ctx.newFirms
      ? await rankedFacts(tx, p.ctx, { dim: "supplier", ids: places, source, rollups: false }) : null;
    const facts = podiumFactsOf(records, profiles, places).map((fact) => {
      const firm = chosen?.[fact.entityId] as FirmFacts | undefined;
      return firm ? { ...fact, registeredYear: firm.registered, ...(firm.firstHere !== undefined ? { firstHere: firm.firstHere } : {}) } : fact;
    });
    return { part: "podium", places: facts, balanceYear, checkpoint, tookMs: Date.now() - started };
  }, places.join(","));
}
