import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {createDb} from '@seap/db';
import {insertTasks,recoveryStep} from './runner.js';
import {task,type Task} from './plan.js';
import {AWARD_BACKFILL_REFILL_BELOW,enqueueAwardDetailBackfill,refillAwardBackfill,retryFailedAwardBackfill,setBackgroundLanes} from './award-backfill.js';
const url=process.env['TEST_DATABASE_URL'];
if(url&&!/^seap_test_/.test(new URL(url).pathname.slice(1)))throw Error('Isolated test DB required');
const db=url?createDb(url):null;
const da=(authorityId:number,priority=10)=>task('fixture','da','da',{authorityId,from:'2026-07-01',to:'2026-09-25',page:0},priority);
const background=(noticeId:number,priority=60)=>task('fixture','awards','detail',{noticeId,page:0,noticeType:3,noticeVersion:2,internalNoticeId:noticeId+1000,noticeNo:`CAN${noticeId}`,metadataRawId:1,backfill:true},priority);
const emptyDa=async(t:Task)=>{expect(t.kind).toBe('da');return {total:0,items:[]};};
const listRow=(id:number,extra:Record<string,unknown>={})=>({caNoticeId:id,noticeId:id+1000,noticeNo:`CAN${id}`,sysNoticeTypeId:3,sysNoticeVersionId:2,noticeStateDate:'2026-01-10T10:00:00+02:00',...extra});
describe.skipIf(!db)('background award detail backfill (isolated DB, no source traffic)',()=>{
 const q=db?.sql as NonNullable<typeof db>['sql'];
 const archive=async(externalId:string,version:string,payload:unknown)=>(await q`insert into raw.raw_documents(source,external_id,endpoint_version,content_hash,payload) values('elicitatie',${externalId},${version},md5(random()::text),${JSON.stringify(payload)}::jsonb) returning id::text`)[0]!.id as string;
 beforeAll(async()=>{await q`insert into app.collection_control(id) values(1) on conflict do nothing`;});
 beforeEach(async()=>{
  await q`truncate app.collection_tasks,app.collection_batches cascade`;await q`truncate app.collection_requests`;
  await q`delete from raw.raw_documents where external_id like 'award:99%'`;await q`delete from app.processing_runs where scheduled_day='2026-10-16'`;
  await q`delete from app.collection_audit where action='award-detail-backfill'`;
  await q`update app.collection_control set paused=false,maintenance=false,blocked_reason=null,blocked_until=null,paused_streams='[]',daily_limit=null,background_lanes=0`;
  await q`insert into app.collection_batches(id,end_day,next_stream) values('fixture','2026-09-25',0)`;
 });
 afterAll(async()=>{await q?.end();});
 it('never claims background work while ordinary work is pending in any stream',async()=>{
  await q`update app.collection_control set background_lanes=10`;
  // Background task has the lower id and the earlier stream; ordinary work still comes first.
  await insertTasks(q,[background(99000001),da(7848),da(7849,0)]);
  await q`update app.collection_batches set next_stream=2`;
  const seen:number[]=[];
  for(let i=0;i<2;i++)expect(await recoveryStep(q,async t=>{seen.push(t.priority);return emptyDa(t);},'0')).toBe(true);
  expect(seen).toEqual([0,10]);
  expect((await q`select status from app.collection_tasks where kind='detail'`)[0]!.status).toBe('pending');
 });
 it('leaves background work pending when disabled or outside the enabled lanes, and keeps the batch collecting',async()=>{
  await insertTasks(q,[background(99000001)]);
  const never=async()=>{throw Error('no claim expected');};
  expect(await recoveryStep(q,never,'0')).toBe(false);
  await q`update app.collection_control set background_lanes=2`;
  expect(await recoveryStep(q,never,'2')).toBe(false);
  expect(await recoveryStep(q,never,'9')).toBe(false);
  expect((await q`select status from app.collection_batches`)[0]!.status).toBe('collecting');
  expect((await q`select status from app.collection_tasks`)[0]!.status).toBe('pending');
  await q`update app.collection_control set paused_streams='["awards"]'`;
  expect(await recoveryStep(q,never,'1')).toBe(false);
 });
 it('claims background work only when ordinary work is empty, and its parts stay in the background',async()=>{
  await insertTasks(q,[background(99000002,70),background(99000001),da(7848)]);
  await setBackgroundLanes(q,1);
  expect(await recoveryStep(q,emptyDa,'0')).toBe(true);
  let claimed:Task|undefined;
  expect(await recoveryStep(q,async t=>{claimed=t;return {caNoticeID:99000001,noticeID:99001001,noticeNumber:'CAN99000001',sysNoticeType:{id:3},conditions:{hasEformsDocument:false},caNoticeEdit_New:{section1:{}}};},'0')).toBe(true);
  expect(claimed!.params.noticeId).toBe(99000001);
  const [lots]=await q`select priority,params from app.collection_tasks where params->>'part'='lots'`;
  expect(lots!.priority).toBe(60);expect(lots!.params.backfill).toBe(true);expect(lots!.params.metadataRawId).toBe(1);
  expect((await q`select count(*)::int n from app.collection_tasks where kind='contracts'`)[0]!.n).toBe(0);
  // An ordinary task discovered meanwhile pre-empts the remaining background parts.
  await insertTasks(q,[da(7850)]);
  expect(await recoveryStep(q,emptyDa,'0')).toBe(true);
  expect((await q`select count(*)::int n from raw.raw_documents where external_id='award:99000001' and endpoint_version='award-detail-root:v2'`)[0]!.n).toBe(1);
  const [audit]=await q`select before,after from app.collection_audit where action='background-lanes' order by id desc limit 1`;
  expect(audit!.after.backgroundLanes).toBe(1);
 });
 it('queues the latest valid list metadata once, skipping archived details and known notices',async()=>{
  await archive('award:99000001','award-list:v1',listRow(99000001,{noticeNo:'CANOLD'}));
  const latest=await archive('award:99000001','award-list:v1',listRow(99000001,{noticeStateDate:'2026-02-01T10:00:00+02:00'}));
  await archive('award:99000002','award-list:v1',listRow(99000002));await archive('award:99000002','award-detail-root:v2',{data:{}});
  await archive('award:99000003','award-list:v1',listRow(99000003));
  await insertTasks(q,[task('fixture','awards','detail',{noticeId:99000003,page:0,noticeType:3,part:'lots'},1)]);
  await archive('award:99000004','award-list:v1',listRow(99000004,{noticeNo:'CAN-bad'}));
  await archive('award:99000005','award-list:v1',listRow(99000005,{sysNoticeTypeId:18,sysNoticeVersionId:1}));
  await archive('award:99000006','award-list:v1',listRow(99000006,{caNoticeId:99000007}));
  const first=await enqueueAwardDetailBackfill(q,{limit:100});
  expect(first).toMatchObject({queued:2,byTypeVersion:{'3:v2':1,'18:v1':1},skippedInvalid:2,priority:60});
  const rows=await q`select key,priority,params from app.collection_tasks where params->>'backfill'='true' order by key`;
  expect(rows.map(r=>r.key)).toEqual(['awards:detail:99000001:::0','awards:detail:99000005:::0']);
  expect(rows[0]!.params).toEqual({noticeId:99000001,page:0,noticeType:3,noticeVersion:2,internalNoticeId:99001001,noticeNo:'CAN99000001',metadataRawId:Number(latest),backfill:true});
  expect(rows.every(r=>r.priority===60)).toBe(true);
  expect(rows[0]!.key).toBe(task('fixture','awards','detail',rows[0]!.params,60).key);
  expect(await enqueueAwardDetailBackfill(q,{limit:100})).toMatchObject({queued:0,byTypeVersion:{}});
  const audits=await q`select after from app.collection_audit where action='award-detail-backfill' order by id desc limit 2`;
  expect(audits.map(a=>a.after.queued)).toEqual([0,2]);
 });
 it('pilots at most two notices per source shape, newest first, then honours the limit',async()=>{
  for(let i=1;i<=4;i++)await archive(`award:9900001${i}`,'award-list:v1',listRow(99000010+i,{noticeStateDate:`2026-03-0${i}T10:00:00+02:00`}));
  for(let i=1;i<=3;i++)await archive(`award:9900002${i}`,'award-list:v1',listRow(99000020+i,{sysNoticeTypeId:18,sysNoticeVersionId:1}));
  const pilot=await enqueueAwardDetailBackfill(q,{limit:100,pilot:true});
  expect(pilot).toMatchObject({queued:4,byTypeVersion:{'3:v2':2,'18:v1':2},pilot:true});
  expect((await q`select params->>'noticeId' id from app.collection_tasks where params->>'noticeType'='3' order by app.collection_tasks.id`).map(r=>r.id)).toEqual(['99000014','99000013']);
  expect(await enqueueAwardDetailBackfill(q,{limit:1})).toMatchObject({queued:1,byTypeVersion:{'3:v2':1}});
  expect((await q`select params->>'noticeId' id from app.collection_tasks order by app.collection_tasks.id desc limit 1`)[0]!.id).toBe('99000012');
  expect(await enqueueAwardDetailBackfill(q,{limit:100})).toMatchObject({queued:2});
 });
 it('refuses without a collecting batch or during processing, and validates operator input',async()=>{
  await expect(enqueueAwardDetailBackfill(q,{limit:0})).rejects.toThrow('--limit');
  await expect(setBackgroundLanes(q,11)).rejects.toThrow('between 0 and 10');
  const [control]=await q`select revision from app.collection_control`;
  await q`insert into app.processing_runs(scheduled_day,trigger,scope,control_revision,before_control) values('2026-10-16','manual','daily',1,'{}')`;
  await expect(enqueueAwardDetailBackfill(q,{limit:1})).rejects.toThrow('processing run');
  await q`delete from app.processing_runs where scheduled_day='2026-10-16'`;
  await q`update app.collection_batches set status='collected'`;
  await expect(enqueueAwardDetailBackfill(q,{limit:1})).rejects.toThrow('collecting recovery batch');
  expect((await q`select revision from app.collection_control`)[0]!.revision).toBe(control!.revision);
 });
 it('returns only failed backfill details to the queue, keeping the previous errors in the audit',async()=>{
  const ordinary=task('fixture','awards','detail',{noticeId:99000003,page:0,noticeType:3,noticeVersion:2,internalNoticeId:99001003,noticeNo:'CAN99000003'},1);
  await insertTasks(q,[background(99000001),background(99000002),ordinary]);
  await q`update app.collection_tasks set status='failed',error='Detaliu SEAP: identificatorul intern lipsește.',finished_at=now() where params->>'noticeId' in ('99000001','99000003')`;
  expect(await retryFailedAwardBackfill(q)).toEqual({batchId:'fixture',requeued:1});
  const rows=await q`select params->>'noticeId' n,status,error from app.collection_tasks order by id`;
  expect(rows.map(r=>[r.n,r.status,r.error])).toEqual([['99000001','pending',null],['99000002','pending',null],['99000003','failed','Detaliu SEAP: identificatorul intern lipsește.']]);
  const [audit]=await q`select before,after from app.collection_audit where action='award-detail-backfill-retry' order by id desc limit 1`;
  expect(audit!.after).toEqual({requeued:1});
  expect((audit!.before as {failed:{error:string}[]}).failed[0]!.error).toContain('identificatorul intern');
  expect(await retryFailedAwardBackfill(q)).toMatchObject({requeued:0});
 });
 it('refills a started backfill from the collector until nothing is unscheduled',async()=>{
  for(let i=1;i<=3;i++)await archive(`award:9900003${i}`,'award-list:v1',listRow(99000030+i,{noticeStateDate:`2026-04-0${i}T10:00:00+02:00`}));
  expect(await refillAwardBackfill(q)).toEqual({refilled:false,reason:'background-off'});
  await q`update app.collection_control set background_lanes=1`;
  expect(await refillAwardBackfill(q)).toEqual({refilled:false,reason:'not-started'});
  expect(await enqueueAwardDetailBackfill(q,{limit:1,pilot:true})).toMatchObject({queued:1,remaining:2});
  expect(await refillAwardBackfill(q)).toEqual({refilled:false,reason:'not-started'});
  expect(await enqueueAwardDetailBackfill(q,{limit:1})).toMatchObject({queued:1,remaining:1,auto:false});
  await q`update app.collection_control set paused_streams='["awards"]'`;
  expect(await refillAwardBackfill(q)).toEqual({refilled:false,reason:'background-off'});
  await q`update app.collection_control set paused_streams='[]'`;
  // Fewer than the threshold wait: the collector queues the rest, audited as its own actor.
  expect(await refillAwardBackfill(q)).toMatchObject({refilled:true,queued:1,remaining:0,auto:true});
  const [audit]=await q`select actor_id,after from app.collection_audit where action='award-detail-backfill' order by id desc limit 1`;
  expect(audit!.actor_id).toBe('system:award-detail-backfill-auto');expect(audit!.after.remaining).toBe(0);
  expect((await q`select count(*)::int n from app.collection_tasks where params->>'backfill'='true'`)[0]!.n).toBe(3);
  await archive('award:99000039','award-list:v1',listRow(99000039));
  expect(await refillAwardBackfill(q)).toEqual({refilled:false,reason:'complete'});
 });
 it('waits while the background queue is full, except to learn the unscheduled count once',async()=>{
  await archive('award:99000041','award-list:v1',listRow(99000041));
  await q`update app.collection_control set background_lanes=1`;
  await q`insert into app.collection_tasks(batch_id,key,partition,stream,kind,params,priority)
   select 'fixture','awards:detail:fill:'||i,'awards:fill:'||i,'awards','detail',jsonb_build_object('noticeId',i,'page',0,'backfill',true),60 from generate_series(1,${AWARD_BACKFILL_REFILL_BELOW}::int) i`;
  // An enqueue from before the count existed: refill once to record it.
  await q`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('system:award-detail-backfill','Operator','award-detail-backfill','{}','{"queued":5,"pilot":false}')`;
  expect(await refillAwardBackfill(q)).toMatchObject({refilled:true,queued:1,remaining:0});
  await q`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('system:award-detail-backfill','Operator','award-detail-backfill','{}','{"queued":5,"pilot":false,"remaining":7}')`;
  expect(await refillAwardBackfill(q)).toEqual({refilled:false,reason:'queue-full'});
  await q`insert into app.processing_runs(scheduled_day,trigger,scope,control_revision,before_control) values('2026-10-16','manual','daily',1,'{}')`;
  expect(await refillAwardBackfill(q)).toEqual({refilled:false,reason:'processing'});
 });
});
