import type { DbSql } from "@seap/db";
import { andAll, groupPredicates, rowPredicates, type PredicateCtx } from "./predicates";
import type { AskSpec } from "./spec";

/*
 * F4, „Doar clienții comuni” (plan §4.6 Motor, final compare §3.4, §5): the
 * pre-step P. The institutions that bought from both compared firms in the
 * selection, read once by the answer (compile.ts case "compare") and by its
 * sources, CSV and captures (runRows), on the same conditions (predicates.ts)
 * without P; PredicateCtx.shared then keeps their records only, everywhere.
 * A window's counts have none (facets.ts SHARED_PARTNERS_COUNTS): each option
 * would have its own P. A module of its own, without the engine's imports.
 */

type Fragment = ReturnType<DbSql>;

/** Whether a question asks for its firms' shared clients (COMPARE_RULES: two firms compared). */
export const asksSharedPartners = (spec: AskSpec, ctx: { comparison: { role: string } | null }): boolean =>
  spec.block === "compare" && spec.filters.sharedPartners === true && ctx.comparison?.role === "supplier";

/** The pre-step's answer: the shared clients, and each firm's selection without them (the card's "59% din totalul firmei", "15 din 73"). */
export interface SharedPrestep {
  ids: string[];
  whole: Map<string, { value: number; count: number; partners: number }>;
}

/**
 * P: the institutions with records of both compared firms in the selection:
 * the question's conditions, an old link's record threshold included, without
 * P itself. `source` is the slim union of the answer (txAggFragment). Grouped
 * once per firm and institution: Erbașu and Terra Gaz, all years, 0.13 s.
 */
export async function sharedPartnersPrestep(sql: DbSql, ctx: PredicateCtx, source: Fragment): Promise<SharedPrestep> {
  const own: PredicateCtx = { ...ctx, shared: null };
  const base = andAll(sql, rowPredicates(own));
  const where = andAll(sql, [base, ...groupPredicates(own, source, base)]);
  const rows = (await sql`
    with g as (
      select d.supplier_id party, d.authority_id other, sum(d.closing_value) v, count(*)::int n
      from ${source} d where ${where} group by 1, 2)
    select g.party::text id, sum(g.v)::text value, sum(g.n)::int n, count(g.other)::int partners,
           (select coalesce(array_agg(p.other::text order by p.other), '{}') from (
              select other from g where other is not null group by other having count(*) = 2) p) ids
    from g group by g.party
  `) as unknown as { id: string; value: string; n: number; partners: number; ids: string[] }[];
  return {
    ids: rows[0]?.ids ?? [],
    whole: new Map(rows.map((r) => [r.id, { value: Number(r.value), count: r.n, partners: r.partners }])),
  };
}
