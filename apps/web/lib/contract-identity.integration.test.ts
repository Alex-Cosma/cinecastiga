import {afterAll,describe,it,expect} from 'vitest';
import {createDb,type DbSql} from '@seap/db';
import {getContractDetail} from './marts';
const enabled=process.env.TEST_IDENTITY_FIXTURE==='1';
const url=new URL(process.env.DATABASE_URL??'postgres://invalid/');
if(enabled&&(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!url.pathname.startsWith('/seap_test_currency_')))throw Error('Requires isolated public identity fixture');
const sql=enabled?createDb().sql:null;
afterAll(async()=>{await sql?.end();});
describe.skipIf(!enabled)('approved publication detail on the isolated public fixture',()=>{
 it('keeps both URLs and source IDs and reads the same canonical allocations',async()=>{
  await sql!.begin('read only',async tx=>{
   const globals=globalThis as unknown as {__seapSql?:DbSql};const previous=globals.__seapSql;
   globals.__seapSql=tx as unknown as DbSql;
   try{
    const rows=await tx`select c.ca_notice_contract_id::text id from marts.contract_identity_members m join core.contracts c on c.id=m.contract_id
      where m.candidate_id=(select d.candidate_id from marts.contract_identity_decisions d
        where exists(select 1 from marts.contract_transactions t where t.contract_id=d.canonical_contract_id) and (select count(*) from marts.contract_identity_members im where im.candidate_id=d.candidate_id)=2 limit 1) order by c.id`;
    expect(rows).toHaveLength(2);
    const first=await getContractDetail(String(rows[0]!.id));const second=await getContractDetail(String(rows[1]!.id));
    expect(first?.natId).not.toBe(second?.natId);
    expect(first?.caNoticeId).not.toBe(second?.caNoticeId);
    expect(first?.publications).toEqual(second?.publications);
    expect(first?.publications).toHaveLength(2);
    expect(first?.countedOnce).toBe(true);expect(second?.countedOnce).toBe(true);
    expect(first?.contractValueExact).toBe(second?.contractValueExact);
    expect(first?.winners).toEqual(second?.winners);
    expect(first?.tendersReceived).toBe(second?.tendersReceived);
    expect(await getContractDetail('bad-id')).toBeNull();
   }finally{if(previous)globals.__seapSql=previous;else delete globals.__seapSql;}
  });
 });
 it.skipIf(process.env.TEST_VERSION_FIXTURE!=='1')('keeps old values visible and only the latest verified version in statistics',async()=>{
  const globals=globalThis as unknown as {__seapSql?:DbSql};const previous=globals.__seapSql;globals.__seapSql=sql!;
  try{
   const old=await getContractDetail('107338420'),latest=await getContractDetail('108153641');
   expect(old!.contractValueExact).toBe('49781431.91');expect(latest!.contractValueExact).toBe('57143904.29');
   expect(old!.publications).toEqual(latest!.publications);
   expect(old!.publications.find(p=>p.canonical)?.natId).toBe('108153641');
   expect(old!.winners.every(w=>w.shareRon===null)).toBe(true);
   const rows=await sql!`select c.ca_notice_contract_id::text id,sum(t.closing_value)::numeric(20,2)::text value
    from marts.contract_transactions t join core.contracts c on c.id=t.contract_id
    where c.ca_notice_contract_id in(107338420,108116431,108153641) group by c.ca_notice_contract_id`;
   expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({id:'108153641',value:'57143904.29'});
  }finally{if(previous)globals.__seapSql=previous;else delete globals.__seapSql;}
 });

});
