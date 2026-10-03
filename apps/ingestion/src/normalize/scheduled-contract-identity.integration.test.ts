import {afterAll,describe,expect,it} from 'vitest';
import {createDb,type DbSql} from '@seap/db';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {seedVerifiedIdentity} from '../test/contract-identity-fixture.js';
import {runScheduledIdentityRepair,IDENTITY_REPAIR_ID,prepareIdentityRepair,type IdentityRepairBundle} from './scheduled-contract-identity.js';
const isolated=new URL(process.env.DATABASE_URL??'postgres://invalid/').pathname.startsWith('/seap_test_currency_');
const {sql}=createDb();afterAll(()=>sql.end());
function scoped(q:DbSql,prefix:string):DbSql {
 const rewrite=(s:string)=>s.replace(/\b(core|raw|app|marts)\./g,`${prefix}_$1.`);
 const f=((parts:TemplateStringsArray,...values:unknown[])=>{const mapped=parts.map(rewrite);Object.defineProperty(mapped,'raw',{value:parts.raw.map(rewrite)});return q(mapped as unknown as TemplateStringsArray,...values as never[]);}) as unknown as DbSql;
 Object.assign(f,{begin:(fn:(tx:DbSql)=>Promise<unknown>)=>(q as any).savepoint((tx:DbSql)=>fn(scoped(tx,prefix)))});return f;
}
describe.skipIf(!isolated)('one-time scheduled identity repair',()=>{
 it('pins evidence, requires backup/currency/full date, rolls back errors and never repeats',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'seap-identity-'));const path=join(dir,'bundle.gz');const rollback=Error('rollback scheduled identity fixture');
  try{await expect(sql.begin(async tx=>{
   const prefix=`identity_once_${process.pid}`;
   for(const [schema,tables] of Object.entries({app:['data_repairs','processing_runs','collection_control'],core:['contracts','awards','entities','contract_winners'],raw:['raw_documents'],marts:['contract_identity_members','contract_identity_decisions','contract_identity_candidates','contract_identity_observations']})){
    await tx.unsafe(`create schema ${prefix}_${schema}`);
    for(const table of tables)await tx.unsafe(`create table ${prefix}_${schema}.${table} (like ${schema}.${table} including all)`);
   }
   const q=scoped(tx as unknown as DbSql,prefix);
   // Foreign keys in the real schema require a CPV row; LIKE does not copy FKs.
   const {assessed,archives}=await seedVerifiedIdentity(q);
   await q`delete from marts.contract_identity_members`;await q`delete from marts.contract_identity_decisions`;
   const bundle:IdentityRepairBundle={version:1,groups:[assessed],archives,expected:{groups:1,duplicates:1,reductionRon:'100'}};
   const bytes=gzipSync(JSON.stringify(bundle));await writeFile(path,bytes);const sha=createHash('sha256').update(bytes).digest('hex');
   expect((await prepareIdentityRepair(q,bundle,'100')).impact?.duplicates).toBe(1);
   await q`insert into core.contracts(id,raw_id,ca_notice_contract_id,ca_notice_id,contract_no,contract_date,contract_value,currency,title,lots_caption,cpv_code)
    select 9,9,109,ca_notice_id,contract_no,contract_date,contract_value,currency,title,lots_caption,cpv_code from core.contracts where id=1`;
   await q`insert into core.contract_winners(contract_id,entity_id) values(9,10)`;
   await expect(prepareIdentityRepair(q,bundle,'100')).rejects.toThrow('multiplicity');
   await q`delete from core.contract_winners where contract_id=9`;await q`delete from core.contracts where id=9`;
   const run='00000000-0000-4000-8000-000000008888';
   await q`insert into app.collection_control(id,paused,maintenance) values(1,true,true)`;
   await q`insert into app.processing_runs(id,scheduled_day,scope,control_revision,before_control,raw_boundary,stage,stages)
    values(${run}::uuid,'2026-10-04','full',1,'{}','100','identity-repair','{"backup":{"completedAt":"2026-10-04T02:10:00Z"},"normalize":{"completedAt":"2026-10-04T02:12:00Z"}}')`;
   await q`insert into app.data_repairs(id,scheduled_day,report) values(${IDENTITY_REPAIR_ID},'2026-10-05',${JSON.stringify({configuration:{path,sha256:sha}})}::jsonb)`;
   expect(await runScheduledIdentityRepair(q,run)).toBeNull();
   await q`update app.data_repairs set scheduled_day='2026-10-04'`;
   await expect(runScheduledIdentityRepair(q,run)).rejects.toThrow('Currency repair');
   await q`insert into app.data_repairs(id,scheduled_day,status,processing_run_id) values('contract-money-v1','2026-10-04','applied',${run}::uuid)`;
   for(const bad of ['daily','backup']){
    await q`update app.data_repairs set status='scheduled' where id=${IDENTITY_REPAIR_ID}`;
    await q`update app.processing_runs set scope=${bad==='daily'?'daily':'full'},stage=${bad==='backup'?'backup':'identity-repair'}`;
    await expect(runScheduledIdentityRepair(q,run)).rejects.toThrow('backed-up');
   }
   await q`update app.processing_runs set scope='full',stage='identity-repair'`;
   await q`update app.data_repairs set status='scheduled' where id=${IDENTITY_REPAIR_ID}`;
   await writeFile(path,'corrupted');await expect(runScheduledIdentityRepair(q,run)).rejects.toThrow('checksum');
   expect((await q`select count(*)::int n from marts.contract_identity_decisions`)[0]!.n).toBe(0);
   await writeFile(path,bytes);await q`update app.data_repairs set status='scheduled' where id=${IDENTITY_REPAIR_ID}`;
   expect((await runScheduledIdentityRepair(q,run))?.approvedGroups).toBe(1);
   expect((await q`select status from app.data_repairs where id=${IDENTITY_REPAIR_ID}`)[0]!.status).toBe('applied');
   await expect(runScheduledIdentityRepair(q,run)).rejects.toThrow('operator recovery');
   await q`update app.data_repairs set status='completed' where id=${IDENTITY_REPAIR_ID}`;
   expect(await runScheduledIdentityRepair(q,run)).toBeNull();
   await q`update app.data_repairs set status='scheduled',scheduled_day='2026-10-03' where id=${IDENTITY_REPAIR_ID}`;
   await expect(runScheduledIdentityRepair(q,run)).rejects.toThrow('backed-up');
   throw rollback;
  })).rejects.toBe(rollback);}finally{await rm(dir,{recursive:true,force:true});}
 },30_000);
});
