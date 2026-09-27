import {afterAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {createDb,runCollectionRequest,CollectionSuspendedError,CollectionTransportError} from '@seap/db';
import {insertTasks,recoveryStep,recoverInterrupted} from './runner.js';
import {task,type Task} from './plan.js';
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_/.test(new URL(url).pathname.slice(1)))throw Error('Isolated DB required');
const {sql:q}=createDb(url);
afterAll(async()=>{await q.end();});
describe.skipIf(!url)('durable timeout retries (real PG, no network)',()=>{
 beforeEach(async()=>{
  await q`truncate app.collection_tasks,app.collection_batches cascade`;await q`truncate app.collection_requests`;
  await q`insert into app.collection_control(id) values(1) on conflict do nothing`;
  await q`update app.collection_control set paused=false,maintenance=false,blocked_reason=null,blocked_until=null,paused_streams='[]',daily_limit=null,next_allowed_at=null,min_seconds=1,max_seconds=1`;
  await q`insert into app.collection_batches(id,end_day,next_stream) values('fixture','2026-09-25',0)`;
  await insertTasks(q,[task('fixture','da','da',{authorityId:7848,from:'2026-07-01',to:'2026-09-25',page:0})]);
 });
 async function transport(t:Task,kind:'timeout'|'ok'|'error'|'403'|'timeout403'='timeout',patch:Record<string,unknown>={}){
  const c=await q.reserve();
  const original=setTimeout;
  const timer=vi.spyOn(globalThis,'setTimeout').mockImplementation(((fn:any,ms:any,...args:any[])=>original(fn,ms===45000?20:ms,...args)) as typeof setTimeout);
  try{return await runCollectionRequest(c,{stream:t.stream,worker:'retry-test',method:'POST',url:'https://www.e-licitatie.ro/api-pub/DirectAcquisitionCommon/GetDirectAcquisitionList/',parameters:{pageIndex:0,pageSize:2000},context:{taskId:t.id},...patch},async (signal):Promise<any>=>{
   if(kind==='timeout'||kind==='timeout403')return await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(kind==='timeout403'?new CollectionTransportError(Error('fixture timeout'),{response:{status:403}}):Error('fixture timeout')),{once:true}));
   if(kind==='error')throw Error('non-timeout transport failure');
   return {status:kind==='403'?403:200,value:{total:0,items:[]}};
  });}finally{timer.mockRestore();c.release();}
 }
 async function due(){await q`update app.collection_retries set retry_at=clock_timestamp()-interval '1 second' where status='pending'`;await q`update app.collection_control set next_allowed_at=null`;}
 it('waits 5 then10 minutes, preserves all three attempts and stops on the third timeout',async()=>{
  expect(await recoveryStep(q,t=>transport(t))).toBe(false);
  let [r]=await q`select *,extract(epoch from(retry_at-clock_timestamp())) seconds from app.collection_retries`;
  expect(r).toMatchObject({timeouts:1,status:'pending'});expect(Number(r!.seconds)).toBeGreaterThan(295);
  expect((await q`select status from app.collection_tasks`)[0]!.status).toBe('pending');
  const unexpected=vi.fn();expect(await recoveryStep(q,unexpected)).toBe(false);expect(unexpected).not.toHaveBeenCalled();
  // A fresh DB client / worker recovery during the wait retains its budget.
  const fresh=createDb(url).sql;try{expect(await recoverInterrupted(fresh)).toBe(0);expect(await recoveryStep(fresh,unexpected)).toBe(false);}finally{await fresh.end();}
  await due();expect(await recoveryStep(q,t=>transport(t))).toBe(false);
  [r]=await q`select *,extract(epoch from(retry_at-clock_timestamp())) seconds from app.collection_retries`;
  expect(r).toMatchObject({timeouts:2,status:'pending'});expect(Number(r!.seconds)).toBeGreaterThan(595);
  await due();expect(await recoveryStep(q,t=>transport(t))).toBe(true);
  expect((await q`select timeouts,status from app.collection_retries`)[0]).toMatchObject({timeouts:3,status:'stopped'});
  expect((await q`select status from app.collection_tasks`)[0]!.status).toBe('failed');
  expect((await q`select blocked_reason from app.collection_control`)[0]!.blocked_reason).toContain('epuizate');
  expect(await recoveryStep(q,unexpected)).toBe(false);
  const attempts=await q`select outcome,diagnostics from app.collection_requests order by id`;
  expect(attempts).toHaveLength(3);expect(attempts.map(x=>x.diagnostics.retry.timeouts)).toEqual([1,2,3]);expect(attempts.every(x=>x.outcome==='failed')).toBe(true);
 });
 it('prioritizes the exact task, resolves after validated success and then returns to other work',async()=>{
  await recoveryStep(q,t=>transport(t));
  await insertTasks(q,[task('fixture','tenders','list',{from:'2026-09-25',to:'2026-09-25',page:0})]);
  await due();const seen:number[]=[];
  await recoveryStep(q,t=>{seen.push(Number(t.id));return transport(t,'ok');});
  const [r]=await q`select * from app.collection_retries`;expect(seen).toEqual([Number(r!.task_id)]);expect(r!.status).toBe('resolved');
  expect((await q`select blocked_reason from app.collection_control`)[0]!.blocked_reason).toBeNull();
  await recoveryStep(q,async t=>{expect(t.stream).toBe('tenders');return {total:0,items:[]};});
 });
 it('holds documents and other queries, even after the deadline, for the exact retry',async()=>{
  await recoveryStep(q,t=>transport(t));await due();
  const c=await q.reserve(),work=vi.fn();
  try{await expect(runCollectionRequest(c,{stream:'documents',worker:'doc-test',method:'GET',url:'https://www.e-licitatie.ro/api-pub/fixture'},work)).rejects.toBeInstanceOf(CollectionSuspendedError);}finally{c.release();}
  expect(work).not.toHaveBeenCalled();expect((await q`select count(*)::int n from app.collection_requests`)[0]!.n).toBe(1);
 });
 it('respects manual, maintenance, stream, error and daily-budget stops without spending a retry',async()=>{
  await recoveryStep(q,t=>transport(t));await due();const work=vi.fn();
  for(const kind of ['paused','maintenance','stream','error','budget']){
   await q`update app.collection_control set paused=${kind==='paused'},maintenance=${kind==='maintenance'},paused_streams=${JSON.stringify(kind==='stream'?['da']:[])}::jsonb,blocked_reason=${kind==='error'?'independent error':null},daily_limit=${kind==='budget'?1:null}`;
   expect(await recoveryStep(q,work)).toBe(false);
  }
  expect(work).not.toHaveBeenCalled();expect((await q`select timeouts from app.collection_retries`)[0]!.timeouts).toBe(1);
 });
 it.each(['403','error','timeout403'] as const)('stops instead of automatically retrying %s during a timeout retry',async kind=>{
  await recoveryStep(q,t=>transport(t));await due();await recoveryStep(q,t=>transport(t,kind));
  expect((await q`select status from app.collection_retries`)[0]!.status).toBe('stopped');
  expect((await q`select blocked_reason from app.collection_control`)[0]!.blocked_reason).toBeTruthy();
 });
 it('does not admit a changed query under the same task identity',async()=>{
  await recoveryStep(q,t=>transport(t));await due();await recoveryStep(q,t=>transport(t,'ok',{parameters:{pageIndex:9}}));
  expect((await q`select status from app.collection_retries`)[0]!.status).toBe('stopped');
  expect((await q`select count(*)::int n from app.collection_requests`)[0]!.n).toBe(1);
 });
});
