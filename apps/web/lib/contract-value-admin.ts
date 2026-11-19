import { createDb, type DbSql } from "@seap/db";

/*
 * Admin → Procesare → „Contracte peste 1 mld. lei” (owner, 19 November 2026; migration 0113). The list is the last
 * processing run's review (marts.contract_value_review) beside the administrators' decisions as they stand now
 * (app.contract_value_decisions): a decision takes effect at the next processing run, and the list says so.
 */
export type ValueDecision = "include" | "exclude";
export interface ReviewedContract {
  natId: string; title: string; authorityId: string | null; authority: string; valueRon: string; contractDate: string | null; nWinners: number;
  /** The last run's answer and why. */
  admitted: boolean; guard: string | null; runDecision: string | null;
  /** The decision as it stands now; `pending` when the last run has not applied it yet. */
  decision: ValueDecision | null; reason: string | null; decidedBy: string | null; pending: boolean;
  /** NULL for the contracts known at the first review. */
  firstSeenAt: string | null;
}
export interface ContractValueReviewList { waiting: number; held: number; counted: number; rows: ReviewedContract[] }

// The site's shared pool (createDb without arguments).
const db = (): DbSql => createDb().sql;

/** Every contract above the cap the last run reviewed: those held without a decision first, then the newest. */
export async function contractValueReviewList(q: DbSql = db()): Promise<ContractValueReviewList> {
  const rows = await q`
    select vr.contract_nat_id::text nat_id, trim_scale(vr.value_ron)::text value_ron, vr.admitted, vr.guard, vr.decision run_decision,
      case when vr.first_seen_at > 'epoch'::timestamptz then vr.first_seen_at end first_seen_at,
      d.decision, d.reason, d.decided_by, d.decision is distinct from vr.decision pending,
      left(regexp_replace(coalesce(nullif(c.title, ''), a.title, ''), '\\s+', ' ', 'g'), 220) title,
      to_char(c.contract_date at time zone 'Europe/Bucharest', 'YYYY-MM-DD') contract_date,
      a.authority_entity_id::text authority_id, coalesce(e.name_display, '') authority,
      (select count(distinct w.entity_id)::int from core.contract_winners w where w.contract_id = c.id) n_winners
    from marts.contract_value_review vr
    join core.contracts c on c.ca_notice_contract_id = vr.contract_nat_id
    join core.awards a on a.ca_notice_id = c.ca_notice_id
    left join core.entities e on e.id = a.authority_entity_id
    left join app.contract_value_decisions d on d.contract_nat_id = vr.contract_nat_id
    order by (not vr.admitted and d.decision is null) desc, vr.first_seen_at desc, vr.value_ron desc, vr.contract_nat_id`;
  const list = rows.map((r): ReviewedContract => ({
    natId: String(r.nat_id), title: String(r.title ?? ""), authorityId: r.authority_id == null ? null : String(r.authority_id), authority: String(r.authority ?? ""),
    valueRon: String(r.value_ron), contractDate: (r.contract_date as string | null) ?? null, nWinners: Number(r.n_winners ?? 0),
    admitted: r.admitted === true, guard: (r.guard as string | null) ?? null, runDecision: (r.run_decision as string | null) ?? null,
    decision: (r.decision as ValueDecision | null) ?? null, reason: (r.reason as string | null) ?? null, decidedBy: (r.decided_by as string | null) ?? null,
    pending: r.pending === true,
    firstSeenAt: r.first_seen_at instanceof Date ? r.first_seen_at.toISOString() : (r.first_seen_at as string | null) ?? null,
  }));
  return {
    waiting: list.filter((r) => !r.admitted && r.decision === null).length,
    held: list.filter((r) => !r.admitted).length, counted: list.filter((r) => r.admitted).length, rows: list,
  };
}

export const VALUE_REASON_MAX = 300;

/**
 * An administrator's decision on a reviewed contract: 'include' counts it whatever the guard says, 'exclude' keeps it
 * out, 'clear' returns it to the automatic rule. False when the contract is not in the last review (never above the
 * cap, or gone). The totals change at the next processing run.
 */
export async function decideContractValue(natId: string, decision: ValueDecision | "clear", reason: string, by: string, q: DbSql = db()): Promise<boolean> {
  if (!/^\d{1,18}$/.test(natId)) return false;
  if (decision === "clear") {
    const gone = await q`delete from app.contract_value_decisions d where d.contract_nat_id = ${natId}
      and exists (select 1 from marts.contract_value_review vr where vr.contract_nat_id = d.contract_nat_id) returning 1`;
    return gone.length === 1;
  }
  const text = reason.trim().slice(0, VALUE_REASON_MAX);
  if (!text) return false;
  const rows = await q`
    insert into app.contract_value_decisions (contract_nat_id, decision, reason, decided_by)
    select vr.contract_nat_id, ${decision}, ${text}, ${by} from marts.contract_value_review vr where vr.contract_nat_id = ${natId}
    on conflict (contract_nat_id) do update set decision = excluded.decision, reason = excluded.reason,
      decided_by = excluded.decided_by, decided_at = clock_timestamp()
    returning 1`;
  return rows.length === 1;
}
