import {afterAll,describe,it,expect} from 'vitest';
import {createDb,contractKind,contractReportable,type DbSql} from '@seap/db';
import {repairContractTypes} from './contract-reporting.js';
const isolated=new URL(process.env.DATABASE_URL??'postgres://invalid/').pathname==='/seap_test_currency_reporting_20261011';
const {sql}=createDb();afterAll(()=>sql.end());
describe.skipIf(!isolated)('source contract kind and non-additive values',()=>{
 it('reads source types even without keywords, detects addenda, preserves source amounts and replays idempotently',async()=>{
  const rollback=Error('reporting fixture rollback');
  await expect(sql.begin(async tx=>{
   const q=tx as unknown as DbSql;
   const rows=[
    {id:-910001,kind:2,title:'Furnizare carburant',number:'49'},
    {id:-910002,kind:3,title:'Carburant pentru motoare diesel',number:'207'},
    {id:-910003,kind:3,title:'act ad 5 la AC: valoarea totală devine 75.900.253,44',number:'act ad 5'},
    {id:-910004,kind:3,title:'Act adițional nr. 6 — modalitate de constituire a garanției',number:'AA 6'},
    {id:-910005,kind:99,title:'Contract',number:'5'},
    {id:-910006,kind:3,title:'Acord-cadru medicamente',number:'6'},
    {id:-910007,kind:2,title:'Contract subsecvent 1',number:'7'},
    {id:-910008,kind:1,title:'Acord cadru furnizare',number:'8'},
   ];
   const payload={caNoticeId:-910001,items:rows.map(r=>({caNoticeId:-910001,caNoticeContractId:r.id,contractType:r.kind}))};
   await q`insert into raw.raw_documents(id,source,external_id,endpoint_version,content_hash,payload)
    values(-910001,'elicitatie','award:-910001','award-contracts:v1',${'9'.repeat(64)},${JSON.stringify(payload)}::jsonb)`;
   for(const r of rows)await q`insert into core.contracts(id,raw_id,ca_notice_contract_id,ca_notice_id,contract_value,currency,title,contract_no)
    values(${r.id},-910001,${r.id},-910001,75900253.44,'RON',${r.title},${r.number})`;
   // The repair scans positive production IDs; explicitly use the same public
   // projection through a positive isolated ID range for this fixture.
   await q`update core.contracts set id=-id+10000000 where id between -910008 and -910001`;
   const first=await repairContractTypes(q);expect(first.repaired).toBeGreaterThanOrEqual(8);
   expect((await repairContractTypes(q)).repaired).toBe(0);
   const actual=await q`select ca_notice_contract_id::text id,${contractKind(q)} kind,${contractReportable(q)} included,contract_value::text value
    from core.contracts c where id between 10910001 and 10910008 order by id`;
   expect(actual.map(r=>r.kind)).toEqual(['framework','calloff','amendment','amendment','review','review','review','review']);
   expect(actual[0]!.included).toBe(false); // even without a known call-off
   expect(actual[1]!.included).toBe(true);
   expect(actual.slice(2).every(r=>r.included===false)).toBe(true);
   expect(actual.every(r=>r.value==='75900253.44')).toBe(true);
   await q`update core.contracts set raw_id=-910002 where id=10910002`;
   expect((await q`select ${contractKind(q)} kind from core.contracts c where id=10910002`)[0]!.kind).toBe('review');
   throw rollback;
  })).rejects.toBe(rollback);
 });
});
