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
        where exists(select 1 from marts.contract_transactions t where t.contract_id=d.canonical_contract_id) limit 1) order by c.id`;
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
});
