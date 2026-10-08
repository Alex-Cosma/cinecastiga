import {afterAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {createDb,type DbSql} from '../src/client.js';
import {COLLECTION_STREAMS} from '../src/collection-policy.js';
import {CollectionSuspendedError,runCollectionRequest} from '../src/collection.js';
import {collectionQuietWindow} from '../src/collection-quiet-window.js';
const clock=vi.hoisted(()=>({at:new Date('2026-09-28T00:10:00Z')}));
vi.mock('../src/collection-quiet-window.js',async importOriginal=>{
 const original=await importOriginal<typeof import('../src/collection-quiet-window.js')>();
 return {collectionQuietWindow:(q:DbSql,at?:Date)=>original.collectionQuietWindow(q,at??clock.at)};
});
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))throw Error('Dedicated test database required');
const connection=url?createDb(url):null;
afterAll(async()=>{await connection?.sql.end();});
describe.skipIf(!connection)('daily SEAP quiet window, real PostgreSQL and fake transport',()=>{
 let q:DbSql;
 beforeEach(async()=>{
  q=connection!.sql;clock.at=new Date('2026-09-28T00:10:00Z');
  await q`truncate app.collection_retries`;
  await q`truncate app.processing_runs cascade`;
  await q`truncate app.collection_requests,app.collection_workers`;
  await q`insert into app.collection_control(id) values(1) on conflict do nothing`;
  await q`update app.collection_control set paused=false,maintenance=false,collection_during_maintenance=false,paused_streams='[]',blocked_reason=null,blocked_until=null,daily_limit=null,min_seconds=1,max_seconds=1,next_allowed_at=null,last_file_at=null where id=1`;
 });
 it.each([
  ['2026-09-27T23:58:59.999Z',false],['2026-09-27T23:59:00Z',true],
  ['2026-09-28T00:29:59.999Z',true],['2026-09-28T00:30:00Z',false],
  ['2026-01-15T00:58:59Z',false],['2026-01-15T00:59:00Z',true],['2026-01-15T01:30:00Z',false],
  // Fall: hold across BOTH occurrences of the repeated hour, without an intermediate resume.
  ['2026-10-24T23:59:00Z',true],['2026-10-25T00:45:00Z',true],['2026-10-25T01:15:00Z',true],['2026-10-25T01:30:00Z',false],
  // Spring: nonexistent 03:30 resolves to 04:30 local, preserving a 31-minute pause.
  ['2026-03-29T00:59:00Z',true],['2026-03-29T01:29:59Z',true],['2026-03-29T01:30:00Z',false],
 ])('at %s active=%s',async(at,active)=>{
  // Host/session timezone must never influence Romanian policy.
  const c=await q.reserve();try{await c`set time zone 'Pacific/Honolulu'`;expect((await collectionQuietWindow(c,new Date(at))).active).toBe(active);}finally{c.release();}
 });
 async function attempt(stream:(typeof COLLECTION_STREAMS)[number]='da',work=vi.fn(async(_signal:AbortSignal)=>({value:'ok',status:200})),fileDownload=false){
  const c=await q.reserve();try{return await runCollectionRequest(c,{stream,worker:'quiet-fixture',method:'GET',url:'https://www.e-licitatie.ro/api-pub/fixture',fileDownload},work);}finally{c.release();}
 }
 it('permits only archive requests during verified maintenance recovery',async()=>{
  clock.at=new Date('2026-09-28T00:30:00Z');
  await q`update app.collection_control set maintenance=true,collection_during_maintenance=true`;
  await expect(attempt('awards')).resolves.toBe('ok');
  await expect(attempt('documents')).rejects.toBeInstanceOf(CollectionSuspendedError);
  await q`insert into app.processing_runs(scheduled_day,scope,control_revision,before_control) values('2026-09-28','full',1,'{}')`;
  await expect(attempt('da')).rejects.toBeInstanceOf(CollectionSuspendedError);
 });
 it('holds all five streams and file downloads without HTTP, ledger entries, pacing changes or source blocks',async()=>{
  const work=vi.fn(async(_signal:AbortSignal)=>({value:'ok',status:200}));
  const [before]=await q`select * from app.collection_control`;
  for(const stream of COLLECTION_STREAMS)await expect(attempt(stream,work,stream==='documents')).rejects.toBeInstanceOf(CollectionSuspendedError);
  expect(work).not.toHaveBeenCalled();expect((await q`select count(*)::int n from app.collection_requests`)[0]!.n).toBe(0);
  expect((await q`select * from app.collection_control`)[0]).toEqual(before);
 });
 it('releases automatically at 03:30 while preserving explicit stops',async()=>{
  await expect(attempt()).rejects.toBeInstanceOf(CollectionSuspendedError);
  clock.at=new Date('2026-09-28T00:30:00Z');
  for(const stop of ['paused','maintenance','blocked','stream']){
   await q`update app.collection_control set paused=${stop==='paused'},maintenance=${stop==='maintenance'},blocked_reason=${stop==='blocked'?'existing error':null},paused_streams=${JSON.stringify(stop==='stream'?['da']:[])}::jsonb`;
   await expect(attempt()).rejects.toBeInstanceOf(CollectionSuspendedError);
  }
  await q`update app.collection_control set paused=false,maintenance=false,blocked_reason=null,paused_streams='[]'`;
  await expect(attempt()).resolves.toBe('ok');
  expect((await q`select outcome from app.collection_requests`)).toEqual([expect.objectContaining({outcome:'success'})]);
 });
 it('rechecks after waiting for the pacing budget across 02:59',async()=>{
  clock.at=new Date('2026-09-27T23:58:59Z');
  await q`update app.collection_control set next_allowed_at=clock_timestamp()+interval '0.15 seconds'`;
  const work=vi.fn(async(_signal:AbortSignal)=>({value:'ok',status:200}));
  const timer=setTimeout(()=>{clock.at=new Date('2026-09-27T23:59:00Z');},50);
  try{await expect(attempt('documents',work,true)).rejects.toBeInstanceOf(CollectionSuspendedError);}finally{clearTimeout(timer);}
  expect(work).not.toHaveBeenCalled();
 });
 it('allows an admitted response to finish when the pause starts',async()=>{
  clock.at=new Date('2026-09-27T23:58:59Z');
  await expect(attempt('awards',async signal=>{clock.at=new Date('2026-09-27T23:59:00Z');expect(signal.aborted).toBe(false);return {value:'finished',status:200};})).resolves.toBe('finished');
  await q`update app.collection_control set next_allowed_at=null`;
  await expect(attempt()).rejects.toBeInstanceOf(CollectionSuspendedError);
  expect((await q`select blocked_reason from app.collection_control`)[0]!.blocked_reason).toBeNull();
 });
 it('keeps a due timeout retry waiting through the quiet window without spending its budget',async()=>{
  await q`insert into app.collection_batches(id,end_day) values('quiet-retry','2026-09-26') on conflict do nothing`;
  const [t]=await q`insert into app.collection_tasks(batch_id,key,partition,stream,kind,params,status) values('quiet-retry','quiet-retry','quiet-retry','da','da','{}','pending') on conflict(batch_id,key) do update set status='pending' returning id`;
  const [r]=await q`insert into app.collection_requests(stream,worker,method,endpoint,parameters,outcome) values('da','fixture','GET','/api-pub/fixture','{}','failed') returning id`;
  await q`insert into app.collection_retries(task_id,first_request_id,last_request_id,timeouts,status,retry_at) values(${t!.id},${r!.id},${r!.id},1,'pending',clock_timestamp()-interval '1 minute')`;
  const c=await q.reserve(),work=vi.fn(async()=>({status:200,value:'ok'}));
  try{
   await expect(runCollectionRequest(c,{stream:'da',worker:'fixture',method:'GET',url:'https://www.e-licitatie.ro/api-pub/fixture',context:{taskId:t!.id}},work)).rejects.toThrow('Pauză SEAP programată');
   expect(work).not.toHaveBeenCalled();expect((await q`select timeouts from app.collection_retries`)[0]!.timeouts).toBe(1);
   clock.at=new Date('2026-09-28T00:30:00Z');
   await expect(runCollectionRequest(c,{stream:'da',worker:'fixture',method:'GET',url:'https://www.e-licitatie.ro/api-pub/fixture',context:{taskId:t!.id}},work)).resolves.toBe('ok');
  }finally{c.release();await q`truncate app.collection_retries`;}
 });

});
