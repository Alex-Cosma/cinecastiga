import type { DbSql } from './client.js';
type Query = DbSql | Parameters<Parameters<DbSql['begin']>[1]>[0];
/** contract-reporting-5 (8 November 2026): call-offs declared over their framework count scaled to its ceiling (calloff-ceiling.ts). */
/** contract-reporting-6 (19 November 2026): a contract above CONTRACT_VALUE_CAP_RON is counted unless its notice
 * contradicts the value or an administrator excluded it (contract-value-review.ts); until then the cap kept all out. */
/** contract-reporting-7 (26 November 2026): an administrator can exclude a contract of any size as a probable error of
 * its value; it stays listed, marked, and out of every total (contract-value-review.ts, migration 0116). */
/** contract-reporting-8 (27 November 2026): a publication without a source type that its own notice's total leaves out,
 * beside call-offs, is the framework those call-offs were ordered under, not a contract (buildNoticeFrameworks). */
export const CONTRACT_REPORTING_VERSION = 'contract-reporting-8';

/** Source amounts never change. These predicates only select contributions to
 * statistics. SEAP sometimes encodes addenda as type 3: text takes precedence.
 * An addendum is NOT a new order and its amount need not be the increment. */
export function contractIsAmendment(q: Query, alias = 'c') {
  return q`(coalesce(${q(alias)}.contract_no,'') ~* '(^|[^[:alnum:]])act[ ._-]+ad(i[țţt]ional)?([^[:alnum:]]|$)'
    or coalesce(${q(alias)}.title,'') ~* '^\\s*act[ ._-]+ad(i[țţt]ional)?([^[:alnum:]]|$)'
    or coalesce(${q(alias)}.contract_no,'') ~* '^aa[ ._-]+(nr[ .]|[0-9])')`;
}

/** 1=contract, 2=framework, 3=call-off. Unknown source codes are not guessed.
 * Legacy title inference is explicit fallback only when the source has no type.
 * SEAP spells the framework phrase many ways ('Acord – cadru', 'ACORD  CADRU',
 * 'Acord -cadru'): any run of non-alphanumerics may separate the two words. */
export function contractKind(q: Query, alias = 'c') { return kindOf(q, alias, true); }

/** The kind by the source's type and the title alone, without the last run's reading of the notices
 * (marts.contract_notice_frameworks). The identity snapshot keeps it (its `eligible` is part of the hashes, like the
 * plain value cap), the call-off ceilings keep it, and buildNoticeFrameworks starts from it. */
export function contractKindBySource(q: Query, alias = 'c') { return kindOf(q, alias, false); }

function kindOf(q: Query, alias: string, byNotice: boolean) {
  // Only a publication the title rule would call a contract is looked up; the list is read once per statement.
  const legacyContract = byNotice
    ? q`case when ${q(alias)}.id in (select nf.contract_id from marts.contract_notice_frameworks nf) then 'framework' else 'contract' end`
    : q`'contract'`;
  return q`case
    when (${q(alias)}.contract_type_raw_id is not null or ${q(alias)}.source_contract_type is not null)
      and ${q(alias)}.contract_type_raw_id is distinct from ${q(alias)}.raw_id then 'review'
    when ${contractIsAmendment(q, alias)} then 'amendment'
    else case coalesce(${q(alias)}.source_contract_type::text,'legacy')
      when '2' then case when coalesce(${q(alias)}.title,'') ~* '^\\s*contract[[:space:]]+sub(s(ecvent)?|secvent)([[:space:].]|$)' then 'review' else 'framework' end
      when '3' then case when coalesce(${q(alias)}.title,'') ~* '^\\s*acord[^[:alnum:]]*cadru' then 'review' else 'calloff' end
      when '1' then case when coalesce(${q(alias)}.title,'') ~* '^\\s*acord[^[:alnum:]]*cadru' then 'review' else 'contract' end
      when 'legacy' then case
        when coalesce(${q(alias)}.title,'') ~* 'subsecvent|contract[[:space:]]+subs([[:space:].]|$)' then 'calloff'
        when coalesce(${q(alias)}.title,'') ~* 'acord[^[:alnum:]]*cadru' then 'framework'
        else ${legacyContract} end
      else 'review' end end`;
}

/** A notice's total may differ from the sum of its call-offs by this share and still be „the call-offs alone”. */
export const NOTICE_FRAMEWORK_TOLERANCE = 0.01;
/** The publications left out must weigh at least this share of the notice's total: under it the total cannot tell. */
export const NOTICE_FRAMEWORK_MIN_SHARE = 0.02;

/**
 * Frameworks recorded as contracts (owner, 27 November 2026). A publication without a SEAP contract type is a
 * contract unless its title says otherwise, and many frameworks say nothing („Contract loturile 44, 26, 27”, „AC
 * Cabluri”, „Lot 1 - Șină”). SEAP itself tells them apart: the total it writes on an award notice adds up the
 * notice's call-offs and ordinary contracts and leaves the frameworks out. So, in a notice that has call-offs:
 *   'notice_total'  the notice's total equals its call-offs alone (within NOTICE_FRAMEWORK_TOLERANCE) although the
 *                   notice also holds „contracts” worth at least NOTICE_FRAMEWORK_MIN_SHARE of that total: those
 *                   are the frameworks the call-offs were ordered under. Counting both added the ceiling to what was
 *                   ordered under it (a hospital's lot at 404 mil. lei beside 145 call-offs of 9,3 mil. in all).
 * And one spelling the title rule misses:
 *   'title'         the title begins „Acordul-cadru” / „Acordului-cadru” (the rule looks for „acord-cadru”).
 * Only publications without a source type are read this way: SEAP's own type always wins. A source value is never
 * changed; the publication stays listed, as a framework.
 *
 * Rewrites marts.contract_notice_frameworks: one processing run has one answer, built at the start of the marts stage
 * before anything counts contracts; contractKind reads it. Measured on production that day: 2.365 publications,
 * 6,44 mld. lei, at 298 institutions.
 */
