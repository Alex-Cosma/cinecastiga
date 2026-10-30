import type { DbSql } from "@seap/db";
import { andAll, asksWinners, DA_PLAFOND_RON, groupPredicates, rowPredicates, seatOf, type PredicateCtx } from "./predicates";
import { planRollup, rollupRows } from "./rollups";

/*
 * F5, the ranked winners (plan §4.2, final table §3.3, §3.6, §3.7): the
 * conditions on the firms or institutions of a ranking that come from a
 * relation, not from the firm's own profile. Each is resolved once into a list
 * of ids, before the first query (as the kind's institutions), by the answer
 * (compile.ts), its sources, CSV and captures (runRows), the windows' counts and
 * "Unde e o firmă?" (facets.ts): PredicateCtx.winners. The firm's own years
 * (the archive, the register) stay a semi-join on its profile (newFirmCond).
 *
 * - Furnizori noi (newScope "buyer"): the firm's first record with the named
 *   buyer (all its identities; any channel, any domain, the whole archive) is
 *   in the year chosen or after.
 * - Principalul lor client public (mainClient): over the whole archive and
 *   every channel, the named buyer holds at least half of what the firm won
 *   (entity_profile.total_ron_split, the same records), and the firm has at
 *   least 3 records.
 * - O firmă ia peste jumătate (dominantSupplier): in the selection, the
 *   institution's largest firm (by value, then records, then id) has at least
 *   half of its value, from at least 3 records.
 *
 * The thresholds are fixed (plan §9 F5, table 6): 50% and 3 records. Never a
 * signal: the official ones are "Dependență de o autoritate" and "Concentrare
 * pe un furnizor", on direct acquisitions only.
 */

type Fragment = ReturnType<DbSql>;

/** Half of the money, from at least three records (final table §3.6–§3.7). */
export const RELATION_SHARE = 0.5;
export const RELATION_MIN_RECORDS = 3;

/**
 * The slim union of both channels with the archive's bounds (closing_value > 0, the direct acquisitions up to the
 * analysis ceiling): the records entity_profile sums, which a firm's relation with its buyer is read from whatever
 * channel the question is on.
 */
function everyChannel(sql: DbSql): Fragment {
  return sql`(
    select authority_id, supplier_id, closing_value, finalization_date from marts.da_transactions
    where closing_value > 0 and closing_value <= ${DA_PLAFOND_RON}
    union all
    select authority_id, supplier_id, closing_value, finalization_date from marts.contract_transactions
    where closing_value > 0
  )`;
}

/**
 * The firms of the named buyer (PredicateCtx.buyerIds) a relation keeps: new for it from `since` (their first
 * record with it), and/or whose main public client it is. One read of the buyer's records over its id index
 * (Cluj-Napoca, both identities, the whole archive: 0.13 s).
 */
async function buyerFirms(sql: DbSql, ctx: PredicateCtx): Promise<string[]> {
  const parts: Fragment[] = [sql`true`];
  if (ctx.newFirms?.scope === "buyer") parts.push(sql`b.f >= ${String(ctx.newFirms.since)}`);
  if (ctx.mainClient) parts.push(sql`ep.n_das + ep.n_contracts >= ${RELATION_MIN_RECORDS} and b.v >= ${RELATION_SHARE} * ep.total_ron_split`);
  const rows = (await sql`
    select b.supplier_id::text id
    from (
      select d.supplier_id, min(d.finalization_date) f, sum(d.closing_value) v
      from ${everyChannel(sql)} d
      where d.authority_id = any(${sql.array([...ctx.buyerIds])}::bigint[]) and d.supplier_id is not null
      group by 1
    ) b
    ${ctx.mainClient ? sql`join marts.entity_profile ep on ep.entity_id = b.supplier_id and ep.role = 'supplier'` : sql``}
    where ${andAll(sql, parts)}
    order by 1
  `) as unknown as { id: string }[];
  return rows.map((r) => r.id);
}

