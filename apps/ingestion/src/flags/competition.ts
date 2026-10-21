import { canonicalContract, contractDatePlausible, contractReportable, contractRonValue, noticeContractsKind, type DbSql } from "@seap/db";
import { METHODOLOGY_VERSION } from "./methodology.js";

type Fragment = ReturnType<DbSql>;
type AwardTables = { awards?: Fragment; contracts?: Fragment };

/** One appearance per award notice, dated by its first contract (owner
 * decision of 21 October 2026, rf-2026.15).
 *
 * `hits` lists every award row (one per SEAP notice version) that meets a
 * rule, as (id, severity, evidence). SEAP republishes an award notice under
 * the same notice number when it adds call-offs: a new caNoticeId, new contract
 * ids and a new noticeStateDate. core.awards keeps each version, and its
 * state_date is the date of that version, not of the first publication. The
 * versions of one notice (same authority and notice number) give one
 * appearance, on the latest version that meets the rule: the one shown and
 * linked. A different notice number stays a separate appearance (audit F14,
 * option A). Without both an authority and a notice number a version is its
 * own notice.
 *
 * The period is the year of the earliest plausible contract date
 * (contractDatePlausible) over every version of the notice, met or not. A
 * notice without such a contract falls back to its earliest version date, and
 * the evidence says which one was used ('period_source'). */
function oncePerNotice(sql: DbSql, code: string, hits: Fragment, tables: AwardTables): Fragment {
  const awards = tables.awards ?? sql`core.awards`;
  const contracts = tables.contracts ?? sql`core.contracts`;
  return sql`
    with hits as (${hits}), hit_versions as (
      select h.id, h.severity, h.evidence, a.ca_notice_id, a.state_date, a.authority_entity_id, a.notice_no,
        (a.authority_entity_id is not null and nullif(a.notice_no, '') is not null) grouped
      from hits h join ${awards} a on a.id = h.id
    ), shown as (
      select distinct on (grouped, case when grouped then authority_entity_id end, case when grouped then notice_no end,
          case when not grouped then ca_notice_id end) *
      from hit_versions
      order by grouped, case when grouped then authority_entity_id end, case when grouped then notice_no end,
        case when not grouped then ca_notice_id end, state_date desc nulls last, ca_notice_id desc
    ), versions as (
      select s.id, v.ca_notice_id, v.state_date from shown s
        join ${awards} v on v.authority_entity_id = s.authority_entity_id and v.notice_no = s.notice_no
      where s.grouped
      union all
      select id, ca_notice_id, state_date from shown where not grouped
    ), dated as (
      select v.id, count(distinct v.ca_notice_id) notice_versions, min(v.state_date) first_version_date,
        min(c.contract_date) filter (where ${contractDatePlausible(sql, 'c')}) first_contract_date
      from versions v left join ${contracts} c on c.ca_notice_id = v.ca_notice_id
      group by v.id
    )
    select 'award' subject_type, s.id, ${code}::text flag_code,
      to_char(coalesce(d.first_contract_date, d.first_version_date) at time zone 'Europe/Bucharest', 'YYYY') period,
      true triggered, s.severity,
      s.evidence || jsonb_build_object(
        'period_source', case when d.first_contract_date is not null then 'first_contract'
          when d.first_version_date is not null then 'notice_version' end,
        'first_contract_date', to_char(d.first_contract_date at time zone 'Europe/Bucharest', 'YYYY-MM-DD'),
        'first_version_date', to_char(d.first_version_date at time zone 'Europe/Bucharest', 'YYYY-MM-DD'),
        'version_date', to_char(s.state_date at time zone 'Europe/Bucharest', 'YYYY-MM-DD'),
        'notice_versions', d.notice_versions) evidence,
      ${METHODOLOGY_VERSION}::text methodology_version
    from shown s join dated d on d.id = s.id
  `;
}

/** award_no_competition: one signal per award notice declaring a negotiation
 * without prior publication, counted once across its versions and dated by its
 * first contract (see oncePerNotice). A republication under a new notice
 * number, or a framework and its call-off, stay separate signals (audit F14,
 * option A); the evidence records what the notice holds ('notice_contracts',
 * see noticeContractsKind), so a ceiling-only notice is shown as a framework
 * ceiling. The value, floor and severity stay the notice value. */
