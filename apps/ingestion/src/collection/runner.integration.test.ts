import {beforeAll,afterAll,beforeEach,describe,it,expect} from 'vitest';
import {createDb,CollectionProxyFailureError} from '@seap/db';
import {createHttpClient} from '@seap/scraper-clients';
import {insertTasks,recoveryStep,recoverInterrupted,seedRecovery} from './runner.js';
import {task} from './plan.js';
const url=process.env['TEST_DATABASE_URL'];
if(url&&!/^seap_test_/.test(new URL(url).pathname.slice(1)))throw Error('Isolated test DB required');
const {sql:q}=createDb(url);
describe.skipIf(!url)('recovery manifest (isolated DB, no source traffic)',()=>{
 beforeAll(async()=>{await q`insert into app.collection_control(id) values(1) on conflict do nothing`;});
 beforeEach(async()=>{await q`truncate app.collection_tasks,app.collection_batches cascade`;await q`truncate app.collection_requests`;await q`update app.collection_control set paused=false,maintenance=false,blocked_reason=null,blocked_until=null,paused_streams='[]',daily_limit=null`;
 await q`insert into app.collection_batches(id,end_day,next_stream) values('fixture','2026-09-25',0)`;});
 afterAll(async()=>{await q.end();});
 it('commits archive, checkpoint and child tasks together and does not repeat a finished task',async()=>{
  await insertTasks(q,[task('fixture','da','da',{authorityId:7848,from:'2026-07-01',to:'2026-09-25',page:0})]);
  let calls=0;const fetcher=async()=>{calls++;return {total:1,items:[{directAcquisitionId:99123456,finalizationDate:'2026-07-15T12:00:00+03:00'}]};};
  expect(await recoveryStep(q,fetcher)).toBe(true);expect(await recoveryStep(q,fetcher)).toBe(false);expect(calls).toBe(1);
  const [t]=await q`select * from app.collection_tasks`;expect(t?.status).toBe('complete');
  const [r]=await q`select count(*)::int n from raw.raw_documents where external_id='da:99123456'`;expect(r?.n).toBe(1);
 });
 it('lets two lanes claim distinct tasks and commit their independent archives',async()=>{
  await insertTasks(q,[task('fixture','da','da',{authorityId:7848,from:'2026-07-01',to:'2026-09-25',page:0}),task('fixture','da','da',{authorityId:7849,from:'2026-07-01',to:'2026-09-25',page:0})]);
  let release!:()=>void,started!:()=>void;
  const held=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>started=r);const ids:number[]=[];
  const first=recoveryStep(q,async t=>{ids.push(t.id!);started();await held;return {total:0,items:[]};},'0');
  await ready;
  try{
   expect(await recoveryStep(q,async t=>{ids.push(t.id!);return {total:0,items:[]};},'1')).toBe(true);
   expect(new Set(ids).size).toBe(2);
   expect((await q`select status from app.collection_batches where id='fixture'`)[0]!.status).toBe('collecting');
  }finally{release();await first;}
  expect((await q`select count(*)::int n from app.collection_tasks where status='complete'`)[0]!.n).toBe(2);
 });
 it('does not turn an exhausted proxy failure into a global stop through the HTTP-client boundary',async()=>{
  await insertTasks(q,[task('fixture','da','da',{authorityId:7848,from:'2026-07-01',to:'2026-09-25',page:0}),task('fixture','da','da',{authorityId:7849,from:'2026-07-01',to:'2026-09-25',page:0})]);
  const client=createHttpClient({baseUrl:'https://example.test',userAgent:'fixture',maxRetries:0,transport:async()=>{throw new CollectionProxyFailureError('Scoped failure');}});
  expect(await recoveryStep(q,()=>client.getJson('/fixture'))).toBe(true);
  expect((await q`select blocked_reason from app.collection_control`)[0]!.blocked_reason).toBeNull();
  expect((await q`select count(*)::int n from app.collection_tasks where status='failed'`)[0]!.n).toBe(1);
  expect(await recoveryStep(q,async()=>({total:0,items:[]}))).toBe(true);
 });
 it('rolls back task completion and archive if a downstream task write fails',async()=>{
  await insertTasks(q,[task('fixture','awards','list',{from:'2026-09-25',to:'2026-09-25',page:0})]);
  await q`alter table app.collection_tasks add constraint test_reject_children check(kind<>'contracts')`;
  try{await recoveryStep(q,async()=>({total:1,items:[{caNoticeId:99123457,sysNoticeTypeId:18,sysNoticeVersionId:2,noticeStateDate:'2026-09-25T12:00:00+03:00'}]}));
   const [r]=await q`select count(*)::int n from raw.raw_documents where external_id='award:99123457'`;expect(r?.n).toBe(0);
   const [t]=await q`select status from app.collection_tasks`;expect(t?.status).toBe('failed');
   const [c]=await q`select blocked_reason from app.collection_control`;expect(c?.blocked_reason).toBeTruthy();
  }finally{await q`alter table app.collection_tasks drop constraint test_reject_children`;}
 });
 it('does not fetch while paused and preserves queued work',async()=>{
  await insertTasks(q,[task('fixture','da','da',{from:'2026-07-01',to:'2026-09-25',authorityId:7848,page:0})]);await q`update app.collection_control set paused=true`;
  expect(await recoveryStep(q,async()=>{throw Error('Must not reach source');})).toBe(false);
  const [t]=await q`select status from app.collection_tasks`;expect(t?.status).toBe('pending');
 });
 it('blocks orphan tasks instead of automatically retrying after restart',async()=>{
  await insertTasks(q,[{...task('fixture','catalogue','catalogue',{page:0}),status:'running'}]);expect(await recoverInterrupted(q)).toBe(1);
  expect(await recoveryStep(q,async()=>{throw Error('Must not retry');})).toBe(false);
 });
 it('initializes bound windows idempotently without touching legacy watermarks',async()=>{
  await q`truncate app.collection_tasks,app.collection_batches cascade`;
  const before=await q`select * from core.ingestion_watermarks`;await seedRecovery(q,'2026-09-25');await seedRecovery(q,'2026-09-25');
  const [r]=await q`select count(*)::int n from app.collection_tasks where kind='list'`;expect(r?.n).toBe(536);
  expect(await q`select * from core.ingestion_watermarks`).toEqual(before);
 });
});