/** The largest firm of each institution among pairs (authority_id, supplier_id, v, n): by value, records, then id. */
function topPairs(sql: DbSql, pairs: Fragment): Fragment {
  return sql`(
    select authority_id, supplier_id, v, n, t from (
      select p.authority_id, p.supplier_id, p.v, p.n, sum(p.v) over (partition by p.authority_id) t,
             row_number() over (partition by p.authority_id order by (p.supplier_id is null), p.v desc, p.n desc, p.supplier_id) r
      from ${pairs} p
    ) x where r = 1
  )`;
}
/** The institutions whose largest firm has half of their value from at least three records. */
function dominantOf(sql: DbSql, top: Fragment): Fragment {
  return sql`select t.authority_id from ${top} t
    where t.supplier_id is not null and t.n >= ${RELATION_MIN_RECORDS} and t.v >= ${RELATION_SHARE} * t.t and t.t > 0`;
}

/**
 * Every record of both channels over every year, conditions on the institutions only (their kind, some left out):
 * each institution's pairs are its whole archive, which entity_top_partners holds (its first partners by value,
 * the same sums as agg_pair_year: 0 differences on 19,529 institutions, 29 Oct 2026) and entity_profile its total.
 */
function wholeArchive(ctx: PredicateCtx): boolean {
  const onlyAuthorities = !ctx.population || ctx.population.operator === "and" && ctx.population.groups.every((g) =>
    g.operator === "and" && g.conditions.every((c) => c.field === "authority" && c.op === "not_in"));
  return ctx.plafond === "da-branch" && onlyAuthorities && !ctx.minimumRecords && ctx.cpvPrefixes.length === 0 && ctx.cpvExclude.length === 0
    && !ctx.county && !ctx.authorityId && !ctx.supplierId && ctx.uatSiruta === null && !ctx.singleBidder
    && ctx.minEmployees === null && ctx.maxEmployees === null && ctx.adminSupplierIds === null && !ctx.purchaseKind && !ctx.procedure
    && ctx.purchaseValueMin === null && ctx.purchaseValueMax === null && !ctx.firmSeat && !ctx.seatCounty && !ctx.newFirms
    && ctx.yearFrom === null && ctx.yearTo === null && ctx.monthFrom === null && ctx.monthTo === null && !ctx.comparison && !ctx.shared;
}

/**
 * The pairs (institution, firm, value, records) of a selection: the whole archive's first partners
 * (wholeArchive), agg_pair_year where the rollups answer it, else the records of `source`.
 */
function selectionPairs(sql: DbSql, ctx: PredicateCtx, o: { source: Fragment; rollups: boolean }): { pairs: Fragment; whole: boolean } {
  if (wholeArchive(ctx)) return {
    whole: true,
    pairs: sql`(select tp.entity_id authority_id, tp.partner_entity_id supplier_id, tp.total_ron v, tp.n
      from marts.entity_top_partners tp where tp.role = 'authority')`,
  };
  const plan = o.rollups ? planRollup(ctx, { by: "authority" }) : null;
  if (plan && "source" in plan && (plan.source.table === "entity" || plan.source.table === "pair")) {
    // The pair rollup holds the same rows grouped by both parties (rollups.ts): the selection's own sums per pair.
    const r = rollupRows(sql, { source: { table: "pair" }, filters: plan.filters }, "p");
    return { whole: false, pairs: sql`(select p.authority_id, p.supplier_id, sum(p.v) v, sum(p.n) n from ${r.from} where ${r.where} and p.authority_id is not null group by 1, 2)` };
  }
  const base = andAll(sql, rowPredicates(ctx));
  const where = andAll(sql, [base, ...groupPredicates(ctx, o.source, base)]);
  return { whole: false, pairs: sql`(select d.authority_id, d.supplier_id, sum(d.closing_value) v, count(*) n from ${o.source} d where ${where} and d.authority_id is not null group by 1, 2)` };
}

