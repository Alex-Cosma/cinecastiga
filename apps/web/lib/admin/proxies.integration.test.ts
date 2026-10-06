import {afterAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDb,runCollectionRequest,registerSeapProxies,reserveDocumentProxy,releaseDocumentProxy,type DbSql} from '@seap/db';
import {changeCollection} from './collection';
import {proxyStatus} from './proxies';
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))throw Error('Dedicated test database required');
const connection=url?createDb(url):null;
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
  await q`update app.collection_proxy_control set enabled=true,requests_per_minute=3,min_seconds=50,max_seconds=70 where id=1`;
  await registerSeapProxies(q,pool);await q`update app.collection_proxies set enabled=true`;
  await q`update app.collection_control set paused=false where id=1`;
  await q`insert into app.document_notices(key,notice_id,notice_type,notice_no,title,url) values('proxy-fixture','1',17,'SCN_FIXTURE','Fixture','https://example.test') on conflict do nothing`;
  await q`delete from app.document_jobs where notice_key='proxy-fixture'`;
 });
 const info={stream:'da' as const,worker:'proxy-fixture',method:'POST',url:'https://www.e-licitatie.ro/api-pub/fixture'};
 async function request(work=vi.fn(async(_signal:AbortSignal,p:any)=>({value:p?.id,status:200})),extra:Partial<Parameters<typeof runCollectionRequest>[1]>={},signal?:AbortSignal){const c=await q.reserve();try{return await runCollectionRequest(c,{...info,...extra},work,signal);}finally{c.release();}}
 it('persists per-IP wait, the global ceiling and endpoint identity in the ledger',async()=>{
  expect(await request()).toBe('proxy-1');
  const [first]=await q`select r.proxy_id,extract(epoch from(c.next_allowed_at-r.started_at)) global_wait,extract(epoch from(p.next_allowed_at-r.started_at)) ip_wait from app.collection_requests r cross join app.collection_control c join app.collection_proxies p on p.id='proxy-1'`;
  expect(first!.proxy_id).toBe('proxy-1');expect(Number(first!.global_wait)).toBeGreaterThanOrEqual(20);expect(Number(first!.ip_wait)).toBeGreaterThanOrEqual(50);expect(Number(first!.ip_wait)).toBeLessThan(71);
  const work=vi.fn(async()=>({value:'bad',status:200}));await expect(request(work,{},AbortSignal.timeout(150))).rejects.toThrow();expect(work).not.toHaveBeenCalled();
  await q`update app.collection_control set next_allowed_at=null`;
  expect(await request()).toBe('proxy-2');
  const state=await proxyStatus(q);expect(JSON.stringify(state)).not.toContain('never-expose');expect(state.endpoints.find(p=>p.id==='proxy-1')!.attempts).toBe(1);
 });
 it('accepts the fifteen-per-minute ceiling across API, database and scheduler without weakening per-IP pacing',async()=>{
  await q`update app.collection_control set paused=true`;
  const actor={id:'fixture-admin',name:'Admin'},body={action:'proxies',revision:1,enabled:true,minSeconds:40,maxSeconds:60,requestsPerMinute:15,activeIds:['proxy-1','proxy-2']};
  await changeCollection(actor,body,q);
  await expect(changeCollection(actor,{...body,revision:2,requestsPerMinute:16},q)).rejects.toThrow('1 și 15');
  await expect(q`update app.collection_proxy_control set requests_per_minute=16`).rejects.toThrow();
  expect((await q`select requests_per_minute from app.collection_proxy_control`)[0]!.requests_per_minute).toBe(15);
  expect(await q`select id from app.collection_audit`).toHaveLength(1);
  await q`update app.collection_control set paused=false,next_allowed_at=null`;
  expect(await request()).toBe('proxy-1');
  const [timing]=await q`select extract(epoch from(c.next_allowed_at-r.started_at)) global_wait,extract(epoch from(p.next_allowed_at-r.started_at)) ip_wait from app.collection_requests r cross join app.collection_control c join app.collection_proxies p on p.id=r.proxy_id`;
  expect(Number(timing!.global_wait)).toBeGreaterThanOrEqual(4);expect(Number(timing!.global_wait)).toBeLessThan(5);
  expect(Number(timing!.ip_wait)).toBeGreaterThanOrEqual(40);expect(Number(timing!.ip_wait)).toBeLessThan(61);
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
