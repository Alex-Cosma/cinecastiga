import { contractRonValue, createDb, type DbSql } from "@seap/db";

/*
 * Admin → Procesare → „Valori de contract verificate” (owner, 19 November 2026; migration 0113). The list is the last
 * processing run's review (marts.contract_value_review) beside the administrators' decisions as they stand now
 * (app.contract_value_decisions): a decision takes effect at the next processing run, and the list says so.
 *
 * Owner, 26 November 2026 (migration 0116): an administrator can take out a contract of any size, by its SEAP number,
 * as a probable error of its value. Such a contract enters the review at the next run; until then the list shows the
 * decision as waiting.
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
  /** In the last run's review. False for a contract an administrator took out since: the next run adds it. */
  reviewed: boolean;
}
export interface ContractValueReviewList { waiting: number; held: number; counted: number; rows: ReviewedContract[] }

// The site's shared pool (createDb without arguments).
const db = (): DbSql => createDb().sql;

/** Every contract the last run reviewed and every one decided since: those held without a decision first, then the newest. */
export async function contractValueReviewList(q: DbSql = db()): Promise<ContractValueReviewList> {
  const rows = await q`
    select k.nat::text nat_id, trim_scale(coalesce(vr.value_ron, ${contractRonValue(q)}, 0))::text value_ron,
      coalesce(vr.admitted, true) admitted, vr.guard, vr.decision run_decision, vr.contract_nat_id is not null reviewed,
      case when vr.first_seen_at > 'epoch'::timestamptz and vr.value_ron > 1000000000 then vr.first_seen_at end first_seen_at,
      d.decision, d.reason, d.decided_by, d.decision is distinct from vr.decision pending,
      left(regexp_replace(coalesce(nullif(c.title, ''), a.title, ''), '\\s+', ' ', 'g'), 220) title,
      to_char(c.contract_date at time zone 'Europe/Bucharest', 'YYYY-MM-DD') contract_date,
      a.authority_entity_id::text authority_id, coalesce(e.name_display, '') authority,
      (select count(distinct w.entity_id)::int from core.contract_winners w where w.contract_id = c.id) n_winners
    from (select contract_nat_id nat from marts.contract_value_review union select contract_nat_id from app.contract_value_decisions) k
    join core.contracts c on c.ca_notice_contract_id = k.nat
    join core.awards a on a.ca_notice_id = c.ca_notice_id
    left join core.entities e on e.id = a.authority_entity_id
    left join marts.contract_value_review vr on vr.contract_nat_id = k.nat
    left join app.contract_value_decisions d on d.contract_nat_id = k.nat
    order by (vr.admitted is false and d.decision is null) desc, d.decision is distinct from vr.decision desc,
      vr.first_seen_at desc nulls first, vr.value_ron desc nulls last, k.nat`;
  const list = rows.map((r): ReviewedContract => ({
    natId: String(r.nat_id), title: String(r.title ?? ""), authorityId: r.authority_id == null ? null : String(r.authority_id), authority: String(r.authority ?? ""),
    valueRon: String(r.value_ron), contractDate: (r.contract_date as string | null) ?? null, nWinners: Number(r.n_winners ?? 0),
    admitted: r.admitted === true, guard: (r.guard as string | null) ?? null, runDecision: (r.run_decision as string | null) ?? null,
    decision: (r.decision as ValueDecision | null) ?? null, reason: (r.reason as string | null) ?? null, decidedBy: (r.decided_by as string | null) ?? null,
    pending: r.pending === true,
    firstSeenAt: r.first_seen_at instanceof Date ? r.first_seen_at.toISOString() : (r.first_seen_at as string | null) ?? null,
    reviewed: r.reviewed === true,
  }));
  return {
    waiting: list.filter((r) => !r.admitted && r.decision === null).length,
    held: list.filter((r) => !r.admitted).length, counted: list.filter((r) => r.admitted && r.reviewed).length, rows: list,
  };
}

export const VALUE_REASON_MAX = 300;

/**
 * An administrator's decision on a contract: 'exclude' keeps it out of the totals, whatever its size (26 November
 * 2026); 'include' counts one the last review holds, whatever the guard says; 'clear' returns it to the automatic rule.
 * False when there is no such contract, or, for 'include', when it is not in the last review. The totals change at the
 * next processing run.
 */
export async function decideContractValue(natId: string, decision: ValueDecision | "clear", reason: string, by: string, q: DbSql = db()): Promise<boolean> {
  if (!/^\d{1,18}$/.test(natId)) return false;
  if (decision === "clear") {
    const gone = await q`delete from app.contract_value_decisions d where d.contract_nat_id = ${natId} returning 1`;
    return gone.length === 1;
  }
  const text = reason.trim().slice(0, VALUE_REASON_MAX);
  if (!text) return false;
  const rows = await q`
    insert into app.contract_value_decisions (contract_nat_id, decision, reason, decided_by)
    select c.ca_notice_contract_id, ${decision}, ${text}, ${by} from core.contracts c where c.ca_notice_contract_id = ${natId}
      and (${decision} = 'exclude' or exists (select 1 from marts.contract_value_review vr where vr.contract_nat_id = c.ca_notice_contract_id))
    on conflict (contract_nat_id) do update set decision = excluded.decision, reason = excluded.reason,
      decided_by = excluded.decided_by, decided_at = clock_timestamp()
    returning 1`;
  return rows.length === 1;
}