/**
 * The whole archive's total of an institution: entity_profile, as the pairs of entity_top_partners hold only the
 * first partners. Elsewhere the window sum over every pair.
 */
function withTotals(sql: DbSql, pairs: { pairs: Fragment; whole: boolean }): Fragment {
  if (!pairs.whole) return topPairs(sql, pairs.pairs);
  return sql`(
    select x.authority_id, x.supplier_id, x.v, x.n, ep.total_ron_split t from (
      select p.authority_id, p.supplier_id, p.v, p.n,
             row_number() over (partition by p.authority_id order by p.v desc, p.n desc, p.supplier_id) r
      from ${pairs.pairs} p
    ) x join marts.entity_profile ep on ep.entity_id = x.authority_id and ep.role = 'authority'
    where x.r = 1
  )`;
}

/** The institutions one firm takes half of in the selection `ctx` (without the key itself), as a subquery of their ids. */
export function dominantIdsSql(sql: DbSql, ctx: PredicateCtx, o: { source: Fragment; rollups: boolean }): Fragment {
  return dominantOf(sql, withTotals(sql, selectionPairs(sql, withoutWinners(ctx), o)));
}
/** Each firm's records with the named buyer, over every channel and the whole archive: its first one (f) and their value (v). */
export function buyerRowsSql(sql: DbSql, buyerIds: readonly string[]): Fragment {
  return sql`(
    select d.supplier_id, min(d.finalization_date) f, sum(d.closing_value) v from ${everyChannel(sql)} d
    where d.authority_id = any(${sql.array([...buyerIds])}::bigint[]) and d.supplier_id is not null group by 1
  )`;
}

/** The selection of a relation key: the question's conditions without the winners themselves. */
export const withoutWinners = (ctx: PredicateCtx): PredicateCtx =>
  ({ ...ctx, newFirms: ctx.newFirms?.scope === "buyer" ? null : ctx.newFirms, mainClient: false, dominantSupplier: false, winners: null });

/**
 * Resolve the relation keys of a question into lists (PredicateCtx.winners), in place, before its first query;
 * nothing to do without them. `source` is the slim union of the question's channel (txAggFragment); `rollups`,
 * whether the nightly rollups are built (rollupsReady). National, 2025: 1,027 institutions in 1.7 s from
 * agg_pair_year; every year: 1,191 in 0.06 s from entity_top_partners.
 */
export async function resolveWinners(sql: DbSql, ctx: PredicateCtx, o: { source: Fragment; rollups: boolean }): Promise<void> {
  if (!asksWinners(ctx) || ctx.winners) return;
  const selection = withoutWinners(ctx);
  const suppliers = ctx.newFirms?.scope === "buyer" || ctx.mainClient ? await buyerFirms(sql, ctx) : null;
  let authorities: string[] | null = null;
  if (ctx.dominantSupplier) {
    const rows = (await sql`${dominantOf(sql, withTotals(sql, selectionPairs(sql, selection, o)))} order by 1`) as unknown as { authority_id: string }[];
    authorities = rows.map((r) => String(r.authority_id));
    // Over the whole archive the list is every institution's (entity_top_partners, 1,191): a kind keeps its own only,
    // which its records' condition does anyway, so the drawer reads a few ids, not 1,191 next to the kind's thousands
    // (hospitals: 1; county councils: none; S5 review).
    if (ctx.kindIds) {
      const kind = new Set(ctx.kindIds.map(String));
      authorities = authorities.filter((id) => kind.has(id));
    }
  }
  ctx.winners = { suppliers, authorities };
}

