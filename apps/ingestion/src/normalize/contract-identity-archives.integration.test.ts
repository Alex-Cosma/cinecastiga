import {runScheduledContractEvidence,CONTRACT_EVIDENCE_REPAIR_ID} from './scheduled-contract-evidence.js';
import {afterAll,describe,it,expect} from 'vitest';
import {createDb,type DbSql} from '@seap/db';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {importRecoveredIdentityArchives,readRecoveredIdentityArchives} from './contract-identity-archives.js';
const url=new URL(process.env.DATABASE_URL??'postgres://invalid/');
const isolated=['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&url.pathname==='/seap_test_currency_reporting_20261011';
const {sql}=createDb();afterAll(()=>sql.end());
describe.skipIf(!isolated)('immutable recovered identity evidence',()=>{
 it('preserves exact JSON decimals, pins the full file, rolls back bad imports, and leaves raw untouched',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'identity-evidence-')),file=join(dir,'evidence.jsonl');
  const content='{"id":"1","source":"elicitatie","external_id":"award:999999999","endpoint_version":"award-contracts:v1","content_hash":"'+'a'.repeat(64)+'","payload":{"caNoticeId":999999999,"items":[{"contractValue":1234567890.123456789}]}}\n';
  const hash=createHash('sha256').update(content).digest('hex');
  await writeFile(file,content);
  const rollback=Error('archive fixture rollback');
  try{await expect(sql.begin(async tx=>{
   const q=tx as unknown as DbSql;
   const [raw]=await q`select count(*)::int n from raw.raw_documents`;
   await expect(importRecoveredIdentityArchives(q,file,'0'.repeat(64),'fixture-exact')).rejects.toThrow('SHA-256');
   expect(await readRecoveredIdentityArchives(q,['award:999999999'])).toHaveLength(0);
   expect(await importRecoveredIdentityArchives(q,file,hash,'fixture-exact')).toMatchObject({total:1,inserted:1});
   expect(await importRecoveredIdentityArchives(q,file,hash,'fixture-exact')).toMatchObject({total:1,inserted:0});
   const rows=await q`select payload->'items'->0->>'contractValue' value from marts.contract_identity_archives where source='fixture-exact'`;
   expect(rows[0]!.value).toBe('1234567890.123456789');
   expect(await readRecoveredIdentityArchives(q,['award:999999999'])).toHaveLength(1);
   expect(await readRecoveredIdentityArchives(q,['award:123'])).toHaveLength(0);
   expect((await q`select count(*)::int n from raw.raw_documents`)[0]!.n).toBe(raw!.n);
   // The production hook requires a frozen full run and verified backup;
   // importing once does not complete/reopen the publication by itself.
   const run='00000000-0000-4000-8000-000000009996';
   await q`insert into app.collection_control(id,paused,maintenance,revision) values(1,true,true,99) on conflict(id) do update set paused=true,maintenance=true,revision=99`;
   await q`insert into app.processing_runs(id,scheduled_day,scope,control_revision,before_control,raw_boundary,stage,stages)
    values(${run}::uuid,'2099-10-12','full',99,'{}',100,'identity-repair','{}')`;
   await q`insert into app.data_repairs(id,scheduled_day,status,report) values(${CONTRACT_EVIDENCE_REPAIR_ID},'2099-10-12','scheduled',
    ${JSON.stringify({configuration:{files:[{path:file,sha256:hash,source:'fixture-exact'}]}})}::jsonb)`;
   // Use a connection wrapper because this hook owns its own transaction.
   const nested=Object.assign((...args:unknown[])=>(q as any)(...args),{begin:(fn:any)=>(tx as any).savepoint(fn)}) as unknown as DbSql;
   await expect(runScheduledContractEvidence(nested,run)).rejects.toThrow('backed-up');
   await q`update app.processing_runs set stages='{"backup":{"completedAt":"ok"},"backup-verified":{"completedAt":"ok"},"normalize":{"completedAt":"ok"}}' where id=${run}::uuid`;
   expect(await runScheduledContractEvidence(nested,run)).toMatchObject({imported:[{total:1,inserted:0}]});
   expect((await q`select status from app.data_repairs where id=${CONTRACT_EVIDENCE_REPAIR_ID}`)[0]!.status).toBe('applied');
   expect(await runScheduledContractEvidence(nested,run)).toMatchObject({imported:[{total:1,inserted:0}]});
   await q`update app.data_repairs set status='completed' where id=${CONTRACT_EVIDENCE_REPAIR_ID}`;
   expect(await runScheduledContractEvidence(nested,run)).toBeNull();
   throw rollback;
  })).rejects.toBe(rollback);}finally{await rm(dir,{recursive:true,force:true});}
 });
});
