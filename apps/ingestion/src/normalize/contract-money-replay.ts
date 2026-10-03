import type { DbSql } from '@seap/db';
import { normalizeContractMoney, type ContractMoneyInput } from './contract-money.js';

/** Caller owns the transaction and publication gate. Original legacy columns stay intact. */
export async function replayContractMoney(q: DbSql, boundary: string, log: (message: string) => void = () => {}) {
  // Index the small working projection, not the million-row live table. Also
  // avoids scanning core once for every batch of twenty archived responses.
  await q`create temporary table currency_replay_targets on commit drop as
    select c.id,c.raw_id,c.ca_notice_id,c.ca_notice_contract_id from core.contracts c
    join raw.raw_documents r on r.id=c.raw_id
    where r.endpoint_version='award-contracts:v1' and r.id<=${boundary}::bigint`;
  await q`create index on currency_replay_targets(raw_id)`;
  await q`analyze currency_replay_targets`;
  let cursor='0', matched=0;
  const counts: Record<string, number> = {};
  while (true) {
    const docs=await q`select r.id::text,r.payload,r.content_hash from raw.raw_documents r
      where r.endpoint_version='award-contracts:v1' and r.id>${cursor}::bigint and r.id<=${boundary}::bigint
        and exists(select 1 from currency_replay_targets t where t.raw_id=r.id)
      order by r.id limit 20`;
    if (!docs.length) break;
    const targets=await q`select id::text,raw_id::text,ca_notice_id::text,ca_notice_contract_id::text
      from currency_replay_targets where raw_id=any(${docs.map(d=>d.id)}::bigint[])`;
    const byKey=new Map(targets.map(c=>[`${c.raw_id}:${c.ca_notice_contract_id}`,c]));
    const rows: Record<string,unknown>[]=[];
    const seen=new Set<string>();
    for (const d of docs) {
      if (!Array.isArray(d.payload.items)) throw Error(`Invalid archived contract list at raw ${d.id}`);
      for (const item of d.payload.items as (ContractMoneyInput & {caNoticeContractId:number;caNoticeId?:number})[]) {
        const c=byKey.get(`${d.id}:${item.caNoticeContractId}`);
        if (!c || String(item.caNoticeId??d.payload.caNoticeId)!==c.ca_notice_id) continue;
        if (seen.has(c.id)) throw Error(`Duplicate archived source item for contract ${c.ca_notice_contract_id}`);
        seen.add(c.id);
        const m=normalizeContractMoney(item);
        counts[m.amountStatus]=(counts[m.amountStatus]??0)+1;
        rows.push({id:c.id,raw_id:d.id,original_value:m.originalValue,original_currency:m.originalCurrency,
          value_ron:m.valueRon,currency_rate:m.currencyRate,amount_status:m.amountStatus,
          amount_evidence:{...m.amountEvidence,rawHash:d.content_hash}});
      }
    }
    if(rows.length) {
      const updated=await q`update core.contracts c set original_value=r.original_value,original_currency=r.original_currency,
        value_ron=r.value_ron,currency_rate=r.currency_rate,amount_status=r.amount_status,amount_raw_id=r.raw_id,amount_evidence=r.amount_evidence
        from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) r(id bigint,raw_id bigint,original_value numeric,original_currency text,
          value_ron numeric,currency_rate numeric,amount_status text,amount_evidence jsonb)
        where c.id=r.id and c.raw_id=r.raw_id returning c.id`;
      if(updated.length!==rows.length)throw Error('Contract source changed during monetary replay');
    }
    matched+=rows.length;cursor=String(docs.at(-1)!.id);
    log(`currency repair: ${matched} source-matched contracts; raw cursor ${cursor}`);
  }
  return {version:1,boundary,matched,counts};
}
