import {afterAll,describe,expect,it} from 'vitest';
import {createDb,type DbSql} from '@seap/db';
import {runScheduledMoneyRepair,MONEY_REPAIR_ID} from './scheduled-money-repair.js';
const isolated=new URL(process.env.DATABASE_URL??'postgres://invalid/').pathname.startsWith('/seap_test_currency_');
const {sql}=createDb();afterAll(()=>sql.end());
function scoped(q:DbSql,prefix:string):DbSql {
 const rewrite=(s:string)=>s.replace(/\b(core|raw|app|marts)\./g,`${prefix}_$1.`);
 const f=((parts:TemplateStringsArray,...values:unknown[])=>{
  const mapped=parts.map(rewrite);Object.defineProperty(mapped,'raw',{value:parts.raw.map(rewrite)});
  return q(mapped as unknown as TemplateStringsArray,...values as never[]);
 }) as unknown as DbSql;
 Object.assign(f,{unsafe:(s:string)=>q.unsafe(rewrite(s)),begin:(fn:(tx:DbSql)=>Promise<unknown>)=>(q as any).savepoint((tx:DbSql)=>fn(scoped(tx,prefix)))});
 return f;
}
describe.skipIf(!isolated)('one-time currency repair',()=>{
 it('requires its backed-up full run, rolls back on failure and never repeats an applied/completed repair',async()=>{
  const rollback=Error('fixture rollback');
  await expect(sql.begin(async tx=>{
   const prefix=`money_once_${process.pid}`;
   for(const [schema,tables] of Object.entries({app:['data_repairs','processing_runs','collection_control'],core:['contracts'],raw:['raw_documents'],marts:['contract_money_quality']})){
    await tx.unsafe(`create schema ${prefix}_${schema}`);
    for(const table of tables)await tx.unsafe(`create table ${prefix}_${schema}.${table} (like ${schema}.${table} including all)`);
   }
   const q=scoped(tx as unknown as DbSql,prefix);
   const run='00000000-0000-4000-8000-000000009999';
   await q`insert into app.collection_control(id,paused,maintenance) values(1,true,true)`;
   await q`insert into app.processing_runs(id,scheduled_day,scope,control_revision,before_control,raw_boundary,stage,stages)
    values(${run}::uuid,'2026-10-04','full',1,'{}','1','backup-verified','{"backup":{"completedAt":"2026-10-04T02:15:00Z"}}')`;
   await q`insert into app.data_repairs(id,scheduled_day) values(${MONEY_REPAIR_ID},'2026-10-05')`;
   expect(await runScheduledMoneyRepair(q,run)).toBeNull();
   await q`update app.data_repairs set scheduled_day='2026-10-04'`;
   await q`update app.processing_runs set scope='daily'`;
   await expect(runScheduledMoneyRepair(q,run)).rejects.toThrow('scheduled full run');
   expect((await q`select status from app.data_repairs`)[0]?.status).toBe('failed');
   await q`update app.processing_runs set scope='full',stage='backup'`;
   await q`update app.data_repairs set status='scheduled'`;
   await expect(runScheduledMoneyRepair(q,run)).rejects.toThrow('verified backup');
   await q`update app.data_repairs set status='scheduled'`;
   await q`update app.processing_runs set stage='backup-verified'`;
   const payload={caNoticeId:1,items:[{caNoticeId:1,caNoticeContractId:7,contractValue:100,defaultCurrencyContractValue:500,currencyRate:5,currency:{text:'EUR'}}]};
   await q`insert into raw.raw_documents(id,source,external_id,endpoint_version,content_hash,payload)
    values(1,'elicitatie','fixture','award-contracts:v1',${'a'.repeat(64)},${JSON.stringify(payload)}::jsonb)`;
   await q`insert into core.contracts(id,raw_id,ca_notice_id,ca_notice_contract_id,contract_value,currency) values(7,1,1,7,500,'EUR')`;
   const report=await runScheduledMoneyRepair(q,run);
   expect(report?.matched).toBe(1);
   expect((await q`select original_value::text,value_ron::text,contract_value::text from core.contracts`)[0]).toEqual({original_value:'100',value_ron:'500',contract_value:'500'});
   expect((await q`select status from app.data_repairs`)[0]?.status).toBe('applied');
   await expect(runScheduledMoneyRepair(q,run)).rejects.toThrow('operator recovery');
   await q`update app.data_repairs set status='completed',completed_at=now()`;
   expect(await runScheduledMoneyRepair(q,run)).toBeNull();
   // A failed source validation rolls the entire replay back, including its marker.
   await q`drop table currency_replay_targets`;
   await q`update app.data_repairs set status='scheduled'`;
   await q`update app.processing_runs set stage='backup-verified'`;
   const bad={...payload,items:[payload.items[0],payload.items[0]]};
   await q`update raw.raw_documents set payload=${JSON.stringify(bad)}::jsonb where id=1`;
   await expect(runScheduledMoneyRepair(q,run)).rejects.toThrow('Duplicate archived');
   expect((await q`select status from app.data_repairs`)[0]?.status).toBe('failed');
   throw rollback;
  })).rejects.toBe(rollback);
 },30_000);
});
