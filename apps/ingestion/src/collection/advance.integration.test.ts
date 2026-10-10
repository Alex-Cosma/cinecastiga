import {afterAll,beforeEach,describe,expect,it} from 'vitest';
import {createDb} from '@seap/db';
import {advanceRecovery} from './advance.js';
import {insertTasks,recoveryStep} from './runner.js';
import {task} from './plan.js';
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_/.test(new URL(url).pathname.slice(1)))throw Error('Isolated database required');
const {sql:q}=createDb(url);
afterAll(async()=>{await q.end();});
describe.skipIf(!url)('daily closed-window extension (no source HTTP)',()=>{
 beforeEach(async()=>{
  await q`truncate app.collection_tasks,app.collection_batches cascade`;await q`truncate app.collection_audit`;
  await q`update app.collection_control set paused=false,maintenance=false,blocked_reason=null,paused_streams='[]',daily_limit=null`;
  await q`insert into app.collection_batches(id,end_day,next_stream) values('fixture','2026-09-25',3)`;
  await insertTasks(q,[{...task('fixture','da','da',{authorityId:777001,from:'2026-07-01',to:'2026-09-25',page:0}),status:'complete'}]);
 });
 const now=new Date('2026-10-06T12:00:00Z');
 it('requires opt-in and does not turn a deployment into automatic new collection',async()=>{
  expect(await advanceRecovery(q,{now})).toBeNull();expect((await q`select end_day from app.collection_batches`)[0]!.end_day).toBe('2026-09-25');
 });
 it('appends the missing closed interval, preserves history and retries, and is idempotent',async()=>{
  const before=await q`select * from app.collection_tasks`;const watermarks=await q`select * from core.ingestion_watermarks`;
  await q`insert into app.collection_retries(task_id,first_request_id,last_request_id,timeouts,status) values(${before[0]!.id},1,2,3,'stopped')`;
  await advanceRecovery(q,{enable:true,now});
  expect((await q`select seed_end_day,end_day,follow_latest from app.collection_batches`)[0]).toMatchObject({seed_end_day:'2026-09-25',end_day:'2026-10-05',follow_latest:true});
  expect(await q`select * from app.collection_tasks where id=${before[0]!.id}`).toEqual(before);
  expect((await q`select params from app.collection_tasks where kind='da' and params->>'from'='2026-09-26' and params->>'authorityId'='777001'`)[0]!.params).toEqual({authorityId:777001,from:'2026-09-26',to:'2026-10-05',page:0});
  expect((await q`select count(*)::int n from app.collection_tasks where kind='list'`)[0]!.n).toBe(20);
  const count=(await q`select count(*)::int n from app.collection_tasks`)[0]!.n;
  expect((await advanceRecovery(q,{now}))!.added).toBe(0);expect((await q`select count(*)::int n from app.collection_tasks`)[0]!.n).toBe(count);
  expect((await q`select timeouts,status from app.collection_retries`)[0]).toMatchObject({timeouts:3,status:'stopped'});
  expect(await q`select * from core.ingestion_watermarks`).toEqual(watermarks);
 });
 it('waits until 02:00 Bucharest and concurrent invocations append each day once',async()=>{
  await advanceRecovery(q,{enable:true,now:new Date('2026-10-05T22:59:00Z')});
  expect((await q`select end_day from app.collection_batches`)[0]!.end_day).toBe('2026-10-04');
  const results=await Promise.all([1,2].map(()=>advanceRecovery(q,{now:new Date('2026-10-05T23:00:00Z')})));
  expect(results.filter(r=>r!.added>0)).toHaveLength(1);
  expect((await q`select count(*)::int n from app.collection_tasks where kind='list' and params->>'from'='2026-10-05'`)[0]!.n).toBe(2);
 });
 it('uses 02:00 Bucharest in winter too, without including an open day',async()=>{
  await advanceRecovery(q,{enable:true,now:new Date('2026-12-05T23:59:00Z')});
  expect((await q`select end_day from app.collection_batches`)[0]!.end_day).toBe('2026-12-04');
  await advanceRecovery(q,{now:new Date('2026-12-06T00:00:00Z')});
  expect((await q`select end_day from app.collection_batches`)[0]!.end_day).toBe('2026-12-05');
 });
 it('does not modify scope during maintenance',async()=>{
  await q`update app.collection_control set maintenance=true`;
  expect(await advanceRecovery(q,{enable:true,now})).toBeNull();expect((await q`select follow_latest from app.collection_batches`)[0]!.follow_latest).toBe(false);
 });
 it('rolls back the horizon and all new windows if any queue insertion fails',async()=>{
  await q`alter table app.collection_tasks add constraint test_advance_atomic check(kind<>'catalogue')`;
  try{await expect(advanceRecovery(q,{enable:true,now})).rejects.toThrow();expect((await q`select end_day from app.collection_batches`)[0]!.end_day).toBe('2026-09-25');expect(await q`select id from app.collection_tasks`).toHaveLength(1);}
  finally{await q`alter table app.collection_tasks drop constraint test_advance_atomic`;}
 });
 it('backfills a newly discovered authority to the current horizon even if extension happens during its catalogue request',async()=>{
  await insertTasks(q,[task('fixture','catalogue','catalogue',{page:0},0)]);
  let release!:()=>void,started!:()=>void;const held=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>started=r);
  const work=recoveryStep(q,async()=>{started();await held;return {total:1,items:[{id:777999}]};});
  await ready;
  try{await advanceRecovery(q,{enable:true,now});}finally{release();await work;}
  const rows=await q`select params from app.collection_tasks where kind='da' and params->>'authorityId'='777999'`;
  expect(rows).toHaveLength(1);expect(rows[0]!.params).toMatchObject({from:'2026-07-01',to:'2026-10-05'});
 });
});
