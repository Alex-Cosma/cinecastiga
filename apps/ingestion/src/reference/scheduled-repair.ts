import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { processingStage, type DbSql } from '@seap/db';
import { repairFinancials, repairOnrc } from './repair.js';

export const REFERENCE_REPAIR_ID='reference-import-v1';
type FinancialSource={file:string;year:number;category:string;vintage:number;sha256:string;specSha256:string;rows:number;code:string};
type Bundle={version:1;snapshot:string;onrc:{file:string;sha256:string};financials:FinancialSource[]};
async function sha(path:string) {const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');}
async function checkedFile(root:string,file:string,hash:string){
 if(!/^[a-f0-9]{64}$/.test(hash)||isAbsolute(file))throw Error('Invalid repair source manifest');
 const path=await realpath(join(root,file));const rel=relative(root,path);
 if(rel.startsWith('..')||isAbsolute(rel)||await sha(path)!==hash)throw Error('Reference source checksum or path mismatch');
 return path;
}
export async function verifyReferenceBundle(directory:string,hash:string){
 const root=await realpath(directory);
 const path=await checkedFile(root,'manifest.json',hash);
 const bundle=JSON.parse(await readFile(path,'utf8')) as Bundle;
 if(bundle.version!==1||!/^\d{4}-\d{2}-\d{2}$/.test(bundle.snapshot)||!Array.isArray(bundle.financials)||!bundle.financials.length)throw Error('Invalid reference bundle');
 const reps=await checkedFile(root,bundle.onrc.file,bundle.onrc.sha256);
 const keys=new Set<string>();
 for(const f of bundle.financials){
  if(!/^[a-zA-Z0-9_.-]+\.txt$/.test(f.file))throw Error('Invalid financial filename');
  const key=`${f.category}/${f.year}/${f.vintage}`;if(keys.has(key))throw Error('Duplicate financial manifest entry');keys.add(key);
  await checkedFile(root,`financials/${f.file}`,f.sha256);
  await checkedFile(root,`financials/${f.file}.spec.csv`,f.specSha256);
 }
 return {bundle,reps,financials:join(root,'financials')};
}

/** One explicitly authorized historical correction, after the host's verified backup. */
export async function runScheduledReferenceRepair(q:DbSql,runId:string,log:(s:string)=>void=()=>{}){
 const [repair]=await q`select * from app.data_repairs where id=${REFERENCE_REPAIR_ID}`;
 if(!repair||repair.status==='completed')return null;
 try{
  const [r]=await q`select r.*,c.maintenance,c.paused from app.processing_runs r cross join app.collection_control c
    where r.id=${runId}::uuid and c.id=1`;
  if(!r||!r.maintenance||!r.paused||r.status!=='running')throw Error('Reference repair requires active maintenance');
  if(repair.scheduled_day>r.scheduled_day)return null;
  if(repair.status!=='scheduled')throw Error('Unfinished reference repair requires operator recovery');
  if(repair.scheduled_day!==r.scheduled_day||r.scope!=='full'||!r.raw_boundary||!r.stages?.backup?.completedAt||r.stage!=='backup-verified')throw Error('Reference repair requires its backed-up full run');
  const config=repair.report?.configuration;
  if(typeof config?.directory!=='string'||typeof config?.manifestSha256!=='string')throw Error('Pinned reference sources required');
  const input=await verifyReferenceBundle(config.directory,config.manifestSha256);
  await processingStage(q,runId,'reference-repair');
  return await q.begin(async tx=>{
   const sql=tx as unknown as DbSql;
   const [locked]=await sql`select status from app.data_repairs where id=${REFERENCE_REPAIR_ID} for update`;
   const [live]=await sql`select r.status,r.scope,r.stage,c.maintenance,c.paused,c.revision,r.control_revision
     from app.processing_runs r cross join app.collection_control c where r.id=${runId}::uuid and c.id=1 for share of c`;
   if(locked?.status!=='scheduled'||live?.status!=='running'||live.stage!=='reference-repair'||live.scope!=='full'||!live.maintenance||!live.paused||live.revision!==live.control_revision)throw Error('Publication state changed');
   await sql`set local work_mem='8MB'`;
   await sql`set local max_parallel_workers_per_gather=0`;
   await sql`set local jit=off`;
   await sql`set local statement_timeout='30min'`;
   const financials=await repairFinancials(sql,input.financials);
   const key=(f:{year:number;category:string;vintage:number})=>`${f.year}/${f.category}/${f.vintage}`;
   const expected=input.bundle.financials.map(({file,...f})=>f).sort((a,b)=>key(a).localeCompare(key(b)));
   const actual=[...financials.manifest].sort((a,b)=>key(a).localeCompare(key(b)));
   if(!isDeepStrictEqual(expected,actual))throw Error('Financial source cohort changed since validation');
   const onrc=await repairOnrc(sql,input.reps,input.bundle.snapshot);
   if(onrc.sha256!==input.bundle.onrc.sha256)throw Error('ONRC source changed during repair');
   const report={configuration:config,financials,onrc};
   await sql`update app.data_repairs set status='applied',processing_run_id=${runId}::uuid,applied_at=clock_timestamp(),report=${JSON.stringify(report)}::jsonb,error=null where id=${REFERENCE_REPAIR_ID}`;
   log(`Reference repair applied: ${onrc.changed} ONRC dates, ${financials.changed} financial profits`);
   return report;
  });
 }catch(error){
  log(error instanceof Error?error.message:'Reference repair failed');
  await q`update app.data_repairs set status='failed',processing_run_id=${runId}::uuid,
    error='Reparația ONRC/MF s-a oprit; tranzacția a fost anulată. Verifică sursele și jurnalul înainte de recuperare.'
    where id=${REFERENCE_REPAIR_ID} and status='scheduled'`;
  throw error;
 }
}
