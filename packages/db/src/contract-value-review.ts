import type { DbSql } from './client.js';
import { canonicalContract, contractHasSupplier, CONTRACT_VALUE_CAP_RON } from './contract-identity.js';
import { contractRonValue } from './contract-money.js';
import { contractKind, contractReportable } from './contract-reporting.js';
type ReviewSql = DbSql | Parameters<Parameters<DbSql['begin']>[1]>[0];

/*
 * Contracts above CONTRACT_VALUE_CAP_RON (owner, 19 November 2026; migration 0113). Until then the cap kept every one
 * of them out of the totals; the review of the 94 it held in production found 81 real ones and 3 values a thousand
 * times too large. Now a contract above the cap is counted unless its own award notice contradicts its value (the
 * guard) or an administrator excluded it; an administrator can also admit one the guard holds.
 *
 * One processing run has one answer: buildContractValueReview writes marts.contract_value_review at the start of the
 * marts stage, and the totals, their validation, the coverage record and the site read `admitted` from that table.
 * A decision made while a run is in progress, or after it, takes effect at the next run.
 *
 * Owner, 26 November 2026: an administrator can exclude a contract of any size, not only one above the cap. Nine
 * contracts between 10 and 815 million lei carried a value ten, a hundred or a thousand times too large at the source
 * (a commune's road works at 814.778.046 lei against an estimate of 9.178.703) and passed under the cap. No rule decides
 * these: each is an administrator's decision with a written reason. A held contract stays out of every total and
 * statistic but is still listed, marked, wherever single contracts are listed (marts.contract_transactions_held).
 *
 * Every fragment uses the contract alias c, like the fragments of contract-money.ts.
 */

/** The contracts of one notice may add up to this many times the notice's own total before the guard holds them. */
export const CONTRACT_VALUE_NOTICE_SUM_FACTOR = 1.5;
/** A contract may be this many times the lowest offer its notice records before the guard holds it. */
export const CONTRACT_VALUE_LOWEST_OFFER_FACTOR = 3;
export type ContractValueGuard = 'lowest_offer' | 'notice_value_missing' | 'notice_sum';
export type ContractValueDecision = 'include' | 'exclude';

/**
 * Why the notice (award alias `award`) contradicts the value of contract c, or NULL when it does not:
 *  - 'lowest_offer': the value is over three times the lowest offer the notice records (a spital's cleaning supplies at
 *    3,2 mld. lei against an offer of 11,3 mil.);
 *  - 'notice_value_missing': the notice carries no total value, so nothing in it confirms the contract's;
 *  - 'notice_sum': the notice's contracts add up to more than one and a half times its total (a lot worth twelve
 *    times the notice). A framework's own row is left out of the sum (owner, 27 November 2026): a framework is a
 *    ceiling and its call-offs are what was ordered under it, so adding both doubled every large framework and held
 *    three real call-offs for military trucks (3,37 mld. lei against a framework of 3,36 mld.).
 * A value repeated identically in the notice passes: that is what the administrators' exclusions are for.
 */
export function contractValueGuard(q: ReviewSql, award = 'a') {
  const a = q(award);
  return q`case
    when ${a}.lowest_offer_value > 0 and ${contractRonValue(q)} > ${CONTRACT_VALUE_LOWEST_OFFER_FACTOR} * ${a}.lowest_offer_value then 'lowest_offer'
    when coalesce(${a}.ron_contract_value, 0) <= 0 then 'notice_value_missing'
    when (select sum(case
        -- contractRonValue, on the alias c2
        when c2.amount_status in ('ron','converted') and c2.amount_raw_id = c2.raw_id then c2.value_ron
        when c2.amount_status is null and upper(trim(c2.currency)) = 'RON' then c2.contract_value end)
      from core.contracts c2 where c2.ca_notice_id = c.ca_notice_id and ${contractKind(q, 'c2')} <> 'framework') > ${CONTRACT_VALUE_NOTICE_SUM_FACTOR} * ${a}.ron_contract_value then 'notice_sum'
  end`;
}

/**
 * Contract c is in the last review's admitted list. The list is read once per statement (an array from a subquery
 * that depends on nothing outside it), then every contract is a plain comparison: a correlated EXISTS under the OR of
 * contractValueAdmitted made the planner's cost of the call-off scaling ten times higher (19 November 2026).
 */
function admittedByReview(q: ReviewSql) {
  return q`c.ca_notice_contract_id = any (array(select vr.contract_nat_id from marts.contract_value_review vr where vr.admitted))`;
}

/**
 * Contract c is in the last review's held list: the guard holds it or an administrator excluded it. Read once, as
 * above. Never NULL: the counted population is „not held”, and a NULL there would drop a contract without a SEAP number.
 */
function heldByReview(q: ReviewSql) {
  return q`coalesce(c.ca_notice_contract_id = any (array(select vr.contract_nat_id from marts.contract_value_review vr where not vr.admitted)), false)`;
}

