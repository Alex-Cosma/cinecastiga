import type { DbSql } from './client.js';
import { canonicalContract } from './contract-identity.js';
import { contractRonValue } from './contract-money.js';
import { contractKind } from './contract-reporting.js';

type Query = DbSql | Parameters<Parameters<DbSql['begin']>[1]>[0];
type Fragment = ReturnType<DbSql>;

/**
 * Call-offs declared over their framework agreement (owner, 8 November 2026). Some authorities enter in SEAP, for each
 * call-off, the value of the whole framework: Colțea's call-off A17 declares 46,007,328 lei where its "document
 * constatator" says 350,526 lei. When a framework's call-offs add up to more than `ratio` times its ceiling, and by at
 * least `minExcess` lei, the totals count them scaled down together to the ceiling (the most the law allows), while
 * every page and the award_calloffs_over_ceiling signal keep and show the declared values. A call-off "repeats the
 * ceiling" when its own value is the ceiling within `repeat`.
 */
export const CALLOFF_OVER_CEILING = { ratio: 1.2, minExcess: 50_000, repeat: 0.01 } as const;

/**
 * Every (framework agreement, call-off) pair: the framework a canonical contractKind 'framework' with a RON ceiling and
 * a lot caption; its call-offs over the award notice's versions (same buyer and notice number), one of its lots or all
 * of them, with a winner in common (or no winner recorded on the framework), as the contract page links them. Columns:
 * framework_id, framework_notice_id, framework_nat_id, framework_no, ceiling, calloff_id, calloff_value (the call-off's
 * own declared RON value). `contracts`/`awards` default to the core tables (tests pass scoped ones).
 */
export function frameworkCalloffPairs(q: Query, tables: { contracts?: Fragment; awards?: Fragment } = {}): Fragment {
  const contracts = tables.contracts ?? q`core.contracts`;
  const awards = tables.awards ?? q`core.awards`;
  return q`
    select distinct f.id framework_id, f.ca_notice_id framework_notice_id, f.ca_notice_contract_id framework_nat_id,
      f.contract_no framework_no, f.ceiling, x.id calloff_id, x.value calloff_value
    from (
      select c.id, c.ca_notice_id, c.ca_notice_contract_id, c.contract_no, c.lots_caption, ${contractRonValue(q)} ceiling
      from ${contracts} c
      where ${contractKind(q, 'c')} = 'framework' and ${canonicalContract(q)} and nullif(btrim(c.lots_caption), '') is not null
    ) f
    join ${awards} parent on parent.ca_notice_id = f.ca_notice_id and parent.authority_entity_id is not null
    -- The notice itself and its versions (same buyer, same notice number), as two index lookups: an OR in the join
    -- scanned every notice of the buyer for each framework (14,000 for the largest; 15 minutes locally).
    cross join lateral (
      select parent.ca_notice_id
      union
      select v.ca_notice_id from ${awards} v
      where parent.notice_no is not null and v.notice_no = parent.notice_no and v.authority_entity_id = parent.authority_entity_id
    ) p
    join (
      select c.id, c.ca_notice_id, c.lots_caption, ${contractRonValue(q)} value
      from ${contracts} c
      where ${contractKind(q, 'c')} = 'calloff' and nullif(btrim(c.lots_caption), '') is not null
    ) x on x.ca_notice_id = p.ca_notice_id and x.id <> f.id
    where f.ceiling > 0 and x.value > 0
      and strpos(', ' || f.lots_caption || ',', ', ' || x.lots_caption || ',') > 0
      and (not exists (select 1 from core.contract_winners w0 where w0.contract_id = f.id)
        or exists (select 1 from core.contract_winners wx join core.contract_winners w0 on w0.entity_id = wx.entity_id
                   where wx.contract_id = x.id and w0.contract_id = f.id))`;
}

/**
 * Runs `run` (one statement over frameworkCalloffPairs) with nested loops off, inside the caller's transaction, then
 * restores the setting. The planner reads the contract kind (a CASE over the source type and the title) as rare: 790
 * frameworks expected where there are 173,000, so it chose nested loops that took 15 minutes locally; hash joins take 7
 * seconds. If `run` fails, the transaction's rollback restores the setting.
 */
export async function withoutNestedLoops<T>(q: Query, run: () => Promise<T>): Promise<T> {
  const [row] = (await q`select current_setting('enable_nestloop') v`) as unknown as { v: string }[];
  await q`select set_config('enable_nestloop', 'off', true)`;
  const out = await run();
  await q`select set_config('enable_nestloop', ${row?.v ?? 'on'}, true)`;
  return out;
}

/**
 * The scale of each call-off counted in the totals (`counted`: a set of contract ids, e.g. the transactions' or their
 * candidates'): for a framework whose counted call-offs declare more than CALLOFF_OVER_CEILING allows, ceiling /
 * declared, so its call-offs sum to the ceiling; a call-off of several such frameworks takes the smallest. Columns:
 * calloff_id, scale, framework_id.
 */
export function calloffCeilingScale(q: Query, counted: Fragment, tables: { contracts?: Fragment; awards?: Fragment } = {}): Fragment {
  const { ratio, minExcess } = CALLOFF_OVER_CEILING;
  return q`
    with pairs as (
      select p.* from (${frameworkCalloffPairs(q, tables)}) p where p.calloff_id in (${counted})
    ), over as (
      select framework_id, max(ceiling) / sum(calloff_value) scale from pairs group by framework_id
      having sum(calloff_value) > ${ratio}::numeric * max(ceiling) and sum(calloff_value) - max(ceiling) >= ${minExcess}::numeric
    )
    select distinct on (p.calloff_id) p.calloff_id, o.scale, o.framework_id
    from pairs p join over o on o.framework_id = p.framework_id
    order by p.calloff_id, o.scale, o.framework_id`;
}
