import {afterAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CollectionTransportError,CollectionProxyFailureError,createDb,runCollectionRequest,registerSeapProxies,reserveDocumentProxy,releaseDocumentProxy,type DbSql} from '@seap/db';
import {changeCollection} from './collection';
import {proxyStatus} from './proxies';
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))throw Error('Dedicated test database required');
const connection=url?createDb(url,{max:16}):null;
const pool=[1,2,3].map(n=>({id:`proxy-${n}`,server:`http://192.0.2.${n}:8000`,username:'fixture-only',password:'never-expose-fixture-password'}));
let folder:string;
afterAll(async()=>{vi.unstubAllEnvs();if(connection){await connection.sql`delete from app.document_jobs where notice_key='proxy-fixture'`;await connection.sql`delete from app.document_notices where key='proxy-fixture'`;await connection.sql`update app.collection_proxy_control set enabled=false`;await connection.sql`truncate app.collection_proxies`;await connection.sql`update app.collection_control set paused=true,blocked_reason=null`;};if(folder)await rm(folder,{recursive:true,force:true});await connection?.sql.end();});
describe.skipIf(!connection)('shared proxy scheduling (PostgreSQL, NO network)',()=>{
 let q:DbSql;
 beforeEach(async()=>{
  q=connection!.sql;
  if(!folder)folder=await mkdtemp(join(tmpdir(),'seap-proxy-tests-'));
  const file=join(folder,'proxies.json');await writeFile(file,JSON.stringify(pool));vi.stubEnv('SEAP_PROXY_FILE',file);vi.stubEnv('SEAP_PROXY_REQUIRED','true');
  await q`truncate app.collection_retries,app.collection_requests,app.collection_audit,app.collection_proxies`;
  await q`update app.collection_control set revision=1,paused=true,maintenance=false,blocked_reason=null,blocked_until=null,paused_streams='[]',daily_limit=null,next_allowed_at=null,last_file_at=null where id=1`;
  await q`update app.collection_proxy_control set enabled=true,max_in_flight=1,requests_per_minute=3,min_seconds=50,max_seconds=70 where id=1`;
  await registerSeapProxies(q,pool);await q`update app.collection_proxies set enabled=true`;
  await q`update app.collection_control set paused=false where id=1`;
  await q`insert into app.document_notices(key,notice_id,notice_type,notice_no,title,url) values('proxy-fixture','1',17,'SCN_FIXTURE','Fixture','https://example.test') on conflict do nothing`;
  await q`delete from app.document_jobs where notice_key='proxy-fixture'`;
 });
 const info={stream:'da' as const,worker:'proxy-fixture',method:'POST',url:'https://www.e-licitatie.ro/api-pub/fixture'};
 it('measures total and individual rolling rates, including failures and recently disabled endpoints',async()=>{
  await q`insert into app.collection_requests(stream,worker,method,endpoint,proxy_id,outcome,started_at)
   values('da','fixture','POST','/fixture','proxy-1','success',now()-interval '9 minutes'),
   ('documents','fixture','GET','/fixture','proxy-1','failed',now()-interval '1 minute'),
   ('da','fixture','POST','/fixture','proxy-2','running',now()-interval '20 seconds'),
   ('da','fixture','POST','/fixture',null,'success',now()-interval '2 minutes'),
   ('da','fixture','POST','/fixture','proxy-1','success',now()-interval '11 minutes')`;
  await q`update app.collection_proxies set enabled=false where id='proxy-2'`;
  const state=await proxyStatus(q);
  expect(state.observedPerMinute).toBe(.4);expect(state.directPerMinute).toBe(.1);
  expect(state.endpoints.map(p=>[p.id,p.recent_attempts,p.observed_per_minute])).toEqual([
   ['proxy-1',2,.2],['proxy-2',1,.1],['proxy-3',0,0],
  ]);
  expect(state.endpoints[1]!.enabled).toBe(false);
  expect(state.endpoints.reduce((sum,p)=>sum+p.recent_attempts,0)+state.directPerMinute*10).toBe(state.observedPerMinute*10);
 });
 async function request(work=vi.fn(async(_signal:AbortSignal,p:any)=>({value:p?.id,status:200})),extra:Partial<Parameters<typeof runCollectionRequest>[1]>={},signal?:AbortSignal){const c=await q.reserve();try{return await runCollectionRequest(c,{...info,...extra},work,signal);}finally{c.release();}}
 it('supports ten live requests on distinct IPs and rejects the eleventh without source traffic',async()=>{
  const expanded=Array.from({length:11},(_,i)=>({...pool[0]!,id:`proxy-${i+1}`,server:`http://192.0.2.${i+1}:8000`}));
  await writeFile(join(folder,'proxies.json'),JSON.stringify(expanded));await q`update app.collection_control set paused=true`;
  await registerSeapProxies(q,expanded);await q`update app.collection_proxies set enabled=true`;
  await q`update app.collection_proxy_control set max_in_flight=10,requests_per_minute=50,min_seconds=35,max_seconds=45`;
  await q`update app.collection_control set paused=false`;
  let release!:()=>void;const held=new Promise<void>(r=>release=r),pending:Promise<unknown>[]=[];
  try{
   for(let i=0;i<10;i++){
    await q`update app.collection_control set next_allowed_at=null`;
    let started!:()=>void;const ready=new Promise<void>(r=>started=r);
    pending.push(request(vi.fn(async(_s,p)=>{started();await held;return {value:p.id,status:200};})));
    await ready;
   }
   const running=await q`select proxy_id from app.collection_requests where outcome='running'`;
   expect(running).toHaveLength(10);expect(new Set(running.map(r=>r.proxy_id)).size).toBe(10);
   await q`update app.collection_control set next_allowed_at=null`;
   const work=vi.fn(async()=>({value:'bad',status:200}));await expect(request(work,{},AbortSignal.timeout(150))).rejects.toThrow();expect(work).not.toHaveBeenCalled();
  }finally{release();await Promise.all(pending);}
 },15000);
 it('retires replaced IPs without losing history and validates the new operator ceilings',async()=>{
  await request();await q`update app.collection_control set paused=true`;
  await registerSeapProxies(q,pool.slice(1));
  const state=await proxyStatus(q),old=state.endpoints.find(p=>p.id==='proxy-1')!;
  expect(old).toMatchObject({configured:false,enabled:false,attempts:1});expect(state.retiredPerMinute).toBe(.1);
  const actor={id:'fixture-admin',name:'Admin'},body={action:'proxies',revision:1,enabled:true,minSeconds:35,maxSeconds:45,requestsPerMinute:50,maxInFlight:10,activeIds:['proxy-2','proxy-3']};
  await expect(changeCollection(actor,{...body,activeIds:['proxy-1']},q)).rejects.toThrow('lista curentă');
  await expect(changeCollection(actor,{...body,maxInFlight:11},q)).rejects.toThrow('1 și 10');
  await changeCollection(actor,body,q);
  expect((await q`select * from app.collection_proxy_control`)[0]).toMatchObject({max_in_flight:10,requests_per_minute:50});
  await expect(q`update app.collection_proxy_control set max_in_flight=11`).rejects.toThrow();
  await q`update app.collection_control set paused=false,next_allowed_at=null`;
  expect(await request()).toBe('proxy-2');
  const [timing]=await q`select extract(epoch from(c.next_allowed_at-r.started_at)) global_wait,extract(epoch from(p.next_allowed_at-r.started_at)) ip_wait from app.collection_requests r cross join app.collection_control c join app.collection_proxies p on p.id=r.proxy_id order by r.id desc limit 1`;
  expect(Number(timing!.global_wait)).toBeGreaterThanOrEqual(1.2);expect(Number(timing!.global_wait)).toBeLessThan(2);
  expect(Number(timing!.ip_wait)).toBeGreaterThanOrEqual(35);expect(Number(timing!.ip_wait)).toBeLessThan(46);
 });
 it('overlaps two different IPs, spaces starts globally, and refuses a third or the same IP',async()=>{
  await q`update app.collection_proxy_control set max_in_flight=2,requests_per_minute=15,min_seconds=1,max_seconds=1`;
  let release!:()=>void,firstStarted!:()=>void,secondStarted!:()=>void;
  const held=new Promise<void>(r=>release=r),firstReady=new Promise<void>(r=>firstStarted=r),secondReady=new Promise<void>(r=>secondStarted=r);
  const first=request(vi.fn(async(_s,p)=>{firstStarted();await held;return {value:p.id,status:200};}));
  await firstReady;
  const second=request(vi.fn(async(_s,p)=>{secondStarted();await held;return {value:p.id,status:200};}));
  try{
   await secondReady;
   const running=await q`select proxy_id,started_at from app.collection_requests where outcome='running' order by started_at`;
   expect(running).toHaveLength(2);expect(new Set(running.map(r=>r.proxy_id)).size).toBe(2);
   expect(new Date(running[1]!.started_at).getTime()-new Date(running[0]!.started_at).getTime()).toBeGreaterThanOrEqual(3900);
   await q`update app.collection_control set next_allowed_at=null`;
   await q`update app.collection_proxies set next_allowed_at=null`;
   const never=vi.fn(async()=>({value:'unexpected',status:200}));
   await expect(request(never,{},AbortSignal.timeout(150))).rejects.toThrow();
   await expect(request(never,{proxyId:running[0]!.proxy_id},AbortSignal.timeout(150))).rejects.toThrow();
   expect(never).not.toHaveBeenCalled();
   await q`update app.collection_control set paused=true`;
   await expect(changeCollection({id:'fixture',name:'Fixture'},{action:'proxies',revision:1,enabled:true,minSeconds:1,maxSeconds:1,requestsPerMinute:15,maxInFlight:1,activeIds:['proxy-1']},q)).rejects.toThrow('încheierea');
   expect((await q`select blocked_reason from app.collection_control`)[0]!.blocked_reason).toBeNull();
  }finally{release();await Promise.all([first,second]);}
 },15000);
 it('pins a busy IP until its entire request settles, even with another free global slot',async()=>{
  await q`update app.collection_proxy_control set max_in_flight=2,requests_per_minute=15,min_seconds=1,max_seconds=1`;
  let release!:()=>void,started!:()=>void;const held=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>started=r);
  const first=request(vi.fn(async()=>{started();await held;return {value:'first',status:200};}));await ready;
  try{
   await q`update app.collection_control set next_allowed_at=null`;await q`update app.collection_proxies set next_allowed_at=null`;
   const work=vi.fn(async()=>({value:'bad',status:200}));
   await expect(request(work,{proxyId:'proxy-1'},AbortSignal.timeout(150))).rejects.toThrow();expect(work).not.toHaveBeenCalled();
   expect(await request()).toBe('proxy-2');
  }finally{release();await first;}
 });
 it.each([503,429])('handles HTTP%s while another IP is still in flight',async status=>{
  await q`update app.collection_proxy_control set max_in_flight=2,requests_per_minute=50`;
  let release!:()=>void,started!:()=>void;const held=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>started=r);
  const first=request(vi.fn(async()=>{started();await held;return {value:'healthy',status:200};}));await ready;
  try{
   await q`update app.collection_control set next_allowed_at=null`;
   await expect(request(vi.fn(async()=>({value:'failed',status})))).rejects.toThrow();
   await q`update app.collection_control set next_allowed_at=null`;
   if(status===503){expect(await request()).toBe('proxy-3');expect((await q`select blocked_reason from app.collection_control`)[0]!.blocked_reason).toBeNull();}
   else{const work=vi.fn(async()=>({value:'bad',status:200}));await expect(request(work)).rejects.toThrow('429');expect(work).not.toHaveBeenCalled();}
  }finally{release();expect(await first).toBe('healthy');}
  if(status===429)expect((await q`select blocked_reason from app.collection_control`)[0]!.blocked_reason).toContain('429');
 });
 it.each([false,true])('rechecks concurrent completion without overlooking a real orphan (%s)',async realOrphan=>{
  const [row]=await q`insert into app.collection_requests(stream,worker,method,endpoint,proxy_id) values('da','finishing','POST','/fixture','proxy-1') returning id`;
  const finisher=await q.reserve(),checker=await q.reserve();let intercepted=false;
  try{
   await finisher`begin`;
   await finisher`update app.collection_requests set outcome='success',status=200,finished_at=clock_timestamp() where id=${row!.id}`;
   const wrapped=new Proxy(checker,{apply:async(target,thisArg,args)=>{
    const result=await Reflect.apply(target,thisArg,args);
    if(!intercepted&&String(args[0]?.[0]).includes('select r.id from app.collection_requests r where outcome=')){
     expect(result).toHaveLength(1);intercepted=true;await finisher`commit`;
     if(realOrphan)await q`insert into app.collection_requests(stream,worker,method,endpoint,proxy_id) values('da','crashed','POST','/fixture','proxy-2')`;
    }
    return result;
   }});
   const work=vi.fn(async()=>({value:'healthy',status:200}));
   if(realOrphan){await expect(runCollectionRequest(wrapped,info,work)).rejects.toThrow('întreruptă');expect(work).not.toHaveBeenCalled();}
   else{expect(await runCollectionRequest(wrapped,info,work)).toBe('healthy');expect((await q`select blocked_reason from app.collection_control`)[0]!.blocked_reason).toBeNull();}
   expect(intercepted).toBe(true);
  }finally{await finisher`rollback`;finisher.release();checker.release();}
 });
 it('recognizes a real orphan while another request legitimately owns a live slot',async()=>{
  await q`update app.collection_proxy_control set max_in_flight=2`;
  let release!:()=>void,started!:()=>void;const held=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>started=r);
  const first=request(vi.fn(async()=>{started();await held;return {value:'first',status:200};}));await ready;
  try{
   await q`insert into app.collection_requests(stream,worker,method,endpoint,proxy_id) values('da','crashed','POST','/fixture','proxy-3')`;
   const work=vi.fn(async()=>({value:'bad',status:200}));await expect(request(work)).rejects.toThrow('întreruptă');expect(work).not.toHaveBeenCalled();
   expect((await q`select blocked_reason from app.collection_control`)[0]!.blocked_reason).toContain('fără rezultat');
  }finally{release();await first;}
 });
 it('keeps direct traffic serialized even if the saved proxy concurrency is two',async()=>{
  vi.stubEnv('SEAP_PROXY_REQUIRED','false');await q`update app.collection_proxy_control set enabled=false,max_in_flight=2`;
  let release!:()=>void,started!:()=>void;const held=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>started=r);
  const first=request(vi.fn(async()=>{started();await held;return {value:'first',status:200};}));await ready;
  try{
   await q`update app.collection_control set next_allowed_at=null`;
   const work=vi.fn(async()=>({value:'bad',status:200}));await expect(request(work,{},AbortSignal.timeout(150))).rejects.toThrow();expect(work).not.toHaveBeenCalled();
  }finally{release();await first;}
 });
 it('persists per-IP wait, the global ceiling and endpoint identity in the ledger',async()=>{
  expect(await request()).toBe('proxy-1');
  const [first]=await q`select r.proxy_id,extract(epoch from(c.next_allowed_at-r.started_at)) global_wait,extract(epoch from(p.next_allowed_at-r.started_at)) ip_wait from app.collection_requests r cross join app.collection_control c join app.collection_proxies p on p.id='proxy-1'`;
  expect(first!.proxy_id).toBe('proxy-1');expect(Number(first!.global_wait)).toBeGreaterThanOrEqual(20);expect(Number(first!.ip_wait)).toBeGreaterThanOrEqual(50);expect(Number(first!.ip_wait)).toBeLessThan(71);
  const work=vi.fn(async()=>({value:'bad',status:200}));await expect(request(work,{},AbortSignal.timeout(150))).rejects.toThrow();expect(work).not.toHaveBeenCalled();
  await q`update app.collection_control set next_allowed_at=null`;
  expect(await request()).toBe('proxy-2');
  const state=await proxyStatus(q);expect(JSON.stringify(state)).not.toContain('never-expose');expect(state.endpoints.find(p=>p.id==='proxy-1')!.attempts).toBe(1);
 });
 it.each([15,100,200])('accepts a %s/minute ceiling across API, database and scheduler without weakening per-IP pacing',async rate=>{
  await q`update app.collection_control set paused=true`;
  const actor={id:'fixture-admin',name:'Admin'},body={action:'proxies',revision:1,enabled:true,minSeconds:40,maxSeconds:60,requestsPerMinute:rate,activeIds:['proxy-1','proxy-2']};
  await changeCollection(actor,body,q);
  await expect(changeCollection(actor,{...body,revision:2,requestsPerMinute:201},q)).rejects.toThrow('1 și 200');
  await expect(q`update app.collection_proxy_control set requests_per_minute=201`).rejects.toThrow();
  expect((await q`select requests_per_minute from app.collection_proxy_control`)[0]!.requests_per_minute).toBe(rate);
  expect(await q`select id from app.collection_audit`).toHaveLength(1);
  await q`update app.collection_control set paused=false,next_allowed_at=null`;
  expect(await request()).toBe('proxy-1');
  const [timing]=await q`select extract(epoch from(c.next_allowed_at-r.started_at)) global_wait,extract(epoch from(p.next_allowed_at-r.started_at)) ip_wait from app.collection_requests r cross join app.collection_control c join app.collection_proxies p on p.id=r.proxy_id`;
  expect(Number(timing!.global_wait)).toBeGreaterThanOrEqual(60/rate);expect(Number(timing!.global_wait)).toBeLessThan(60/rate+1);
  expect(Number(timing!.ip_wait)).toBeGreaterThanOrEqual(40);expect(Number(timing!.ip_wait)).toBeLessThan(61);
 });
 it('isolates a failed document transport without replaying its session or blocking collection',async()=>{
  await expect(request(vi.fn(async()=>{throw new CollectionTransportError(Error('socket closed'),{retryableProxyTransport:true});}),{stream:'documents'})).rejects.toBeInstanceOf(CollectionProxyFailureError);
  expect((await q`select blocked_reason from app.collection_control`)[0]!.blocked_reason).toBeNull();
  expect(await q`select task_id from app.collection_retries`).toHaveLength(0);
  await q`update app.collection_control set next_allowed_at=null`;
  expect(await request()).toBe('proxy-2');
 });
 it('pins a document chain and lets other requests use a different IP',async()=>{
  const id='a725a132-b6c0-4282-afbf-ae854427ea64',c=await q.reserve();
  try{
   await q`insert into app.document_jobs(id,notice_key,kind,dedup_key,requested_by,status) values(${id},'proxy-fixture','list','proxy-fixture','fixture','running')`;
   const selected=await reserveDocumentProxy(c,id);expect(selected?.id).toBe('proxy-1');
   expect(await request()).toBe('proxy-2');await q`update app.collection_control set next_allowed_at=null`;
   expect(await request(undefined,{stream:'documents',proxyId:selected!.id,documentJobId:id})).toBe('proxy-1');
   await q`update app.collection_control set next_allowed_at=null`;
   const work=vi.fn(async()=>({value:'bad',status:200}));await expect(request(work,{stream:'documents',proxyId:selected!.id,documentJobId:id},AbortSignal.timeout(150))).rejects.toThrow();expect(work).not.toHaveBeenCalled();
  }finally{await releaseDocumentProxy(c,id);await q`delete from app.document_jobs where id=${id}`;c.release();}
 });
 it('keeps the global sixty-second file gap even with a different available IP',async()=>{
  await q`update app.collection_control set last_file_at=clock_timestamp()`;
  const work=vi.fn(async()=>({value:'bad',status:200}));await expect(request(work,{stream:'documents',fileDownload:true},AbortSignal.timeout(150))).rejects.toThrow();expect(work).not.toHaveBeenCalled();
  expect(await q`select * from app.collection_requests`).toHaveLength(0);
 });
 it.each([403,429,200])('stops globally on refusal/challenge %s; never rotates to replay',async status=>{
  await expect(request(vi.fn(async()=>({value:'refused',status,challenge:status===200})))).rejects.toThrow();
  const work=vi.fn(async()=>({value:'bad',status:200}));await expect(request(work)).rejects.toThrow();expect(work).not.toHaveBeenCalled();
  expect(await q`select * from app.collection_requests`).toHaveLength(1);
 });
 it('fails closed if credentials are missing or proxy mode is disabled',async()=>{
  vi.stubEnv('SEAP_PROXY_FILE','/missing-test-file');const work=vi.fn(async()=>({value:'bad',status:200}));await expect(request(work)).rejects.toThrow();
  await q`update app.collection_proxy_control set enabled=false`;
  vi.stubEnv('SEAP_PROXY_REQUIRED','typo');await expect(request(work)).rejects.toThrow('Configurația proxy');vi.stubEnv('SEAP_PROXY_REQUIRED','true');
  await expect(request(work)).rejects.toThrow('directă');expect(work).not.toHaveBeenCalled();expect(await q`select * from app.collection_requests`).toHaveLength(0);
 });
 it('requires pause and revision, audits settings, preserves cooldown and source blocks',async()=>{
  const actor={id:'fixture-admin',name:'Admin'},body={action:'proxies',revision:1,enabled:true,minSeconds:50,maxSeconds:70,requestsPerMinute:4,activeIds:['proxy-1','proxy-2']};
  await expect(changeCollection(actor,body,q)).rejects.toThrow('pauză');
  await q`update app.collection_control set paused=true,blocked_reason='Fixture refusal',next_allowed_at=now()+interval '90 seconds'`;
  const [old]=await q`select next_allowed_at from app.collection_control`;
  await changeCollection(actor,body,q);
  const [c]=await q`select * from app.collection_control`;expect(c!.paused).toBe(true);expect(c!.blocked_reason).toBe('Fixture refusal');expect(c!.next_allowed_at).toEqual(old!.next_allowed_at);
  expect((await q`select count(*)::int n from app.collection_proxies where enabled`)[0]!.n).toBe(2);
  await expect(changeCollection(actor,body,q)).rejects.toThrow('între timp');
  const [audit]=await q`select * from app.collection_audit`;expect(audit!.after.proxies.requests_per_minute).toBe(4);expect(JSON.stringify(audit)).not.toContain('never-expose');
  await expect(changeCollection(actor,{...body,revision:2,activeIds:['proxy-99']},q)).rejects.toThrow('înregistrate');
  await q`update app.collection_proxies set enabled=false,consecutive_failures=3,last_error='fixture circuit',next_allowed_at=now()+interval '10 minutes' where id='proxy-1'`;
  const [cooldown]=await q`select next_allowed_at from app.collection_proxies where id='proxy-1'`;
  await changeCollection(actor,{...body,revision:2},q);
  expect((await q`select enabled,consecutive_failures,last_error,next_allowed_at from app.collection_proxies where id='proxy-1'`)[0]).toMatchObject({enabled:true,consecutive_failures:0,last_error:null,next_allowed_at:cooldown!.next_allowed_at});

 });
 it('releases reservations left by terminal jobs before admitting a new request',async()=>{
  const [job]=await q`insert into app.document_jobs(notice_key,kind,dedup_key,requested_by,status) values('proxy-fixture','list','proxy-fixture','fixture','failed') returning id`;
  await q`update app.collection_proxies set reserved_job=${job!.id}`;
  expect(await request()).toBe('proxy-1');
  expect((await q`select reserved_job from app.collection_proxies`).every(p=>p.reserved_job===null)).toBe(true);
 });
 it('waits without source traffic when every IP is reserved',async()=>{
  const [job]=await q`insert into app.document_jobs(notice_key,kind,dedup_key,requested_by,status) values('proxy-fixture','list','proxy-fixture','fixture','running') returning id`;
  await q`update app.collection_proxies set reserved_job=${job!.id}`;
  const work=vi.fn(async()=>({value:'bad',status:200}));await expect(request(work,{},AbortSignal.timeout(150))).rejects.toThrow();expect(work).not.toHaveBeenCalled();expect(await q`select * from app.collection_requests`).toHaveLength(0);
 });
});