/** A firm's facts on its row (P8): why it is on the list, read for the rows shown. */
export interface FirmFacts {
  /** Its first record in the archive (YYYY-MM-DD), its trade register year, its latest filing's employees and year. */
  first: string | null;
  registered: number | null;
  employees: number | null;
  filed: number | null;
  foreign: boolean;
  /** With a named buyer: its first record with it, and whether the buyer is its main public client. */
  firstHere?: string | null;
  main?: boolean;
}
/** An institution's largest firm in the selection (final table §3.7: on every row, with or without the condition). */
export interface InstitutionFacts {
  top: { id: string; name: string; value: number; count: number; share: number } | null;
}
export type WinnerFacts = FirmFacts | InstitutionFacts;

/**
 * The facts of the rows shown (plan §4.2 P8, data.rowFacts): on firms their years, size and seat and, with a named
 * buyer, their first record with it and whether it is their main public client; on institutions their largest
 * firm in the selection. One read on the ids shown; never part of what a watch compares (answer-core.ts).
 */
export async function rankedFacts(sql: DbSql, ctx: PredicateCtx, o: { dim: "supplier" | "authority"; ids: readonly string[]; source: Fragment; rollups: boolean }):
  Promise<Record<string, WinnerFacts>> {
  if (!o.ids.length) return {};
  const ids = sql.array([...o.ids]);
  if (o.dim === "supplier") {
    const seat = seatOf(sql, ctx.seatColumn);
    const buyer = ctx.buyerIds.length > 0;
    const rows = (await sql`
      select ep.entity_id::text id, substr(ep.first_activity, 1, 10) first, ep.registered_year registered, ep.employees, ep.employees_year filed,
             coalesce(${seat.foreign}, false) "foreign"
             ${buyer ? sql`, substr(b.f, 1, 10) first_here, coalesce(ep.n_das + ep.n_contracts >= ${RELATION_MIN_RECORDS} and b.v >= ${RELATION_SHARE} * ep.total_ron_split, false) main` : sql``}
      from marts.entity_profile ep
      ${buyer ? sql`left join (
        select d.supplier_id, min(d.finalization_date) f, sum(d.closing_value) v from ${everyChannel(sql)} d
        where d.authority_id = any(${sql.array([...ctx.buyerIds])}::bigint[]) and d.supplier_id = any(${ids}::bigint[]) group by 1
      ) b on b.supplier_id = ep.entity_id` : sql``}
      where ep.role = 'supplier' and ep.entity_id = any(${ids}::bigint[])
    `) as unknown as { id: string; first: string | null; registered: number | null; employees: number | null; filed: number | null; foreign: boolean; first_here?: string | null; main?: boolean }[];
    return Object.fromEntries(rows.map((r) => [r.id, {
      first: r.first, registered: r.registered, employees: r.employees, filed: r.filed, foreign: r.foreign,
      ...(buyer ? { firstHere: r.first_here ?? null, main: r.main === true } : {}),
    } satisfies FirmFacts]));
  }
  // The selection's pairs of the institutions shown only: their id index, or the rollup's rows of those ids.
  const pairs = selectionPairs(sql, withoutWinners(ctx), o);
  const shown: Fragment = sql`(select * from ${pairs.pairs} q where q.authority_id = any(${ids}::bigint[]))`;
  const rows = (await sql`
    select t.authority_id::text id, t.supplier_id::text sid, coalesce(ep.name_display, '(fără nume)') nm, t.v, t.n, t.t
    from ${withTotals(sql, { pairs: shown, whole: pairs.whole })} t
    left join marts.entity_profile ep on ep.entity_id = t.supplier_id and ep.role = 'supplier'
  `) as unknown as { id: string; sid: string | null; nm: string; v: string; n: string; t: string }[];
  const facts: Record<string, WinnerFacts> = Object.fromEntries(o.ids.map((id) => [id, { top: null } satisfies InstitutionFacts]));
  for (const r of rows) {
    if (!r.sid || !(Number(r.t) > 0)) continue;
    facts[r.id] = { top: { id: r.sid, name: r.nm, value: Number(r.v), count: Number(r.n), share: Number(r.v) / Number(r.t) } };
  }
  return facts;
}
