import { canonicalContract, contractReportable, contractRonValue, type DbSql } from "@seap/db";
import { METHODOLOGY_VERSION } from "./methodology.js";

type Fragment = ReturnType<DbSql>;

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
 * page can say when the cited contracts exceed the notice value. */
export function confirmedSingleBidAwardsSql(sql: DbSql, limits: { minValue: number; maxValue: number; severityReference: number },
  tables: { awards?: Fragment; contracts?: Fragment; competition?: Fragment } = {}): Fragment {
  return sql`
    with cited as (
      select a.id, a.state_date, a.procedure_type, a.ron_contract_value, a.cpv_code,
        c.ca_notice_contract_id, cc.ted_lot_result_id, cc.match_score, cc.tenders_received,
        ${contractRonValue(sql)} ron,
        (${contractReportable(sql)} and ${canonicalContract(sql)}) reportable
      from ${tables.awards ?? sql`core.awards`} a
      join ${tables.contracts ?? sql`core.contracts`} c on c.ca_notice_id = a.ca_notice_id
      join ${tables.competition ?? sql`marts.contract_competition`} cc on cc.contract_id = c.id
      where cc.tenders_received = 1 and cc.is_single_bidder = true and cc.match_score >= 0.9::real
        and a.procedure_type in ('Licitatie deschisa','Licitatie deschisa accelerata','Licitatie restransa')
    ), notice as (
      select id, state_date, procedure_type, ron_contract_value, cpv_code, count(*) confirmed_contract_count,
        sum(ron) cited_contracts_value, sum(ron) filter (where reportable) cited_reportable_value,
        count(*) filter (where ron is null) cited_unknown_value_count,
        jsonb_agg(jsonb_build_object(
          'contract_id', ca_notice_contract_id::text,
          'ted_lot_result_id', ted_lot_result_id::text,
          'match_score', match_score, 'tenders_received', tenders_received
        ) order by ca_notice_contract_id) contracts
      from cited
      group by id, state_date, procedure_type, ron_contract_value, cpv_code
    ), valued as (
      select notice.*, ron_contract_value > 0 notice_known,
        case when ron_contract_value > 0 then ron_contract_value else cited_reportable_value end signal_value
      from notice
    )
    select 'award', id, 'award_single_bid', to_char(state_date,'YYYY'), true,
      least(1, signal_value / ${limits.severityReference}::numeric),
      jsonb_build_object('procedure', procedure_type, 'value', signal_value,
        'value_scope', case when notice_known then 'notice' else 'confirmed_contracts' end,
        'notice_value', ron_contract_value,
        'cited_contracts_value', cited_contracts_value,
        'cited_reportable_value', cited_reportable_value,
        'cited_unknown_value_count', cited_unknown_value_count,
        'cpv', cpv_code, 'tenders_received', 1,
        'confirmed_contract_count', confirmed_contract_count, 'source', 'TED',
        'contracts', contracts) evidence, ${METHODOLOGY_VERSION}
    from valued
    where signal_value >= ${limits.minValue}::numeric
      and signal_value <= ${limits.maxValue}::numeric
  `;
}
