import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {createDb} from '@seap/db';
import {recoveryStep} from './runner.js';
import {DA_DETAIL_PRIORITY,DA_DETAIL_REFILL_BELOW,daDetailState,enqueueDaDetailBackfill,pruneDaDetailTasks,refillDaDetailBackfill,retryFailedDaDetails} from './da-detail-backfill.js';
const url=process.env['TEST_DATABASE_URL'];
if(url&&!/^seap_test_/.test(new URL(url).pathname.slice(1)))throw Error('Isolated test DB required');
const db=url?createDb(url):null;
describe.skipIf(!db)('direct-award detail download (isolated DB, no source traffic)',()=>{
 const q=db?.sql as NonNullable<typeof db>['sql'];
 let yesterday='';
 const day=(back:number)=>new Date(Date.parse(`${yesterday}T00:00:00Z`)-back*86400000).toISOString().slice(0,10);
 /** One award finalized at noon, Bucharest, `back` days before yesterday. */
 const award=async(id:number,back:number,cpv:string|null='15811100-7',state='Oferta acceptata')=>(await q`insert into core.direct_acquisitions(sicap_da_id,cpv_code,state,finalization_date)
  values(${id},${cpv},${state},(${day(back)}::date::timestamp+interval '12 hours') at time zone 'Europe/Bucharest') returning id::text`)[0]!.id as string;
 const tasks=()=>q`select (params->>'noticeId')::int id,priority,status from app.collection_tasks order by priority,id`;
 beforeAll(async()=>{
  await q`insert into app.collection_control(id) values(1) on conflict do nothing`;
  await q`insert into core.cpv_codes(code,name_ro,revision,division) values('15811100-7','Pâine','Rev.2','15'),('45000000-7','Lucrări de construcţii','Rev.2','45') on conflict do nothing`;
  yesterday=String((await q`select ((now() at time zone 'Europe/Bucharest')::date-1)::text d`)[0]!.d);
 });
 beforeEach(async()=>{
  await q`truncate app.collection_tasks,app.collection_batches cascade`;await q`truncate app.collection_requests,app.da_detail_backfill_days`;
  await q`truncate core.direct_acquisitions cascade`;await q`delete from raw.raw_documents where external_id like 'da:77%'`;
  await q`delete from app.processing_runs where status='running'`;
  await q`delete from app.collection_audit where action like 'da-detail-backfill%'`;
  await q`update app.collection_control set paused=false,maintenance=false,blocked_reason=null,blocked_until=null,paused_streams='[]',daily_limit=null,background_lanes=0`;
  await q`insert into app.collection_batches(id,end_day,next_stream) values('fixture','2026-09-25',0)`;
 });
 afterAll(async()=>{await q?.end();});
 it('schedules accepted awards without lines: product groups first, newest day first, then the rest',async()=>{
  await award(7701,0);await award(7702,2);await award(7703,1,'45000000-7');await award(7704,3,null);
  await award(7705,0,'15811100-7','Oferta refuzata');
  const withLines=await award(7706,1);await q`insert into core.da_items(da_id,sicap_item_id) values(${withLines},1)`;
  await award(7707,1);await q`insert into raw.raw_documents(source,external_id,endpoint_version,content_hash,payload) values('elicitatie','da:7707','da-detail:v1','h','{}'::jsonb)`;
  await award(7708,40);
  const r=await enqueueDaDetailBackfill(q,{limit:1000,floor:day(10)});
  // Six accepted awards inside the floor (7708 is older, 7705 refused); two of them need nothing.
  expect(r).toMatchObject({queued:4,universe:6,covered:6,remaining:0,cursor:null,floor:day(10),start:yesterday,forwardTo:yesterday,pilot:false});
  expect((await tasks()).map(t=>[t.id,t.priority])).toEqual([[7701,DA_DETAIL_PRIORITY+1],[7702,DA_DETAIL_PRIORITY+1],[7703,DA_DETAIL_PRIORITY+2],[7704,DA_DETAIL_PRIORITY+2]]);
  const again=await enqueueDaDetailBackfill(q,{limit:1000});
  expect(again).toMatchObject({queued:0,moved:false});
  expect((await q`select count(*)::int n from app.collection_audit where action='da-detail-backfill'`)[0]!.n).toBe(1);
  await expect(enqueueDaDetailBackfill(q,{limit:10,floor:day(20)})).rejects.toThrow('--restart');
  const restarted=await enqueueDaDetailBackfill(q,{limit:1000,floor:day(60),restart:true});
  expect(restarted).toMatchObject({queued:1,universe:7,floor:day(60)});
 });
 it('stops at the limit and continues from the same day at the next call',async()=>{
  for(let i=0;i<6;i++)await award(7710+i,i);
  const first=await enqueueDaDetailBackfill(q,{limit:2,floor:day(30)});
  expect(first).toMatchObject({queued:2,cursor:{tier:1,day:day(2)},universe:6,covered:2,remaining:4});
  const next=await enqueueDaDetailBackfill(q,{limit:3});
  expect(next).toMatchObject({queued:3,cursor:{tier:1,day:day(5)},covered:5,remaining:1});
  expect((await daDetailState(q))!.state.cursor).toEqual({tier:1,day:day(5)});
 });
 it('a pilot schedules a few newest awards and does not move the walk',async()=>{
  for(let i=0;i<30;i++)await award(7730+i,i%3);
  const pilot=await enqueueDaDetailBackfill(q,{limit:5,pilot:true});
  expect(pilot).toMatchObject({queued:5,pilot:true});expect(await daDetailState(q)).toBeNull();
  expect(await refillDaDetailBackfill(q)).toMatchObject({refilled:false,reason:'background-off'});
  await q`update app.collection_control set background_lanes=2`;
  expect(await refillDaDetailBackfill(q)).toMatchObject({refilled:false,reason:'not-started'});
 });
 it('the refill reads the last days again and waits while the queue is full or the stream is paused',async()=>{
  await award(7760,0);
  await enqueueDaDetailBackfill(q,{limit:1000,floor:day(5)});
  await q`update app.collection_control set background_lanes=2`;
  expect(await refillDaDetailBackfill(q)).toMatchObject({refilled:false,reason:'nothing-new'});
  // An award that entered the list late, on a day the walk already passed.
  await award(7761,3,'45000000-7');
  expect(await refillDaDetailBackfill(q)).toMatchObject({refilled:true,queued:1,cursor:null});
  expect((await tasks()).find(t=>t.id===7761)!.priority).toBe(DA_DETAIL_PRIORITY);
  await award(7762,1);
  await q`update app.collection_control set paused_streams='["da"]'`;
  expect(await refillDaDetailBackfill(q)).toMatchObject({refilled:false,reason:'background-off'});
  await q`update app.collection_control set paused_streams='[]'`;
  await q`insert into app.collection_tasks(batch_id,key,partition,stream,kind,params,priority) select 'fixture','fill:'||g,'fill:'||g,'da','da-detail','{"page":0,"backfill":true}'::jsonb,${DA_DETAIL_PRIORITY+1} from generate_series(1,${DA_DETAIL_REFILL_BELOW}) g`;
  expect(await refillDaDetailBackfill(q)).toMatchObject({refilled:false,reason:'queue-full'});
 });
 it('a background lane archives the detail; a wrong identity is that award\'s gap and nothing stops',async()=>{
  await award(7770,0);await award(7771,1);
  await enqueueDaDetailBackfill(q,{limit:10,floor:day(5)});
  const never=async()=>{throw Error('no claim expected');};
  expect(await recoveryStep(q,never,'0')).toBe(false);
  await q`update app.collection_control set background_lanes=1`;
  expect(await recoveryStep(q,async t=>({directAcquisitionID:t.params.noticeId,directAcquisitionItems:[{directAcquisitionItemID:1}]}),'0')).toBe(true);
  expect(await recoveryStep(q,async()=>({directAcquisitionID:1}),'0')).toBe(true);
  const rows=await tasks();
  expect(rows.map(t=>[t.id,t.status])).toEqual([[7770,'complete'],[7771,'failed']]);
  expect((await q`select external_id,endpoint_version from raw.raw_documents where external_id like 'da:77%'`).map(r=>[r.external_id,r.endpoint_version])).toEqual([['da:7770','da-detail:v1']]);
  expect((await q`select blocked_reason from app.collection_control where id=1`)[0]!.blocked_reason).toBeNull();
  expect(await retryFailedDaDetails(q)).toMatchObject({requeued:1});
  expect((await tasks()).map(t=>t.status)).toEqual(['complete','pending']);
  // The archived award is not scheduled again by a restart.
  expect(await enqueueDaDetailBackfill(q,{limit:10,floor:day(5),restart:true})).toMatchObject({queued:0});
 });
 it('finished tasks older than a day are counted by day and removed',async()=>{
  await q`insert into app.collection_tasks(batch_id,key,partition,stream,kind,params,priority,status,finished_at)
   select 'fixture','done:'||g,'done:'||g,'da','da-detail','{"page":0,"backfill":true}'::jsonb,${DA_DETAIL_PRIORITY+1},'complete',now()-case when g<=3 then interval '3 days' when g<=5 then interval '2 days' else interval '1 hour' end from generate_series(1,7) g`;
  await q`insert into app.collection_tasks(batch_id,key,partition,stream,kind,params,priority,status,finished_at) values('fixture','old-fail','old-fail','da','da-detail','{"page":0,"backfill":true}'::jsonb,${DA_DETAIL_PRIORITY+1},'failed',now()-interval '3 days')`;
  expect(await pruneDaDetailTasks(q)).toEqual({removed:5});
  expect((await q`select complete from app.da_detail_backfill_days order by day`).map(r=>r.complete)).toEqual([3,2]);
  expect((await q`select count(*)::int n from app.collection_tasks`)[0]!.n).toBe(3);
  expect(await pruneDaDetailTasks(q)).toEqual({removed:0});
 });
});
