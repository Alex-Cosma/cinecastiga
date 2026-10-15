import type { DbSql } from './client.js';
type Query = DbSql | Parameters<Parameters<DbSql['begin']>[1]>[0];
export const CONTRACT_REPORTING_VERSION = 'contract-reporting-2';

/** Source amounts never change. These predicates only select contributions to
 * statistics. SEAP sometimes encodes addenda as type 3: text takes precedence.
 * An addendum is NOT a new order and its amount need not be the increment. */
export function contractIsAmendment(q: Query, alias = 'c') {
  return q`(coalesce(${q(alias)}.contract_no,'') ~* '(^|[^[:alnum:]])act[ ._-]+ad(i[țţt]ional)?([^[:alnum:]]|$)'
    or coalesce(${q(alias)}.title,'') ~* '^\\s*act[ ._-]+ad(i[țţt]ional)?([^[:alnum:]]|$)'
    or coalesce(${q(alias)}.contract_no,'') ~* '^aa[ ._-]+(nr[ .]|[0-9])')`;
}

/** 1=contract, 2=framework, 3=call-off. Unknown source codes are not guessed.
 * Legacy title inference is explicit fallback only when the source has no type. */
export function contractKind(q: Query, alias = 'c') {
  return q`case
    when (${q(alias)}.contract_type_raw_id is not null or ${q(alias)}.source_contract_type is not null)
      and ${q(alias)}.contract_type_raw_id is distinct from ${q(alias)}.raw_id then 'review'
    when ${contractIsAmendment(q, alias)} then 'amendment'
    else case coalesce(${q(alias)}.source_contract_type::text,'legacy')
      when '2' then case when coalesce(${q(alias)}.title,'') ~* '^\\s*contract[[:space:]]+sub(s(ecvent)?|secvent)([[:space:].]|$)' then 'review' else 'framework' end
      when '3' then case when coalesce(${q(alias)}.title,'') ~* '^\\s*acord[- ]cadru' then 'review' else 'calloff' end
      when '1' then case when coalesce(${q(alias)}.title,'') ~* '^\\s*acord[- ]cadru' then 'review' else 'contract' end
      when 'legacy' then case
        when coalesce(${q(alias)}.title,'') ~* 'subsecvent|contract[[:space:]]+subs([[:space:].]|$)' then 'calloff'
        when coalesce(${q(alias)}.title,'') ~* 'acord[- ]cadru' then 'framework'
        else 'contract' end
      else 'review' end end`;
}

/** Only identified contracts/orders contribute. A framework ceiling is never
 * a substitute for missing call-offs, and an addendum is not a new order. */
export function contractReportable(q: Query, alias = 'c') {
  return q`${contractKind(q, alias)} in ('contract','calloff')`;
}

/** Coverage only: missing identified call-offs is unknown coverage, not zero
 * spending. Match the same buyer/official notice/lot across republications. */
export function frameworkHasCalloffs(q: Query, alias = 'c') {
  return q`exists (
    select 1 from core.awards parent join core.awards publication
      on publication.authority_entity_id=parent.authority_entity_id
      and (publication.ca_notice_id=parent.ca_notice_id
        or (parent.notice_no is not null and publication.notice_no=parent.notice_no))
    join core.contracts calloff on calloff.ca_notice_id=publication.ca_notice_id
    where parent.ca_notice_id=${q(alias)}.ca_notice_id
      and nullif(trim(${q(alias)}.lots_caption),'') is not null
      and calloff.lots_caption=${q(alias)}.lots_caption
      and ${contractKind(q, 'calloff')}='calloff'
  )`;
}
