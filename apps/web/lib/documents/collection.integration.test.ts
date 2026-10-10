import {afterAll,beforeEach,describe,it,expect} from 'vitest';
import {createDb,runCollectionRequest,type DbSql} from '@seap/db';
import {setTimeout as sleep} from 'node:timers/promises';
import {seedDocumentInventory,fillDocumentQueue,runAutomaticCollector,runAutomaticJob,recoverAutomaticJobs} from './collection';
import {changeDocumentCollection,documentCollectionStatus} from '../admin/document-collection';
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_/.test(new URL(url).pathname.slice(1)))throw Error('Isolated DB required');
const db=url?createDb(url,{max:20}):null;
afterAll(async()=>{await db?.sql.end();});
describe.skipIf(!db)('continuous document collection, no source HTTP',()=>{
 beforeEach(async()=>{
  const q=db!.sql;
  await q`truncate app.document_requests,app.document_pages,app.document_jobs,app.procurement_documents,app.document_notices,app.document_batches,app.document_blobs cascade`;
  await q`truncate core.notices cascade`;
  await q`truncate app.collection_requests,app.collection_retries cascade`;
  await q`update app.collection_control set paused=false,maintenance=false,blocked_reason=null,paused_streams='[]'`;
  await q`update app.document_collection_control set enabled=false,paused=false,revision=0,error=null,download_concurrency=10,processing_concurrency=4`;
  await q`update app.collection_proxy_control set enabled=true`;
  await q`insert into app.collection_proxies(id,server,exit_ip,configured,enabled) values('proxy-999','http://192.0.2.99:80','192.0.2.99',true,true) on conflict(id) do update set configured=true,enabled=true`;
  await q`insert into app.document_blobs(hash,bytes,mime) values('auto-original',${Buffer.from('%PDF-fixture')},'application/pdf')`;
 });
 async function notice(id:number){await db!.sql`insert into core.notices(raw_id,c_notice_id,notice_no,title,sys_notice_type_id,state_date) values(1,${id},${'SCN'+id},'Fixture',17,now()-${id}*interval '1 day')`;}
 it('requires explicit start and scopes inventory to compatible source identities',async()=>{
  await notice(1);await db!.sql`insert into core.notices(raw_id,c_notice_id,notice_no,sys_notice_type_id) values(1,1,'CN1',2)`;
  expect(await runAutomaticCollector(db!.sql,new AbortController().signal)).toBe(false);
  await seedDocumentInventory(db!.sql);await seedDocumentInventory(db!.sql);await fillDocumentQueue(db!.sql);await fillDocumentQueue(db!.sql);
  expect(await db!.sql`select id from app.document_jobs`).toHaveLength(1);
  expect((await db!.sql`select url from app.document_notices`)[0]!.url).toContain('/simplified-notice/v2/view/1');
  const s=await documentCollectionStatus(db!.sql);expect(s.coverage).toMatchObject({eligible:1,unsupported:1});expect(s.inventory.checked).toBe(0);
 });
 it('bounds materialized inventory to forty jobs and prioritizes recent notices',async()=>{
  for(let i=1;i<=45;i++)await notice(i);
  await seedDocumentInventory(db!.sql);await fillDocumentQueue(db!.sql);await fillDocumentQueue(db!.sql);
  expect(await db!.sql`select id from app.document_jobs`).toHaveLength(40);
  expect(await db!.sql`select id from app.document_jobs where notice_key='17:45'`).toHaveLength(0);
 });
 it('checkpoints downloads before OCR and retries processing from retained original',async()=>{
  const q=db!.sql;await notice(1);await seedDocumentInventory(q);
  const [d]=await q`insert into app.procurement_documents(notice_key,source_id,code,filename) values('17:1','1','1','file.pdf') returning id`;
  await fillDocumentQueue(q);
  let [job]=await q`update app.document_jobs set status='running' where kind='file' returning *`;
  await runAutomaticJob(q,job!,'download',new AbortController().signal,async()=>{await q`update app.procurement_documents set original_hash='auto-original',downloaded_at=now() where id=${d!.id}`;});
  [job]=await q`select * from app.document_jobs where kind='file'`;expect(job).toMatchObject({status:'queued',stage:'process_queued',attempts:0});
  for(let i=1;i<=3;i++){
   [job]=await q`update app.document_jobs set status='running' where kind='file' returning *`;
   await runAutomaticJob(q,job!,'process',new AbortController().signal,async()=>{throw Error('Procesarea fixture a eșuat.');});
   const [after]=await q`select *,extract(epoch from(retry_at-now())) seconds from app.document_jobs where kind='file'`;
   expect(after!.attempts).toBe(i);expect(after!.status).toBe(i<3?'queued':'failed');if(i<3)expect(Number(after!.seconds)).toBeGreaterThan(i===1?295:595);
  }
  expect((await q`select original_hash from app.procurement_documents`)[0]!.original_hash).toBe('auto-original');
  expect(await q`select id from app.collection_requests`).toHaveLength(0);
 });
 it('pause/resume/retry uses revision guards without changing global source controls',async()=>{
  const q=db!.sql,actor={id:'fixture',name:'Fixture'};
  await changeDocumentCollection(actor,{action:'start',revision:0},q);
  await expect(changeDocumentCollection(actor,{action:'pause',revision:0},q)).rejects.toThrow('Statusul');
  await changeDocumentCollection(actor,{action:'pause',revision:1},q);
  expect((await q`select paused from app.collection_control`)[0]!.paused).toBe(false);
  expect((await q`select paused from app.document_collection_control`)[0]!.paused).toBe(true);
  await changeDocumentCollection(actor,{action:'resume',revision:2},q);
  expect((await q`select paused from app.document_collection_control`)[0]!.paused).toBe(false);
 });
 it('recovers orphaned jobs without discarding original files',async()=>{
  const q=db!.sql;await notice(1);await seedDocumentInventory(q);
  await q`insert into app.procurement_documents(notice_key,source_id,code,filename,original_hash) values('17:1','1','1','file.pdf','auto-original')`;
  await fillDocumentQueue(q);await q`update app.document_jobs set status='running',slot=11 where kind='file'`;
  expect(await recoverAutomaticJobs(q)).toBe(1);
  expect((await q`select status,stage from app.document_jobs where kind='file'`)[0]).toEqual({status:'queued',stage:'process_queued'});
 });
 it('records an interrupted request without blocking source traffic on worker shutdown',async()=>{
  const q=db!.sql;
  await q`update app.collection_proxy_control set enabled=false`;
  await q`update app.collection_control set next_allowed_at=null,daily_limit=null`;
  const session=await q.reserve(),stop=new AbortController();
  try{
   await expect(runCollectionRequest(session as unknown as DbSql,{stream:'documents',worker:'fixture',method:'GET',url:'https://www.e-licitatie.ro/pub/notices/simplified-notice/v2/view/1'},async()=>{stop.abort();throw Error('fixture interrupted');},stop.signal)).rejects.toMatchObject({name:'CollectionSuspendedError'});
   expect((await q`select blocked_reason from app.collection_control`)[0]!.blocked_reason).toBeNull();
   expect((await q`select outcome,diagnostics from app.collection_requests`)[0]).toMatchObject({outcome:'failed',diagnostics:{abortReason:'parent_cancelled'}});
  }finally{session.release();}
 });
 it('refuses automatic file requests when paused, without making HTTP attempts',async()=>{
  const q=db!.sql;await notice(1);await seedDocumentInventory(q);await fillDocumentQueue(q);
  const [job]=await q`update app.document_jobs set status='running' returning id`;
  await q`update app.collection_proxy_control set enabled=false`;
  await q`update app.document_collection_control set enabled=true,paused=true`;
  const session=await q.reserve();let calls=0;
  try{await expect(runCollectionRequest(session as unknown as DbSql,{stream:'documents',worker:'fixture',method:'GET',url:'https://www.e-licitatie.ro/pub/notices/simplified-notice/v2/view/1',documentJobId:job!.id},async()=>{calls++;return {value:null,status:200};})).rejects.toMatchObject({name:'CollectionSuspendedError'});expect(calls).toBe(0);expect(await q`select id from app.collection_requests`).toHaveLength(0);}
  finally{session.release();}
 });
 it('reserves capacity for an individual request without creating an eleventh browser',async()=>{
  const q=db!.sql;for(let i=1;i<=12;i++)await notice(i);await seedDocumentInventory(q);await fillDocumentQueue(q);
  await q`insert into app.document_jobs(notice_key,kind,dedup_key,requested_by) values('17:1','list','manual-fixture','fixture')`;
  await q`update app.document_collection_control set enabled=true`;
  let release!:()=>void;const held=new Promise<void>(r=>release=r),stop=new AbortController();let active=0,peak=0,manual=false;
  const runner=runAutomaticCollector(q,stop.signal,async(_db,job)=>{active++;peak=Math.max(peak,active);manual ||= !job.automatic;await held;active--;});
  try{for(let i=0;i<100&&active<10;i++)await sleep(40);expect(manual).toBe(true);expect(peak).toBe(10);await sleep(1200);expect(peak).toBe(10);}
  finally{stop.abort();release();await runner;}
 },15000);
 it('enforces ten network lanes and four processing lanes, pausing without consuming new work',async()=>{
  const q=db!.sql;for(let i=1;i<=14;i++)await notice(i);await seedDocumentInventory(q);
  await q`insert into app.procurement_documents(notice_key,source_id,code,filename,original_hash) select key,'1','1','file.pdf','auto-original' from app.document_notices`;
  await fillDocumentQueue(q);await q`update app.document_collection_control set enabled=true`;
  const stop=new AbortController();let network=0,processing=0,peakNetwork=0,peakProcessing=0;
  let release!:()=>void;const held=new Promise<void>(r=>release=r);
  const runner=runAutomaticCollector(q,stop.signal,async(db,job,_signal,_max,phase)=>{
   if(phase==='process'){processing++;peakProcessing=Math.max(peakProcessing,processing);}else{network++;peakNetwork=Math.max(peakNetwork,network);}
   await held;
   if(phase==='process'){await db`update app.procurement_documents set processed_at=now() where id=${job.document_id}`;processing--;}else{await db`update app.document_notices set checked_at=now(),total=1 where key=${job.notice_key}`;network--;}
  });
  try{
   for(let i=0;i<100&&(network<10||processing<4);i++)await sleep(50);
   expect(peakNetwork).toBe(10);expect(peakProcessing).toBe(4);
   await q`update app.document_collection_control set paused=true`;release();await sleep(1600);
   expect(await q`select id from app.document_jobs where status='running'`).toHaveLength(0);
   expect((await q`select count(*)::int n from app.document_jobs where status='complete'`)[0]!.n).toBe(14);
  }finally{release();stop.abort();await runner;}
 },15000);
});
