import type { DbSql } from './client.js';
import { contractAmountStatus, contractRonValue, CONTRACT_MONEY_VALID_SQL } from './contract-money.js';

export interface MoneyQuality {
  checkedAt: string;
  rawBoundary: string;
  structuralErrors: number;
  sourceErrors: number;
  newIssues: number | null;
  counts: { status: string; count: number }[];
  examples: { id: string; status: string; title: string | null }[];
}
export async function readContractMoneyQuality(q: DbSql, previousBoundary?: string): Promise<MoneyQuality> {
  const counts = await q`
    select ${contractAmountStatus(q)} status, count(*)::int count
    from core.contracts c group by 1 order by 1`;
  const [health] = await q.unsafe(`select count(*) filter (where not (${CONTRACT_MONEY_VALID_SQL})
    or (amount_status is not null and amount_raw_id is distinct from raw_id))::int errors,
    coalesce(max(raw_id),0)::text boundary from core.contracts`);
  // Only verified monetary rows claim archive evidence. Legacy RON is reported
  // separately. Expand each referenced response once, not once per contract.
  const [source] = await q`
    with verified as materialized (
      select id,raw_id,ca_notice_id,ca_notice_contract_id,original_value,original_currency,currency_rate,value_ron,amount_status,amount_evidence->>'reportedRon' reported_ron
      from core.contracts where amount_status in ('ron','converted')
    ), docs as materialized (
      select r.id,r.payload from raw.raw_documents r
      where r.endpoint_version='award-contracts:v1' and r.id in(select raw_id from verified)
    ), items as materialized (
      select d.id,item->>'caNoticeContractId' contract_id,
        coalesce(item->>'caNoticeId',d.payload->>'caNoticeId') parent,
        item->>'contractValue' original,
        item->>'currencyRate' rate,item->>'defaultCurrencyContractValue' reported,
        case when upper(trim(item->'currency'->>'localeKey')) ~ '^[A-Z]{3}$'
          then upper(trim(item->'currency'->>'localeKey')) else upper(trim(item->'currency'->>'text')) end currency
      from docs d cross join lateral jsonb_array_elements(case when jsonb_typeof(d.payload->'items')='array' then d.payload->'items' else '[]'::jsonb end) item
    ), compared as (
      select v.id,count(i.id) copies,
        bool_and(i.parent is not distinct from v.ca_notice_id::text
          and case when i.original ~ '^-?[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?$'
            then i.original::numeric=v.original_value else false end
          and i.currency=v.original_currency
          and (case when i.rate ~ '^-?[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?$' then i.rate::numeric end) is not distinct from v.currency_rate
          and (case when i.reported ~ '^-?[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?$'
            then i.reported::numeric end) is not distinct from v.reported_ron::numeric
          and (v.amount_status='ron' or case when i.reported ~ '^-?[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?$'
            then i.reported::numeric=v.value_ron else false end)) agrees
      from verified v left join items i on i.id=v.raw_id and i.contract_id=v.ca_notice_contract_id::text
      group by v.id
    ), bad as (select id from compared where copies<>1 or agrees is not true)
    select (select count(*)::int from bad) errors,
      (select coalesce(jsonb_agg(row_to_json(x)),'[]'::jsonb) from (
        select c.ca_notice_contract_id::text id,'source_mismatch' status,c.title
        from bad join core.contracts c using(id) order by c.id desc limit 10
      ) x) examples`;
  const examples = await q`select c.ca_notice_contract_id::text id,${contractAmountStatus(q)} status,c.title
    from core.contracts c where ${contractRonValue(q)} is null
    order by c.amount_raw_id desc nulls last,c.id desc limit 10`;
  const [fresh] = previousBoundary === undefined ? [] : await q`
    select count(*)::int n from core.contracts c
    where c.amount_raw_id > ${previousBoundary}::bigint and ${contractRonValue(q)} is null`;
  return { checkedAt: new Date().toISOString(), rawBoundary: String(health?.boundary ?? '0'),
    structuralErrors: Number(health?.errors ?? 0), sourceErrors: Number(source?.errors ?? 0), newIssues: fresh ? Number(fresh.n) : null,
    counts: counts.map(r => ({ status: String(r.status), count: Number(r.count) })),
    examples: [...(source?.examples ?? []), ...examples].slice(0, 10).map(r => ({ id: String(r.id), status: String(r.status), title: r.title == null ? null : String(r.title) })) };
}