/**
 * The value condition of the contract population: at most the cap and not held by the last review (an administrator's
 * exclusion), or above the cap and admitted by it.
 */
export function contractValueAdmitted(q: ReviewSql) {
  return q`((${contractRonValue(q)} <= ${CONTRACT_VALUE_CAP_RON} and not ${heldByReview(q)}) or ${admittedByReview(q)})`;
}

/** Contract c (award alias `award`) meets every condition of marts.contract_transactions but the one on its value. */
function otherwiseCounted(q: ReviewSql, award: string) {
  return q`(c.contract_date is not null
    and ${q(award)}.authority_entity_id is not null and ${contractReportable(q)} and ${canonicalContract(q)}
    and ${contractHasSupplier(q, award)})`;
}

/** Contract c (award alias `award`) meets every other condition of marts.contract_transactions and is above the cap. */
function aboveCapOtherwiseCounted(q: ReviewSql, award: string) {
  return q`(${contractRonValue(q)} > ${CONTRACT_VALUE_CAP_RON} and ${otherwiseCounted(q, award)})`;
}

/**
 * Source contract c (award alias `award`) would otherwise be counted and the last review holds it: above the cap and
 * not admitted (the guard holds it, an administrator excluded it, or no run has reviewed it yet), or of any size and
 * excluded by an administrator. These rows are listed, marked (marts.contract_transactions_held, the contract's page,
 * the coverage record, an answer's facts), never summed into totals.
 */
export function contractValueHeld(q: ReviewSql, award = 'a') {
  return q`(${otherwiseCounted(q, award)}
    and ((${contractRonValue(q)} > ${CONTRACT_VALUE_CAP_RON} and not ${admittedByReview(q)}) or ${heldByReview(q)}))`;
}

/** Source contract c (award alias `award`) is above the cap and counted: admitted by the last review. */
export function contractValueAdmittedAboveCap(q: ReviewSql, award = 'a') {
  return q`(${aboveCapOtherwiseCounted(q, award)} and ${admittedByReview(q)})`;
}

/**
 * Rewrites marts.contract_value_review from the sources and the administrators' decisions: every canonical, dated,
 * reportable contract with an authority and a supplier whose value is above the cap, with the guard's finding and the
 * decision, if any; and every such contract at or under the cap that an administrator excluded (no guard looks at
 * those: `guard` is NULL). Run inside the transaction that builds marts.contract_transactions, before it.
 *
 * `first_seen_at` survives from run to run (the message to the administrators about a new contract goes by it); the
 * rows of the very first review are dated at the epoch, so the contracts already known are not announced as new.
 */
export async function buildContractValueReview(q: ReviewSql): Promise<{ above: number; admitted: number; held: number; added: number }> {
  // Three writes in one statement, without ON CONFLICT: the test fixtures clone the tables without their constraints.
  const rows = await q`
    with first_review as (select not exists (select 1 from marts.contract_value_review) empty),
    found as materialized (
      select c.ca_notice_contract_id nat, ${contractRonValue(q)} value_ron, ${contractValueGuard(q)} guard, d.decision
      from core.contracts c join core.awards a using (ca_notice_id)
      left join app.contract_value_decisions d on d.contract_nat_id = c.ca_notice_contract_id
      where ${aboveCapOtherwiseCounted(q, 'a')}
      union all
      -- At or under the cap: only what an administrator excluded, found from the few decisions and not by a pass over
      -- every contract.
      select c.ca_notice_contract_id, ${contractRonValue(q)}, null::text, d.decision
      from app.contract_value_decisions d join core.contracts c on c.ca_notice_contract_id = d.contract_nat_id
      join core.awards a using (ca_notice_id)
      where d.decision = 'exclude' and ${contractRonValue(q)} <= ${CONTRACT_VALUE_CAP_RON} and ${otherwiseCounted(q, 'a')}
    ), gone as (
      delete from marts.contract_value_review r where not exists (select 1 from found f where f.nat = r.contract_nat_id)
    ), kept as (
      update marts.contract_value_review r set value_ron = f.value_ron, admitted = coalesce(f.decision = 'include', f.guard is null),
        guard = f.guard, decision = f.decision
      from found f where f.nat = r.contract_nat_id returning r.admitted
    ), added as (
      insert into marts.contract_value_review (contract_nat_id, value_ron, admitted, guard, decision, first_seen_at)
      select f.nat, f.value_ron, coalesce(f.decision = 'include', f.guard is null), f.guard, f.decision,
        case when (select empty from first_review) then 'epoch'::timestamptz else clock_timestamp() end
      from found f where not exists (select 1 from marts.contract_value_review r where r.contract_nat_id = f.nat)
      returning admitted
    )
    select admitted, false inserted from kept union all select admitted, true from added`;
  const admitted = rows.filter((r) => r['admitted'] === true).length;
  return { above: rows.length, admitted, held: rows.length - admitted, added: rows.filter((r) => r['inserted'] === true).length };
}
