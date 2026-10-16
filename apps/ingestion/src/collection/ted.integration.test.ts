import {readFileSync} from 'node:fs';
import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CollectionSuspendedError,createDb,detectOperationalAlerts,registerSeapProxies,runCollectionRequest,type DbSql} from '@seap/db';
import type {ElicitatieClient} from '@seap/scraper-clients';
import {closeSharedDb} from '../db.js';
import {archiveDocumentsSql} from '../scrape/archive.js';
import {advanceRecovery} from './advance.js';
import {fetchTask,insertTasks,recoveryStep} from './runner.js';
import {task} from './plan.js';
import {enableTedCollection} from './ted-activation.js';

// Writes collection/raw rows through the real gate: an explicit, isolated, shared test database only.
const url=process.env['TEST_DATABASE_URL'];
if(url&&(!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1))||process.env['DATABASE_URL']!==url))throw Error('Explicit isolated shared database required');
const {sql:q}=createDb(url);

const FIXTURE=readFileSync(new URL('../../test/fixtures/ted-298320-2026.xml',import.meta.url),'utf8');
const xmlFor=(pubnum:string,day='2026-10-13')=>{const [n,y]=pubnum.split('-');return FIXTURE.replace('00298320-2026',`${n!.padStart(8,'0')}-${y}`).replace('2026-04-30+02:00',`${day}+02:00`);};

type Reply=number|{status:number;retryAfter?:string}|'mismatch';
/** Offline TED behind the real gate (direct mode): never reaches the network. */
function mockTed(days:Record<string,string[]>){
 const calls:string[]=[],search:Reply[]=[],xml=new Map<string,Reply>();
 const fail=(r:Reply)=>typeof r==='number'?new Response('error',{status:r}):r==='mismatch'?null:new Response('error',{status:r.status,headers:r.retryAfter?{'retry-after':r.retryAfter}:{}});
 const fetch=vi.fn(async(input:unknown,init?:RequestInit)=>{
  const u=new URL(String(input));
  if(u.href==='https://api.ted.europa.eu/v3/notices/search'){
   const body=JSON.parse(String(init?.body)) as {query:string;page:number;limit:number};
   const d=/publication-date>=(\d{4})(\d{2})(\d{2})/.exec(body.query)!,day=`${d[1]}-${d[2]}-${d[3]}`;
   calls.push(`search ${day}#${body.page}`);
   const next=search.shift();if(next!==undefined)return fail(next)!;
   const all=days[day]??[];
   return Response.json({totalNoticeCount:all.length,notices:all.slice((body.page-1)*body.limit,body.page*body.limit).map(p=>({'publication-number':p,'publication-date':`${day}+02:00`,'notice-type':'can-standard'}))});
  }
  const m=/^\/en\/notice\/(\d+-\d{4})\/xml$/.exec(u.pathname);
  if(u.hostname==='ted.europa.eu'&&m){
   calls.push(`xml ${m[1]}`);
   const day=Object.entries(days).find(([,list])=>list.includes(m[1]!))?.[0];
   const next=xml.get(m[1]!);if(next==='mismatch')return new Response(xmlFor('999999-2026',day));if(next!==undefined)return fail(next)!;
   return new Response(xmlFor(m[1]!,day),{headers:{'content-type':'application/xml'}});
  }
  throw Error(`unexpected request ${u.href}`);
 });
 return {fetch,calls,search,xml};
}

const seap={} as ElicitatieClient;
/** Drains the queue; the per-request spacing is reset so the test does not wait the configured seconds. */
async function drain(max=50){
 let steps=0;
 for(;steps<max;steps++){
  await q`update app.collection_control set next_allowed_at=null where id=1`;
  if(!await recoveryStep(q,t=>fetchTask(seap,t)))break;
 }
 return steps;
}
const control=async()=>(await q`select paused_streams,blocked_reason from app.collection_control where id=1`)[0]!;
const raw=async()=>(await q`select external_id,endpoint_version from raw.raw_documents where source='ted' order by external_id`).map(r=>`${r.external_id} ${r.endpoint_version}`);

