/** Offline replay on the explicitly named isolated monetary copy ONLY. */
import { createDb, contractRonValue } from '@seap/db';
import { mkdir, writeFile } from 'node:fs/promises';
import { normalizeContractMoney, type ContractMoneyInput } from '../normalize/contract-money.js';
import { runContractMoneyQuality } from '../normalize/contract-money-quality.js';

const database = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/').pathname.slice(1);
if (!database.startsWith('seap_test_currency_')) throw Error('Simulation requires an isolated seap_test_currency_* database.');
const output = process.argv[2];
if (!output) throw Error('Provide a local report directory.');
const { sql } = createDb();
try {
  await sql`set max_parallel_workers_per_gather=0`;
  await sql`set work_mem='8MB'`;
  await sql`set jit=off`;
  await sql`set statement_timeout='180s'`;
  const [before] = await sql`select count(distinct contract_id)::text contracts, sum(closing_value)::text total_ron from marts.contract_transactions`;
  let cursor = '0', matched = 0;
  const changed: Record<string, unknown>[] = [];
  while (true) {
    const docs = await sql`select id::text,payload,content_hash from raw.raw_documents
      where endpoint_version='award-contracts:v1' and id>${cursor}::bigint order by id limit 20`;
    if (!docs.length) break;
    const contracts = await sql`select id::text,raw_id::text,ca_notice_id::text,ca_notice_contract_id::text,
      currency,contract_value::text from core.contracts where raw_id=any(${docs.map(d=>d.id)}::bigint[])`;
    const byKey = new Map(contracts.map(c => [`${c.raw_id}:${c.ca_notice_contract_id}`, c]));
    const rows: Record<string, unknown>[] = [];
    for (const doc of docs) {
      for (const item of (doc.payload.items ?? []) as (ContractMoneyInput & { caNoticeContractId: number; caNoticeId?: number })[]) {
        const c = byKey.get(`${doc.id}:${item.caNoticeContractId}`);
        if (!c || String(item.caNoticeId ?? doc.payload.caNoticeId) !== c.ca_notice_id) continue;
        const money = normalizeContractMoney(item);
        const row = { id:c.id,raw_id:doc.id,original_value:money.originalValue,original_currency:money.originalCurrency,
          value_ron:money.valueRon,currency_rate:money.currencyRate,amount_status:money.amountStatus,
          amount_evidence:{...money.amountEvidence,rawHash:doc.content_hash} };
        rows.push(row);
        if (c.currency !== 'RON' || money.amountStatus !== 'ron') changed.push({ publicId:c.ca_notice_contract_id,
          legacyValue:c.contract_value,legacyCurrency:c.currency,...money,rawId:doc.id,rawHash:doc.content_hash });
      }
    }
    if (rows.length) await sql`update core.contracts c set original_value=r.original_value,original_currency=r.original_currency,
      value_ron=r.value_ron,currency_rate=r.currency_rate,amount_status=r.amount_status,amount_raw_id=r.raw_id,amount_evidence=r.amount_evidence
      from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) r(id bigint,raw_id bigint,original_value numeric,original_currency text,
        value_ron numeric,currency_rate numeric,amount_status text,amount_evidence jsonb)
      where c.id=r.id and c.raw_id=r.raw_id`;
    matched += rows.length;
    cursor = String(docs.at(-1)!.id);
  }
  // Exact same contract eligibility as runMarts; compare contract-level totals,
  // without creating flags, touching the search index or changing the real DB.
  await sql`create temporary table currency_after as
    with has_sub as (select distinct ca_notice_id from core.contracts where title ~* 'subsecvent')
    select c.id,c.ca_notice_contract_id, a.authority_entity_id, c.contract_date,
      ${contractRonValue(sql)} value_ron
    from core.contracts c join core.awards a using(ca_notice_id)
    where ${contractRonValue(sql)}>0 and ${contractRonValue(sql)}<=1000000000
      and c.contract_date is not null and a.authority_entity_id is not null
      and exists(select 1 from core.contract_winners w where w.contract_id=c.id)
      and not(coalesce(c.title,'')~*'acord[- ]cadru' and coalesce(c.title,'')!~*'subsecvent'
        and c.ca_notice_id in(select ca_notice_id from has_sub))`;
  const [after] = await sql`select count(*)::text contracts,sum(value_ron)::text total_ron from currency_after`;
  const delta = await sql`with b as(select contract_id,sum(closing_value) v from marts.contract_transactions group by 1)
    select coalesce(c.ca_notice_contract_id,a.ca_notice_contract_id)::text id,c.ca_notice_id::text notice_id,
      b.v::text before_ron,a.value_ron::text after_ron,(coalesce(a.value_ron,0)-coalesce(b.v,0))::text delta_ron
    from b full join currency_after a on a.id=b.contract_id left join core.contracts c on c.id=coalesce(a.id,b.contract_id)
    where b.v is distinct from a.value_ron order by abs(coalesce(a.value_ron,0)-coalesce(b.v,0)) desc`;
  const [difference] = await sql`select (coalesce((select sum(value_ron) from currency_after),0)
    - coalesce((select sum(closing_value) from marts.contract_transactions),0))::text delta_ron`;
  const quality = await runContractMoneyQuality(sql);
  await mkdir(output,{recursive:true});
  await writeFile(`${output}/summary.json`,JSON.stringify({database,matched,changedMonetaryRecords:changed.length,before,after,difference,quality},null,2)+'\n');
  await writeFile(`${output}/changed-records.json`,JSON.stringify(changed,null,2)+'\n');
  await writeFile(`${output}/statistical-deltas.json`,JSON.stringify(delta,null,2)+'\n');
  console.log(JSON.stringify({matched,before,after,difference,changed:delta.length,structuralErrors:quality.structuralErrors,sourceErrors:quality.sourceErrors}));
} finally { await sql.end(); }