export async function buildNoticeFrameworks(q: Query): Promise<{ frameworks: number; byNoticeTotal: number; byTitle: number; value: string }> {
  const value = (alias: string) => q`case
    when ${q(alias)}.amount_status in ('ron','converted') and ${q(alias)}.amount_raw_id = ${q(alias)}.raw_id then ${q(alias)}.value_ron
    when ${q(alias)}.amount_status is null and upper(trim(${q(alias)}.currency)) = 'RON' then ${q(alias)}.contract_value end`;
  // Two statements, in the caller's transaction: every row is written again, and nothing reads the table in between.
  await q`delete from marts.contract_notice_frameworks`;
  const rows = await q`
    with k as materialized (
      select c.id, c.ca_notice_id, c.source_contract_type st, ${contractKindBySource(q, 'c')} kind, ${value('c')} v
      from core.contracts c
      where c.ca_notice_id in (select s.ca_notice_id from core.contracts s
        where s.source_contract_type = 3 or (s.source_contract_type is null and coalesce(s.title,'') ~* 'subsecvent|contract[[:space:]]+subs([[:space:].]|$)'))
    ), n as (
      select ca_notice_id, coalesce(sum(v) filter (where kind = 'calloff'), 0) calloffs, coalesce(sum(v) filter (where kind = 'contract'), 0) contracts
      from k group by 1
    ), found as (
      select k.id, 'notice_total' rule, k.v, n.calloffs, a.ron_contract_value total
      from k join n using (ca_notice_id) join core.awards a using (ca_notice_id)
      where k.kind = 'contract' and k.st is null and k.v > 0 and a.ron_contract_value > 0 and n.calloffs > 0
        and abs(a.ron_contract_value - n.calloffs) <= ${NOTICE_FRAMEWORK_TOLERANCE} * a.ron_contract_value
        and n.contracts > ${NOTICE_FRAMEWORK_MIN_SHARE} * a.ron_contract_value
      union all
      select c.id, 'title', ${value('c')}, null, null
      from core.contracts c
      where c.source_contract_type is null and coalesce(c.title,'') ~* '^\\s*acordul(ui)?[^[:alnum:]]*cadru'
        and ${contractKindBySource(q, 'c')} = 'contract'
    ), one as (
      select distinct on (id) id, rule, v, calloffs, total from found order by id, rule
    ), added as (
      insert into marts.contract_notice_frameworks (contract_id, rule, value_ron, calloff_sum, notice_total)
      select id, rule, v, calloffs, total from one returning rule, value_ron
    )
    select count(*)::int frameworks, count(*) filter (where rule = 'notice_total')::int by_notice_total,
      count(*) filter (where rule = 'title')::int by_title, coalesce(sum(value_ron), 0)::text value from added`;
  const r = rows[0]!;
  return { frameworks: Number(r.frameworks), byNoticeTotal: Number(r.by_notice_total), byTitle: Number(r.by_title), value: String(r.value) };
}

/** The kind came from the legacy title rule above: no archived SEAP contract
 * type, not an addendum, not under review (audit F08). Coverage only: the
 * inventory says how many publications and how much value rest on it. */
export function contractKindFromTitle(q: Query, alias = 'c') {
  return q`(${q(alias)}.source_contract_type is null and ${contractKind(q, alias)} in ('contract','calloff','framework'))`;
}

/** Only identified contracts/orders contribute. A framework ceiling is never
 * a substitute for missing call-offs, and an addendum is not a new order. */
export function contractReportable(q: Query, alias = 'c') {
  return q`${contractKind(q, alias)} in ('contract','calloff')`;
}

/** contractReportable by the source's type and the title alone (contractKindBySource): the identity snapshot's. */
export function contractReportableBySource(q: Query, alias = 'c') {
  return q`${contractKindBySource(q, alias)} in ('contract','calloff')`;
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

/** Kinds a notice can hold, by contractKind over every contract published
 * under it: one kind, 'mixed' for several, 'none' without contracts. */
export const NOTICE_CONTRACT_KINDS = ['contract', 'framework', 'calloff', 'amendment', 'review', 'mixed', 'none'] as const;
export type NoticeContractsKind = typeof NOTICE_CONTRACT_KINDS[number];

/** Disclosure for notice-level signals (audit F14): what the award notice
 * `award` (alias with a ca_notice_id column) publishes. 'framework' means
 * ceilings only, 'calloff' subsequent contracts only, 'contract' ordinary
 * contracts only. It selects and sums nothing; a ceiling stays a ceiling. */
export function noticeContractsKind(q: Query, award = 'a', contracts?: ReturnType<DbSql>) {
  return q`(select case when count(*)=0 then 'none'
      when count(distinct notice_kind.k)=1 then min(notice_kind.k) else 'mixed' end
    from (select ${contractKind(q, 'notice_contract')} k from ${contracts ?? q`core.contracts`} notice_contract
      where notice_contract.ca_notice_id=${q(award)}.ca_notice_id) notice_kind)`;
}
