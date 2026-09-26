import type { DbSql } from "@seap/db";
import { METHODOLOGY_VERSION } from "./methodology.js";

type Fragment = ReturnType<DbSql>;

/** Same confirmed contract-to-TED-lot population as the query builder. */
export function confirmedSingleBidAwardsSql(sql: DbSql, limits: { minValue: number; maxValue: number; severityReference: number },
  tables: { awards?: Fragment; contracts?: Fragment; competition?: Fragment } = {}): Fragment {
  return sql`
    select 'award', a.id, 'award_single_bid', to_char(a.state_date,'YYYY'), true,
      least(1, a.ron_contract_value / ${limits.severityReference}::numeric),
      jsonb_build_object('procedure', a.procedure_type, 'value', a.ron_contract_value,
        'value_scope', 'notice', 'cpv', a.cpv_code, 'tenders_received', 1,
        'confirmed_contract_count', count(*), 'source', 'TED',
        'contracts', jsonb_agg(jsonb_build_object(
          'contract_id', c.ca_notice_contract_id::text,
          'ted_lot_result_id', cc.ted_lot_result_id::text,
          'match_score', cc.match_score, 'tenders_received', cc.tenders_received
        ) order by c.ca_notice_contract_id)) evidence, ${METHODOLOGY_VERSION}
    from ${tables.awards ?? sql`core.awards`} a
    join ${tables.contracts ?? sql`core.contracts`} c on c.ca_notice_id = a.ca_notice_id
    join ${tables.competition ?? sql`marts.contract_competition`} cc on cc.contract_id = c.id
    where cc.tenders_received = 1 and cc.is_single_bidder = true and cc.match_score >= 0.9::real
      and a.procedure_type in ('Licitatie deschisa','Licitatie deschisa accelerata','Licitatie restransa')
      and a.ron_contract_value >= ${limits.minValue}::numeric
      and a.ron_contract_value <= ${limits.maxValue}::numeric
    group by a.id, a.state_date, a.procedure_type, a.ron_contract_value, a.cpv_code
  `;
}
