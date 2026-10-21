import {afterAll,describe,it,expect} from 'vitest';
import {createDb} from '@seap/db';
import {sql as query} from 'drizzle-orm';
import {PARSERS} from './parsers.js';
import {clearCopiedAwardEstimates} from './award-estimate.js';
import {runNormalize} from './pipeline.js';
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))throw Error('Dedicated test database required');
const connection=url?createDb(url):null;
afterAll(async()=>{await connection?.sql.end();});
// Data audit F22: the SEAP award list's estimatedValueExport is ronContractValue
// as text (raw award:100657530: 7088051.28 / '7088051,28 RON'; 100657501: 0 / '0 RON').
describe.skipIf(!connection)('award notices have no estimate copied from the awarded value',()=>{
 it('the award-list parser stores the awarded value only, also over an older row',async()=>{
  const rollback=new Error('rollback');
  await expect(connection!.db.transaction(async tx=>{
   const ctx={tx,cpvCatalog:new Set<string>(),cpvByPrefix:new Map<string,string>(),units:new Map()};
   const p=PARSERS['award-list:v1']!;
   await tx.execute(query`insert into core.awards(raw_id,ca_notice_id,estimated_value_ron,ron_contract_value) values(-1,99922530,7088051.28,7088051.28)`);
   for(const [id,value,text] of [[99922530,7088051.28,'7088051,28 RON'],[99922501,0,'0 RON']] as const)
    await p.load(ctx,-2n,p.schema.parse({caNoticeId:id,noticeNo:`CAN-${id}`,ronContractValue:value,estimatedValueExport:text}));
   const rows=await tx.execute(query`select ca_notice_id::text id,estimated_value_ron,ron_contract_value::text value from core.awards where ca_notice_id in (99922530,99922501) order by ca_notice_id`);
   expect(rows).toEqual([{id:'99922501',estimated_value_ron:null,value:'0'},{id:'99922530',estimated_value_ron:null,value:'7088051.28'}]);
   throw rollback;
  })).rejects.toBe(rollback);
 });
 it('clears the copies written before the fix, once',async()=>{
  const rollback=new Error('rollback');
  await expect(connection!.sql.begin(async q=>{
   await q`insert into core.awards(raw_id,ca_notice_id,estimated_value_ron,ron_contract_value) values
    (-1,99922890,496560901.91,496560901.91),(-1,99922891,0,0),(-1,99922892,null,null)`;
   expect(await clearCopiedAwardEstimates(q)).toBeGreaterThanOrEqual(2);
   const rows=await q`select ron_contract_value::text value from core.awards where ca_notice_id between 99922890 and 99922892 and estimated_value_ron is null order by ca_notice_id`;
   expect(rows.map(r=>r.value)).toEqual(['496560901.91','0',null]);
   expect(await clearCopiedAwardEstimates(q)).toBe(0);
   throw rollback;
  })).rejects.toBe(rollback);
 });
 it('is applied by the nightly normalize stage',async()=>{
  const {db,sql}=connection!;
  const [before]=await sql`select count(*)::int n from core.awards where ca_notice_id=99922999`;
  if(before!.n)throw Error('Fixture award already present in the test database');
  try{
   await sql`insert into core.awards(raw_id,ca_notice_id,estimated_value_ron,ron_contract_value) values(-1,99922999,1000,1000)`;
   expect((await runNormalize(db,sql)).awardEstimates).toBeGreaterThanOrEqual(1);
   const [row]=await sql`select estimated_value_ron,ron_contract_value::text value from core.awards where ca_notice_id=99922999`;
   expect(row).toEqual({estimated_value_ron:null,value:'1000'});
   expect((await runNormalize(db,sql)).awardEstimates).toBe(0);
  }finally{
   await sql`delete from core.awards where ca_notice_id=99922999`;
  }
 });
});
