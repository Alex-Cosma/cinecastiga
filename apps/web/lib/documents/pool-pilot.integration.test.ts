import {afterAll,beforeEach,describe,it,expect} from 'vitest';
import {createDb} from '@seap/db';
import {setTimeout as sleep} from 'node:timers/promises';
import {runDocumentPoolPilot} from './pool-pilot';
import {runDocumentJob,runWorkerOnce} from './worker';
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_/.test(new URL(url).pathname.slice(1)))throw Error('Isolated DB required');
const connection=url?createDb(url,{max:16}):null;
afterAll(async()=>{if(connection)await connection.sql`truncate app.document_requests,app.document_pages,app.document_jobs,app.procurement_documents,app.document_notices,app.document_batches,app.document_blobs cascade`;await connection?.sql.end();});
describe.skipIf(!connection)('bounded document pool (isolated DB, no source traffic)',()=>{
 beforeEach(async()=>{
  const q=connection!.sql;
  await q`truncate app.document_requests,app.document_pages,app.document_jobs,app.procurement_documents,app.document_notices,app.document_batches,app.document_blobs cascade`;
  await q`truncate app.collection_requests,app.collection_retries cascade`;
  await q`update app.collection_control set paused=false,maintenance=false,blocked_reason=null,paused_streams='[]'`;
  await q`update app.collection_proxy_control set enabled=true`;
  await q`insert into app.document_batches(id,max_requests,max_files,concurrency) values('fixture-pool',100,6,3)`;
  await q`insert into app.document_blobs(hash,bytes,mime) values('pool-original',${Buffer.from('%PDF-fixture')},'application/pdf')`;
  for(let i=0;i<3;i++){
   await q`insert into app.document_notices(key,notice_id,notice_type,notice_no,title,url) values(${`pool-${i}`},${String(i+1)},17,${`SCN${i}`},'Fixture','https://example.test')`;
   await q`insert into app.document_jobs(notice_key,kind,dedup_key,requested_by,batch_id) values(${`pool-${i}`},'list',${`pool-list-${i}`},'fixture','fixture-pool')`;
  }
 });
 it('overlaps downloads with bounded parallel OCR, preserving checkpoints and ordinary queued work',async()=>{
  const q=connection!.sql;
  await q`insert into app.document_jobs(notice_key,kind,dedup_key,requested_by) values('pool-0','list','ordinary','fixture')`;
  let downloading=0,processing=0,maxDownload=0,maxProcess=0,overlap=false;
  await runDocumentPoolPilot(q,'fixture-pool',new AbortController().signal,async(db,job,_signal,_max,phase)=>{
   if(job.kind==='list'){
    for(let i=0;i<2;i++)await db`insert into app.procurement_documents(notice_key,source_id,code,filename) values(${job.notice_key},${String(i)},${String(i)},${`file-${i}.pdf`})`;
   }else if(phase==='download'){
    downloading++;maxDownload=Math.max(maxDownload,downloading);await sleep(350);
    await db`update app.procurement_documents set original_hash='pool-original',downloaded_at=now() where id=${job.document_id}`;downloading--;
   }else{
    processing++;maxProcess=Math.max(maxProcess,processing);overlap ||= downloading>0;await sleep(80);
    expect((await db`select original_hash from app.procurement_documents where id=${job.document_id}`)[0]!.original_hash).toBe('pool-original');
    await db`update app.procurement_documents set processed_at=now() where id=${job.document_id}`;processing--;
   }
  });
  expect(maxDownload).toBe(3);expect(maxProcess).toBeGreaterThan(1);expect(maxProcess).toBeLessThanOrEqual(4);expect(overlap).toBe(true);
  expect((await q`select status from app.document_batches where id='fixture-pool'`)[0]!.status).toBe('complete');
  expect((await q`select count(*)::int n from app.document_jobs where batch_id='fixture-pool' and status='complete'`)[0]!.n).toBe(9);
  expect((await q`select status from app.document_jobs where dedup_key='ordinary'`)[0]!.status).toBe('queued');
 });
 it('admits exactly four extraction jobs, never a fifth',async()=>{
  let active=0,peak=0;
  await runDocumentPoolPilot(connection!.sql,'fixture-pool',new AbortController().signal,async(db,job,_signal,_max,phase)=>{
   if(job.kind==='list')for(let i=0;i<2;i++)await db`insert into app.procurement_documents(notice_key,source_id,code,filename) values(${job.notice_key},${String(i)},${String(i)},'file.pdf')`;
   else if(phase==='download')await db`update app.procurement_documents set original_hash='pool-original',downloaded_at=now() where id=${job.document_id}`;
   else{active++;peak=Math.max(peak,active);await sleep(350);active--;}
  });
  expect(peak).toBe(4);expect(active).toBe(0);
 });
 it('keeps failed files separate without stopping healthy downloads',async()=>{
  const q=connection!.sql;
  await runDocumentPoolPilot(q,'fixture-pool',new AbortController().signal,async(db,job,_signal,_max,phase)=>{
   if(job.kind==='list')await db`insert into app.procurement_documents(notice_key,source_id,code,filename) values(${job.notice_key},'1','1','file.pdf')`;
   else if(job.notice_key==='pool-0')throw Error('SEAP: fixture failure');
   else if(phase==='download')await db`update app.procurement_documents set original_hash='pool-original',downloaded_at=now() where id=${job.document_id}`;
   else await db`update app.procurement_documents set processed_at=now() where id=${job.document_id}`;
  });
  expect((await q`select count(*)::int n from app.document_jobs where batch_id='fixture-pool' and kind='file' and status='failed'`)[0]!.n).toBe(1);
  expect((await q`select count(*)::int n from app.procurement_documents where processed_at is not null`)[0]!.n).toBe(2);
  expect((await q`select status from app.document_batches where id='fixture-pool'`)[0]!.status).toBe('stopped');
 });
 it('does not let the ordinary worker start an unattended operator batch',async()=>{
  expect(await runWorkerOnce(connection!.sql,new AbortController().signal,async()=>{throw Error('must not run');})).toBe(false);
 });
 it('a processing-only attempt never reacquires missing original bytes',async()=>{
  const q=connection!.sql,[doc]=await q`insert into app.procurement_documents(notice_key,source_id,code,filename) values('pool-0','1','1','file.pdf') returning id`;
  const [job]=await q`insert into app.document_jobs(notice_key,document_id,kind,dedup_key,requested_by) values('pool-0',${doc!.id},'file','missing-original','fixture') returning *`;
  await expect(runDocumentJob(q,job!,new AbortController().signal,undefined,'process')).rejects.toThrow('nu face cereri SEAP');
  expect(await q`select id from app.collection_requests`).toHaveLength(0);
 });
});