export function noCompetitionAwardsSql(sql: DbSql, limits: { minValue: number; maxValue: number; severityReference: number },
  tables: AwardTables = {}): Fragment {
  return oncePerNotice(sql, "award_no_competition", sql`
    select a.id, least(1, a.ron_contract_value / ${limits.severityReference}::numeric) severity,
      jsonb_build_object('procedure', a.procedure_type, 'value', a.ron_contract_value,
        'cpv', a.cpv_code, 'notice_contracts', ${noticeContractsKind(sql, 'a', tables.contracts)}) evidence
    from ${tables.awards ?? sql`core.awards`} a
    where a.procedure_type ilike '%fara publicare prealabila%'
      and a.ron_contract_value is not null
      and a.ron_contract_value >= ${limits.minValue}::numeric
      and a.ron_contract_value <= ${limits.maxValue}::numeric
  `, tables);
}

/** Same confirmed contract-to-TED-lot population as the query builder.
 *
 * Value used for the floor, severity and display (rf-2026.9, audit F23): the
 * SEAP notice value when the notice declares a positive one; otherwise the
 * notice value is missing (the award list carries 0 for about one notice in
 * six), never "below the floor". It then falls back to the RON sum of the
 * cited single-tender contracts that are identified contracts or call-offs
 * (canonical, not temporarily excluded). Framework ceilings and addenda are
 * never a substitute for a missing value: a notice whose only cited values
 * are ceilings stays unevaluated. The evidence keeps the notice value, the
 * cited sums and the count of cited contracts without a RON value, so the
 * page can say when the cited contracts exceed the notice value. Like
 * award_no_competition, it records what the notice holds ('notice_contracts')
 * and is counted once per notice, dated by its first contract (oncePerNotice). */
export function confirmedSingleBidAwardsSql(sql: DbSql, limits: { minValue: number; maxValue: number; severityReference: number },
  tables: AwardTables & { competition?: Fragment } = {}): Fragment {
  return oncePerNotice(sql, "award_single_bid", sql`
    with cited as (
      select a.id, a.ca_notice_id, a.procedure_type, a.ron_contract_value, a.cpv_code,
        c.ca_notice_contract_id, cc.ted_lot_result_id, cc.match_score, cc.tenders_received,
        ${contractRonValue(sql)} ron,
        (${contractReportable(sql)} and ${canonicalContract(sql)}) reportable
      from ${tables.awards ?? sql`core.awards`} a
      join ${tables.contracts ?? sql`core.contracts`} c on c.ca_notice_id = a.ca_notice_id
      join ${tables.competition ?? sql`marts.contract_competition`} cc on cc.contract_id = c.id
      where cc.tenders_received = 1 and cc.is_single_bidder = true and cc.match_score >= 0.9::real
        and a.procedure_type in ('Licitatie deschisa','Licitatie deschisa accelerata','Licitatie restransa')
    ), notice as (
      select id, ca_notice_id, procedure_type, ron_contract_value, cpv_code, count(*) confirmed_contract_count,
        sum(ron) cited_contracts_value, sum(ron) filter (where reportable) cited_reportable_value,
        count(*) filter (where ron is null) cited_unknown_value_count,
        jsonb_agg(jsonb_build_object(
          'contract_id', ca_notice_contract_id::text,
          'ted_lot_result_id', ted_lot_result_id::text,
          'match_score', match_score, 'tenders_received', tenders_received
        ) order by ca_notice_contract_id) contracts
      from cited
      group by id, ca_notice_id, procedure_type, ron_contract_value, cpv_code
    ), valued as (
      select notice.*, ron_contract_value > 0 notice_known,
        case when ron_contract_value > 0 then ron_contract_value else cited_reportable_value end signal_value
      from notice
    )
    select id, least(1, signal_value / ${limits.severityReference}::numeric) severity,
      jsonb_build_object('procedure', procedure_type, 'value', signal_value,
        'value_scope', case when notice_known then 'notice' else 'confirmed_contracts' end,
        'notice_value', ron_contract_value,
        'cited_contracts_value', cited_contracts_value,
        'cited_reportable_value', cited_reportable_value,
        'cited_unknown_value_count', cited_unknown_value_count,
        'cpv', cpv_code, 'tenders_received', 1,
        'confirmed_contract_count', confirmed_contract_count, 'source', 'TED',
        'notice_contracts', ${noticeContractsKind(sql, 'valued', tables.contracts)},
        'contracts', contracts) evidence
    from valued
    where signal_value >= ${limits.minValue}::numeric
      and signal_value <= ${limits.maxValue}::numeric
  `, tables);
}