describe.skipIf(!url)('TED as a collection stream (real gate and ledger, mocked TED)',()=>{
 beforeEach(async()=>{
  await q`truncate app.collection_tasks,app.collection_batches,app.collection_requests,app.collection_retries,app.collection_audit,app.operational_alerts cascade`;
  await q`delete from raw.raw_documents where source='ted'`;
  await q`insert into app.collection_control(id) values(1) on conflict do nothing`;
  await q`update app.collection_control set paused=false,maintenance=false,paused_streams='[]',blocked_reason=null,blocked_until=null,next_allowed_at=null,daily_limit=null,min_seconds=1,max_seconds=1 where id=1`;
  await q`insert into app.collection_batches(id,end_day,seed_end_day,follow_latest,next_stream) values('fixture','2026-10-15','2026-09-25',true,0)`;
  // Bulk-imported shape (date only in the XML): the latest archived day is 13 October.
  await archiveDocumentsSql(q,[['50-2026','2026-09-01'],['100-2026','2026-10-13']].map(([p,d])=>({source:'ted',externalId:`can-standard:${p}`,endpointVersion:'ted-eforms:v1',payload:{'publication-number':p,'notice-type':'can-standard',xml:xmlFor(p!,d)}})));
 });
 afterEach(()=>vi.unstubAllGlobals());
 afterAll(async()=>{
  await q`truncate app.collection_tasks,app.collection_batches,app.collection_requests,app.collection_retries,app.collection_audit,app.operational_alerts cascade`;
  await q`delete from raw.raw_documents where source='ted'`;
  await closeSharedDb();await q.end();
 });

 it('stays off until the audited enable, which seeds from the latest archived day without traffic',async()=>{
  const ted=mockTed({});vi.stubGlobal('fetch',ted.fetch);
  expect(await advanceRecovery(q,{now:new Date('2026-10-17T10:00:00Z')})).toMatchObject({endDay:'2026-10-16'});
  expect((await q`select count(*)::int n from app.collection_tasks where stream='ted'`)[0]!.n).toBe(0);
  await q`update app.collection_batches set end_day='2026-10-15'`;await q`delete from app.collection_tasks`;
  const enabled=await enableTedCollection(q);
  expect(enabled).toMatchObject({latestArchivedDay:'2026-10-13',from:'2026-10-11',to:'2026-10-15',added:5});
  expect(await enableTedCollection(q)).toMatchObject({alreadyActive:true,added:0});
  expect((await q`select action,after from app.collection_audit where action='ted-enabled'`)[0]!.after).toMatchObject({days:5,latestArchivedDay:'2026-10-13'});
  expect(ted.fetch).not.toHaveBeenCalled();
  // Daily advance: the newly closed day plus a 3-day overlap, scanned again.
  await advanceRecovery(q,{now:new Date('2026-10-17T10:00:00Z')});
  const scan=await q`select params->>'from' as day from app.collection_tasks where stream='ted' and params->>'tedScan'='2026-10-16' order by 1`;
  expect(scan.map(r=>r.day)).toEqual(['2026-10-13','2026-10-14','2026-10-15','2026-10-16']);
 });

 it('refuses to enable without a TED baseline in raw',async()=>{
  await q`delete from raw.raw_documents where source='ted'`;
  await expect(enableTedCollection(q)).rejects.toThrow(/No TED eForms/);
 });

 it('archives through the shared gate and ledger, and overlap scans never refetch',async()=>{
  const ted=mockTed({'2026-10-13':['100-2026','101-2026'],'2026-10-14':['110-2026'],'2026-10-16':['120-2026']});vi.stubGlobal('fetch',ted.fetch);
  await enableTedCollection(q);await drain();
  expect(ted.calls.filter(c=>c.startsWith('xml'))).toEqual(['xml 101-2026','xml 110-2026']);
  expect(await raw()).toEqual(['can-standard:100-2026 ted-eforms:v1','can-standard:101-2026 ted-eforms:v1','can-standard:110-2026 ted-eforms:v1','can-standard:50-2026 ted-eforms:v1']);
  const ledger=await q`select stream,method,endpoint,parameters,outcome,proxy_id from app.collection_requests order by id`;
  expect(ledger.every(r=>r.stream==='ted'&&r.outcome==='success')).toBe(true);
  expect(ledger[0]).toMatchObject({method:'POST',endpoint:'api.ted.europa.eu/v3/notices/search',parameters:{publicationDate:'2026-10-11',page:1,limit:100}});
  expect(ledger.find(r=>r.method==='GET')).toMatchObject({endpoint:'ted.europa.eu/en/notice/101-2026/xml',parameters:{publicationNumber:'101-2026'}});
  expect((await q`select count(*) filter(where status='complete')::int done,count(*)::int n from app.collection_tasks`)[0]).toEqual({done:7,n:7});
  // Next day: overlap days are searched again, only the new notice is fetched.
  ted.calls.length=0;
  await advanceRecovery(q,{now:new Date('2026-10-17T10:00:00Z')});
  await q`delete from app.collection_tasks where stream<>'ted'`;
  await drain();
  expect(ted.calls).toEqual(['search 2026-10-13#1','search 2026-10-14#1','search 2026-10-15#1','search 2026-10-16#1','xml 120-2026']);
  expect(await raw()).toHaveLength(5);
  expect(await control()).toEqual({paused_streams:[],blocked_reason:null});
 });

 it('a TED 429 pauses only the TED stream, keeps the task, alerts, and SEAP continues',async()=>{
  const ted=mockTed({});ted.search.push({status:429,retryAfter:'120'});vi.stubGlobal('fetch',ted.fetch);
  await enableTedCollection(q);
  await q`update app.collection_tasks set priority=0 where params->>'from'='2026-10-11'`;
  await drain();
  expect(ted.calls).toEqual(['search 2026-10-11#1']);
  const c=await control();expect(c.paused_streams).toEqual(['ted']);expect(c.blocked_reason).toBeNull();
  const [request]=await q`select status,outcome,error from app.collection_requests`;
  expect(request).toMatchObject({status:429,outcome:'failed'});expect(request!.error).toContain('Retry-After 120');
  expect((await q`select count(*)::int n from app.collection_tasks where status='pending'`)[0]!.n).toBe(5);
  const [audit]=await q`select after from app.collection_audit where action='stream-auto-paused'`;
  expect(audit!.after).toMatchObject({stream:'ted',pausedStreams:['ted']});
  expect((await detectOperationalAlerts(q,'https://example.invalid')).filter(a=>a.kind==='stream-auto-paused').map(a=>a.subject)).toEqual(['Fluxul „ted” a fost pus automat pe pauză']);
  // SEAP stream still admitted through the same gate.
  await insertTasks(q,[task('fixture','da','da',{authorityId:7848,from:'2026-07-01',to:'2026-09-25',page:0})]);
  await q`update app.collection_control set next_allowed_at=null`;
  expect(await recoveryStep(q,async()=>({total:0,items:[]}))).toBe(true);
  expect((await q`select status from app.collection_tasks where stream='da'`)[0]!.status).toBe('complete');
 });

 it('a TED 5xx is retried on the shared schedule without a SEAP stop',async()=>{
  const ted=mockTed({});ted.search.push(503);vi.stubGlobal('fetch',ted.fetch);
  await enableTedCollection(q);await drain(1);
  expect((await q`select status,timeouts from app.collection_retries`)[0]).toMatchObject({status:'pending',timeouts:1});
  expect(await control()).toEqual({paused_streams:[],blocked_reason:null});
 });

 it('unreadable XML stops only TED and is not archived; a missing notice is an isolated gap',async()=>{
  const ted=mockTed({'2026-10-14':['110-2026','111-2026']});ted.xml.set('110-2026',404);vi.stubGlobal('fetch',ted.fetch);
  await enableTedCollection(q);await drain();
  expect((await q`select status,error from app.collection_tasks where params->>'publicationNumber'='110-2026'`)[0]).toMatchObject({status:'failed'});
  expect(await control()).toEqual({paused_streams:[],blocked_reason:null});
  expect(await raw()).toContain('can-standard:111-2026 ted-eforms:v1');
  // A later scan re-lists the day and retries only the missing notice.
  ted.xml.set('110-2026','mismatch');ted.calls.length=0;
  await advanceRecovery(q,{now:new Date('2026-10-17T10:00:00Z')});await q`delete from app.collection_tasks where stream<>'ted'`;
  await drain();
  expect(ted.calls.filter(c=>c.startsWith('xml'))).toEqual(['xml 110-2026']);
  const c=await control();expect(c.paused_streams).toEqual(['ted']);expect(c.blocked_reason).toBeNull();
  expect(await raw()).not.toContain('can-standard:110-2026 ted-eforms:v1');
  expect((await q`select after->>'reason' reason from app.collection_audit where action='stream-auto-paused'`)[0]!.reason).toMatch(/TED: XML-ul cerut pentru 110-2026/);
 });

 it('uses the shared proxy pool, but a TED 5xx never feeds the SEAP proxy circuit; other hosts are refused',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'seap-ted-proxy-'));
  const pool=[1,2].map(n=>({id:`proxy-${n}`,server:`http://192.0.2.${n}:8000`,username:'fixture-only',password:'fixture-password'}));
  try{
   const file=join(folder,'proxies.json');await writeFile(file,JSON.stringify(pool));vi.stubEnv('SEAP_PROXY_FILE',file);vi.stubEnv('SEAP_PROXY_REQUIRED','true');
   await q`insert into app.collection_proxy_control(id) values(1) on conflict do nothing`;
   await q`update app.collection_proxy_control set enabled=true,max_in_flight=1,requests_per_minute=200,min_seconds=1,max_seconds=1 where id=1`;
   await q`truncate app.collection_proxies`;await q`update app.collection_control set paused=true where id=1`;
   await registerSeapProxies(q,pool);await q`update app.collection_proxies set enabled=true`;await q`update app.collection_control set paused=false where id=1`;
   const running=async(stream:string,kind:string)=>(await q`insert into app.collection_tasks(batch_id,key,partition,stream,kind,params,status) values('fixture',${`${stream}-proxy`},${`${stream}-proxy`},${stream},${kind},'{}','running') returning id`)[0]!.id;
   const call=async(stream:'ted'|'da',url:string,taskId:unknown,status=503)=>{const c=await q.reserve();try{return await runCollectionRequest(c as unknown as DbSql,{stream,worker:'ted-proxy-fixture',method:'GET',url,context:{taskId}},async(_signal,proxy)=>({value:proxy?.id,status}));}finally{c.release();}};
   await expect(call('ted','https://ted.europa.eu/en/notice/1-2026/xml',await running('ted','ted-xml'))).rejects.toBeInstanceOf(CollectionSuspendedError);
   const [ted]=await q`select proxy_id,status from app.collection_requests where stream='ted'`;
   expect(ted!.proxy_id).toMatch(/^proxy-/);expect(ted!.status).toBe(503);
   expect((await q`select sum(consecutive_failures)::int n from app.collection_proxies`)[0]!.n).toBe(0);
   expect((await q`select status from app.collection_retries`)[0]!.status).toBe('pending');
   await q`update app.collection_proxies set next_allowed_at=null`;await q`update app.collection_control set next_allowed_at=null`;
   await expect(call('da','https://www.e-licitatie.ro/api-pub/fixture',await running('da','da'))).rejects.toBeInstanceOf(CollectionSuspendedError);
   expect((await q`select sum(consecutive_failures)::int n from app.collection_proxies`)[0]!.n).toBe(1);
   const before=(await q`select count(*)::int n from app.collection_requests`)[0]!.n;
   await expect(call('ted','https://example.org/en/notice/1-2026/xml',null,200)).rejects.toThrow(/neacceptat/);
   await expect(call('ted','https://ted.europa.eu/packages/monthly/2026-1',null,200)).rejects.toThrow(/TED neacceptat/);
   expect((await q`select count(*)::int n from app.collection_requests`)[0]!.n).toBe(before);
   expect(await control()).toEqual({paused_streams:[],blocked_reason:null});
  }finally{
   vi.unstubAllEnvs();await q`update app.collection_proxy_control set enabled=false where id=1`;await q`truncate app.collection_proxies`;
   await rm(folder,{recursive:true,force:true});
  }
 });
});
