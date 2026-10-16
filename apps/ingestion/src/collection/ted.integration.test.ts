import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {CollectionSuspendedError,createDb,detectOperationalAlerts,registerSeapProxies,runCollectionRequest,type DbSql} from '@seap/db';
import type {ElicitatieClient} from '@seap/scraper-clients';
import {closeSharedDb} from '../db.js';
import {archiveDocumentsSql} from '../scrape/archive.js';
import {tedArchiveDocument} from '../scrape/ted/notices.js';
import {tedDailyPackage,tedNoticeXml} from '../test/ted-package-fixture.js';
import {advanceRecovery} from './advance.js';
import {fetchTask,insertTasks,recoveryStep} from './runner.js';
import {task} from './plan.js';
import {enableTedCollection} from './ted-activation.js';

// Writes collection/raw rows through the real gate: an explicit, isolated, shared test database only.
const url=process.env['TEST_DATABASE_URL'];
if(url&&(!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1))||process.env['DATABASE_URL']!==url))throw Error('Explicit isolated shared database required');
const {sql:q}=createDb(url);

type Reply=number|{status:number;retryAfter?:string;headers?:Record<string,string>;body?:string|Buffer};
/** OJ S issues (day + Romanian notices) and TED search days, offline behind the real gate (direct mode). */
function mockTed(issues:Record<string,{day:string;notices:string[]}>){
 const calls:string[]=[],search:Reply[]=[],packages=new Map<string,Reply[]>(),searchDays=new Map<string,string[]>();
 const reply=(r:Reply)=>typeof r==='number'?new Response('error',{status:r}):new Response(r.body??'',{status:r.status,headers:{...r.headers,...(r.retryAfter?{'retry-after':r.retryAfter}:{})}});
 const fetch=vi.fn(async(input:unknown,init?:RequestInit)=>{
  const u=new URL(String(input));
  if(u.href==='https://api.ted.europa.eu/v3/notices/search'){
   const body=JSON.parse(String(init?.body)) as {query:string;page:number;limit:number};
   const d=/publication-date>=(\d{4})(\d{2})(\d{2})/.exec(body.query)!,day=`${d[1]}-${d[2]}-${d[3]}`;
   calls.push(`search ${day}#${body.page}`);
   const next=search.shift();if(next!==undefined)return reply(next);
   const all=searchDays.get(day)??Object.values(issues).filter(i=>i.day===day).flatMap(i=>i.notices);
   return Response.json({totalNoticeCount:all.length,notices:all.slice((body.page-1)*body.limit,body.page*body.limit).map(p=>({'publication-number':p,'publication-date':`${day}+02:00`,'notice-type':'can-standard'}))});
  }
  const m=/^\/packages\/daily\/(\d{9})$/.exec(u.pathname);
  if(u.hostname==='ted.europa.eu'&&m){
   const ojs=m[1]!;calls.push(`package ${ojs}`);
   const next=packages.get(ojs)?.shift();if(next!==undefined)return reply(next);
   const issue=issues[ojs];if(!issue)return new Response('Not Found',{status:404});
   const p=tedDailyPackage(ojs,issue.day,issue.notices);
   return new Response(p.bytes,{headers:{'content-type':'application/gzip','content-disposition':`attachment; filename=${p.filename}`}});
  }
  throw Error(`unexpected request ${u.href}`);
 });
 const fail=(ojs:string,...r:Reply[])=>packages.set(ojs,[...(packages.get(ojs)??[]),...r]);
 return {fetch,calls,search,fail,searchDays};
}

const seap={} as ElicitatieClient;
/** Drains the queue; the request and file spacing is reset so the test does not wait the configured seconds. */
async function drain(max=50){
 let steps=0;
 for(;steps<max;steps++){
  await q`update app.collection_control set next_allowed_at=null,last_file_at=null where id=1`;
  if(!await recoveryStep(q,t=>fetchTask(seap,t)))break;
 }
 return steps;
}
const control=async()=>(await q`select paused_streams,blocked_reason from app.collection_control where id=1`)[0]!;
const raw=async()=>(await q`select external_id from raw.raw_documents where source='ted' order by external_id`).map(r=>String(r.external_id).replace('can-standard:',''));
const tasks=async()=>(await q`select kind,params->>'ojs' ojs,status,error from app.collection_tasks where stream='ted' order by id`).map(r=>`${r.kind} ${r.ojs??'-'} ${r.status}`);
const later=(hours:number)=>new Date(Date.now()+hours*3600_000);
// Latest archived TED issue in raw: OJ S 198/2026 (13 October), as archived by the import.
const BASELINE={'202600150':{day:'2026-09-01',notices:['50-2026']},'202600198':{day:'2026-10-13',notices:['100-2026']}};

describe.skipIf(!url)('TED daily packages as a collection stream (real gate and ledger, mocked TED)',()=>{
 beforeEach(async()=>{
  await q`truncate app.collection_tasks,app.collection_batches,app.collection_requests,app.collection_retries,app.collection_audit,app.operational_alerts cascade`;
  await q`delete from raw.raw_documents where source='ted'`;
  await q`insert into app.collection_control(id) values(1) on conflict do nothing`;
  await q`update app.collection_control set paused=false,maintenance=false,paused_streams='[]',blocked_reason=null,blocked_until=null,next_allowed_at=null,last_file_at=null,daily_limit=null,min_seconds=1,max_seconds=1 where id=1`;
  await q`insert into app.collection_batches(id,end_day,seed_end_day,follow_latest,next_stream) values('fixture','2026-10-15','2026-09-25',true,0)`;
  await archiveDocumentsSql(q,Object.entries(BASELINE).flatMap(([ojs,i])=>i.notices.map(p=>tedArchiveDocument({'publication-date':i.day},p,'can-standard',tedNoticeXml({publication:p,ojs,day:i.day})))));
 });
 afterEach(()=>vi.unstubAllGlobals());
 afterAll(async()=>{
  await q`truncate app.collection_tasks,app.collection_batches,app.collection_requests,app.collection_retries,app.collection_audit,app.operational_alerts cascade`;
  await q`delete from raw.raw_documents where source='ted'`;
  await closeSharedDb();await q.end();
 });

 it('stays off until the audited enable, which starts at the latest archived OJ S issue and supersedes the per-notice tasks, without traffic',async()=>{
  const ted=mockTed({});vi.stubGlobal('fetch',ted.fetch);
  expect(await advanceRecovery(q,{now:new Date('2026-10-17T10:00:00Z')})).toMatchObject({endDay:'2026-10-16'});
  expect((await q`select count(*)::int n from app.collection_tasks where stream='ted'`)[0]!.n).toBe(0);
  await q`update app.collection_batches set end_day='2026-10-15'`;await q`delete from app.collection_tasks`;
  // Legacy tasks of the per-notice design, as left in production by the earlier activation.
  await q`insert into app.collection_tasks(batch_id,key,partition,stream,kind,params,priority,status,error) values
   ('fixture','legacy-xml','legacy-xml','ted','ted-xml','{"publicationNumber":"101-2026","publicationDate":"2026-10-13","tedScan":"2026-10-15","page":0}',2,'pending',null),
   ('fixture','legacy-xml-failed','legacy-xml-failed','ted','ted-xml','{"publicationNumber":"102-2026","publicationDate":"2026-10-13","tedScan":"2026-10-15","page":0}',2,'failed','TED a răspuns cu 429'),
   ('fixture','legacy-list','legacy-list','ted','ted-list','{"from":"2026-10-14","to":"2026-10-14","tedScan":"2026-10-15","page":0}',10,'pending',null),
   ('fixture','legacy-done','legacy-done','ted','ted-list','{"from":"2026-10-13","to":"2026-10-13","tedScan":"2026-10-15","page":0}',10,'complete',null)`;
  // A legacy task claimed before the migration is refused without a request and pauses only TED.
  await q`update app.collection_tasks set priority=0 where key='legacy-xml'`;
  await drain(1);
  expect(ted.fetch).not.toHaveBeenCalled();
  expect((await q`select status,error from app.collection_tasks where key='legacy-xml'`)[0]).toMatchObject({status:'failed',error:expect.stringMatching(/ted-enable/)});
  expect(await control()).toEqual({paused_streams:['ted'],blocked_reason:null});
  await q`update app.collection_tasks set status='pending',error=null where key='legacy-xml'`;
  const enabled=await enableTedCollection(q,new Date('2026-10-16T07:30:00Z'));
  expect(enabled).toMatchObject({fromIssue:'202600198',latestArchivedDay:'2026-10-13',superseded:3,added:1});
  expect(await enableTedCollection(q)).toMatchObject({alreadyActive:true,added:0});
  expect(await tasks()).toEqual(['ted-xml - split','ted-xml - split','ted-list - split','ted-list - complete','ted-package 202600198 pending']);
  expect((await q`select key,result from app.collection_tasks where key='legacy-xml-failed'`)[0]!.result).toMatchObject({supersededBy:'ted-package',previousStatus:'failed',previousError:'TED a răspuns cu 429'});
  expect((await q`select key from app.collection_tasks where kind='ted-package'`)[0]!.key).toBe('ted:ted-package:202600198:::scan:2026-10-16T10:0');
  const [audit]=await q`select before,after from app.collection_audit where action='ted-enabled'`;
  expect(audit!.before).toMatchObject({legacy:{'ted-xml:pending':1,'ted-xml:failed':1,'ted-list:pending':1}});
  expect(audit!.after).toMatchObject({source:'ojs-daily-package',fromIssue:'202600198',superseded:3});
  expect(ted.fetch).not.toHaveBeenCalled();
 });

 it('refuses to enable without a TED baseline in raw',async()=>{
  await q`delete from raw.raw_documents where source='ted'`;
  await expect(enableTedCollection(q)).rejects.toThrow(/No TED eForms/);
 });

 it('archives issue after issue through the shared gate and ledger, verifies each day against the search, and waits for an unpublished issue',async()=>{
  const ted=mockTed({...BASELINE,'202600198':{day:'2026-10-13',notices:['100-2026','101-2026']},'202600199':{day:'2026-10-14',notices:['110-2026']},'202600200':{day:'2026-10-15',notices:[]}});
  vi.stubGlobal('fetch',ted.fetch);
  // Keep the SEAP day scope fixed: these ticks only exercise TED.
  await q`update app.collection_batches set end_day='2027-12-31'`;
  await enableTedCollection(q);await drain();
  expect(ted.calls).toEqual(['package 202600198','search 2026-10-13#1','package 202600199','search 2026-10-14#1','package 202600200','search 2026-10-15#1','package 202600201']);
  // Only Romanian-buyer award notices; the overlap issue's known notice is a duplicate (same content hash).
  expect(await raw()).toEqual(['100-2026','101-2026','110-2026','50-2026']);
  const [first]=await q`select result from app.collection_tasks where kind='ted-package' and params->>'ojs'='202600198'`;
  expect(first!.result).toMatchObject({published:true,publicationDate:'2026-10-13',identities:['100-2026','101-2026'],archived:1,duplicates:1,otherCountry:1,xmlFiles:4});
  expect((await q`select result from app.collection_tasks where kind='ted-list' and params->>'ojs'='202600199'`)[0]!.result).toMatchObject({verified:{ojs:'202600199',day:'2026-10-14',package:1,search:1,match:true}});
  const ledger=await q`select stream,method,endpoint,parameters,status,outcome,error,bytes from app.collection_requests order by id`;
  expect(ledger.every(r=>r.stream==='ted')).toBe(true);
  expect(ledger[0]).toMatchObject({method:'GET',endpoint:'ted.europa.eu/packages/daily/202600198',parameters:{ojs:'202600198'},status:200,outcome:'success'});
  expect(Number(ledger[0]!.bytes)).toBeGreaterThan(100);
  expect(ledger[1]).toMatchObject({method:'POST',endpoint:'api.ted.europa.eu/v3/notices/search',parameters:{publicationDate:'2026-10-13',page:1,limit:100},outcome:'success'});
  expect(ledger.at(-1)).toMatchObject({endpoint:'ted.europa.eu/packages/daily/202600201',status:404,outcome:'failed'});
  expect(await tasks()).toEqual(['ted-package 202600198 complete','ted-list 202600198 complete','ted-package 202600199 complete','ted-list 202600199 complete','ted-package 202600200 complete','ted-list 202600200 complete','ted-package 202600201 complete']);
  expect(await control()).toEqual({paused_streams:[],blocked_reason:null});
  // Not yet published: the next tick within the hour adds nothing; after an hour, one new attempt.
  expect(await advanceRecovery(q,{now:later(0.5)})).toMatchObject({added:0});
  expect((await q`select count(*)::int n from app.collection_tasks where kind='ted-package'`)[0]!.n).toBe(4);
  expect((await advanceRecovery(q,{now:later(1.5)}))!.tedTasks).toBe(1);
  expect((await advanceRecovery(q,{now:later(1.6)}))?.tedTasks).toBeUndefined();
  ted.calls.length=0;await drain();
  expect(ted.calls).toEqual(['package 202600201']);
  expect((await q`select status from app.collection_batches`)[0]!.status).toBe('collected');
 });

 it('a package that differs from the TED search is a visible gap for that issue only; later issues continue',async()=>{
  const ted=mockTed({'202600198':{day:'2026-10-13',notices:['100-2026']},'202600199':{day:'2026-10-14',notices:['110-2026']}});
  ted.searchDays.set('2026-10-13',['100-2026','105-2026']);vi.stubGlobal('fetch',ted.fetch);
  await q`update app.collection_batches set end_day='2027-12-31'`;
  await enableTedCollection(q,new Date('2026-10-13T09:00:00Z'));await drain();
  const [gap]=await q`select status,error from app.collection_tasks where kind='ted-list' and params->>'ojs'='202600198'`;
  expect(gap).toMatchObject({status:'failed'});
  expect(gap!.error).toBe('TED: verificare eșuată pentru OJ S 198/2026 (2026-10-13): pachetul are 1 anunțuri românești, căutarea TED 2. Lipsesc din pachet: 105-2026.');
  expect(await control()).toEqual({paused_streams:[],blocked_reason:null});
  expect(await raw()).toEqual(['100-2026','110-2026','50-2026']);
  expect((await q`select status from app.collection_tasks where kind='ted-list' and params->>'ojs'='202600199'`)[0]!.status).toBe('complete');
  // The failed day is searched again on the next days (late indexing), here it now matches.
  // The tick's clock is 15 October; the unpublished issue 200 was just tried, so only the verification is added.
  ted.searchDays.set('2026-10-13',['100-2026']);
  expect(await advanceRecovery(q,{now:new Date('2026-10-15T10:00:00Z')})).toMatchObject({tedTasks:1});
  expect(await advanceRecovery(q,{now:new Date('2026-10-15T11:00:00Z')})).not.toHaveProperty('tedTasks');
  ted.calls.length=0;await drain();
  expect(ted.calls).toEqual(['search 2026-10-13#1']);
  expect((await q`select params->>'tedScan' scan,status from app.collection_tasks where kind='ted-list' and params->>'ojs'='202600198' order by id`).map(r=>`${r.scan} ${r.status}`)).toEqual(['2026-10-13 failed','2026-10-15 complete']);
  // A day that now matches is not searched again (only the unpublished issue may be retried).
  await advanceRecovery(q,{now:new Date('2026-10-17T10:00:00Z')});
  expect((await q`select count(*)::int n from app.collection_tasks where kind='ted-list'`)[0]!.n).toBe(3);
 });

 it('a WAF challenge (202 + x-amzn-waf-action, empty body) is never a success: TED pauses, the task stays queued',async()=>{
  const ted=mockTed({'202600198':{day:'2026-10-13',notices:['100-2026']}});
  ted.fail('202600198',{status:202,headers:{'x-amzn-waf-action':'challenge'}});vi.stubGlobal('fetch',ted.fetch);
  await enableTedCollection(q);await drain();
  expect(ted.calls).toEqual(['package 202600198']);
  const [request]=await q`select status,outcome,error from app.collection_requests`;
  expect(request).toMatchObject({status:202,outcome:'failed'});expect(request!.error).toMatch(/WAF/);
  expect(await control()).toEqual({paused_streams:['ted'],blocked_reason:null});
  expect(await tasks()).toEqual(['ted-package 202600198 pending']);
  // A 200 that is not a gzip archive (an HTML challenge page) is also a failure.
  await q`update app.collection_control set paused_streams='[]'`;ted.fail('202600198',{status:200,body:'<html>verify you are human</html>'});
  await drain();
  expect((await q`select status,outcome,error from app.collection_requests order by id desc limit 1`)[0]).toMatchObject({status:200,outcome:'failed',error:expect.stringMatching(/fără conținutul așteptat/)});
  expect(await control()).toEqual({paused_streams:['ted'],blocked_reason:null});
  // The same on the search API.
  await q`update app.collection_control set paused_streams='[]'`;ted.search.push({status:202,headers:{'x-amzn-waf-action':'challenge'}});
  await drain();
  expect((await q`select method,status,outcome from app.collection_requests where method='POST'`)[0]).toMatchObject({status:202,outcome:'failed'});
  expect((await q`select count(*)::int n from app.collection_requests where outcome='success' and status=202`)[0]!.n).toBe(0);
  expect(await control()).toEqual({paused_streams:['ted'],blocked_reason:null});
 });

 it('a TED 429 pauses only the TED stream, keeps the task, alerts, and SEAP continues',async()=>{
  const ted=mockTed({});ted.fail('202600198',{status:429,retryAfter:'120'});vi.stubGlobal('fetch',ted.fetch);
  await enableTedCollection(q);await drain();
  expect(ted.calls).toEqual(['package 202600198']);
  const c=await control();expect(c.paused_streams).toEqual(['ted']);expect(c.blocked_reason).toBeNull();
  const [request]=await q`select status,outcome,error from app.collection_requests`;
  expect(request).toMatchObject({status:429,outcome:'failed'});expect(request!.error).toContain('Retry-After 120');
  expect(await tasks()).toEqual(['ted-package 202600198 pending']);
  const [audit]=await q`select after from app.collection_audit where action='stream-auto-paused'`;
  expect(audit!.after).toMatchObject({stream:'ted',pausedStreams:['ted']});
  expect((await detectOperationalAlerts(q,'https://example.invalid')).filter(a=>a.kind==='stream-auto-paused').map(a=>a.subject)).toEqual(['Fluxul „ted” a fost pus automat pe pauză']);
  await insertTasks(q,[task('fixture','da','da',{authorityId:7848,from:'2026-07-01',to:'2026-09-25',page:0})]);
  await q`update app.collection_control set next_allowed_at=null`;
  expect(await recoveryStep(q,async()=>({total:0,items:[]}))).toBe(true);
  expect((await q`select status from app.collection_tasks where stream='da'`)[0]!.status).toBe('complete');
 });

 it('a TED 5xx is retried on the shared schedule without a SEAP stop; an invalid archive stops only TED',async()=>{
  const ted=mockTed({'202600198':{day:'2026-10-13',notices:['100-2026']}});ted.fail('202600198',503);vi.stubGlobal('fetch',ted.fetch);
  await enableTedCollection(q);await drain(1);
  expect((await q`select status,timeouts from app.collection_retries`)[0]).toMatchObject({status:'pending',timeouts:1});
  expect(await control()).toEqual({paused_streams:[],blocked_reason:null});
  await q`truncate app.collection_retries`;
  // A gzip body that is not a valid tar: the request succeeded, the archive is refused; nothing archived.
  ted.fail('202600198',{status:200,headers:{'content-disposition':'attachment; filename=20261013_2026198.tar.gz'},body:gzipSync('not a tar archive'.padEnd(700,'.'))});
  await drain();
  const [t]=await q`select status,error from app.collection_tasks where kind='ted-package'`;
  expect(t!.status).toBe('failed');expect(await control()).toMatchObject({paused_streams:['ted']});
  expect(await raw()).toEqual(['100-2026','50-2026']);
 });

 it('rolls over to the first issue of the new year after a 404 in January',async()=>{
  await archiveDocumentsSql(q,[tedArchiveDocument({'publication-date':'2026-12-31'},'790000-2026','can-standard',tedNoticeXml({publication:'790000-2026',ojs:'202600252',day:'2026-12-31'}))]);
  const ted=mockTed({'202600252':{day:'2026-12-31',notices:['790000-2026']},'202700001':{day:'2027-01-04',notices:['1000-2027']}});vi.stubGlobal('fetch',ted.fetch);
  await q`update app.collection_batches set end_day='2027-12-31'`;
  await enableTedCollection(q);await drain();
  expect(ted.calls).toEqual(['package 202600252','search 2026-12-31#1','package 202600253']);
  // Still 2026 in Romania: only the next number of the old year is retried.
  expect((await advanceRecovery(q,{now:new Date(Math.max(Date.now(),Date.parse('2026-12-31T10:00:00Z'))+2*3600_000)}))?.tedTasks).toBe(1);
  await q`delete from app.collection_tasks where kind='ted-package' and status='pending'`;
  expect((await advanceRecovery(q,{now:new Date('2027-01-04T12:00:00Z')}))!.tedTasks).toBe(2);
  ted.calls.length=0;await drain();
  expect(ted.calls).toEqual(['package 202600253','package 202700001','search 2027-01-04#1','package 202700002']);
  expect(await raw()).toContain('1000-2027');
  expect((await advanceRecovery(q,{now:new Date('2027-01-04T14:00:00Z')}))!.tedTasks).toBe(1);
  expect((await q`select params->>'ojs' ojs from app.collection_tasks where kind='ted-package' and status='pending'`).map(r=>r.ojs)).toEqual(['202700002']);
 });

 it('uses the shared proxy pool, but a TED 5xx never feeds the SEAP proxy circuit; other hosts and the per-notice XML are refused',async()=>{
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
   await expect(call('ted','https://ted.europa.eu/packages/daily/202600198',await running('ted','ted-package'))).rejects.toBeInstanceOf(CollectionSuspendedError);
   const [ted]=await q`select proxy_id,status from app.collection_requests where stream='ted'`;
   expect(ted!.proxy_id).toMatch(/^proxy-/);expect(ted!.status).toBe(503);
   expect((await q`select sum(consecutive_failures)::int n from app.collection_proxies`)[0]!.n).toBe(0);
   expect((await q`select status from app.collection_retries`)[0]!.status).toBe('pending');
   await q`update app.collection_proxies set next_allowed_at=null`;await q`update app.collection_control set next_allowed_at=null`;
   await expect(call('da','https://www.e-licitatie.ro/api-pub/fixture',await running('da','da'))).rejects.toBeInstanceOf(CollectionSuspendedError);
   expect((await q`select sum(consecutive_failures)::int n from app.collection_proxies`)[0]!.n).toBe(1);
   const before=(await q`select count(*)::int n from app.collection_requests`)[0]!.n;
   await expect(call('ted','https://example.org/packages/daily/202600198',null,200)).rejects.toThrow(/neacceptat/);
   await expect(call('ted','https://ted.europa.eu/packages/monthly/2026-1',null,200)).rejects.toThrow(/TED neacceptat/);
   await expect(call('ted','https://ted.europa.eu/en/notice/1-2026/xml',null,200)).rejects.toThrow(/TED neacceptat/);
   expect((await q`select count(*)::int n from app.collection_requests`)[0]!.n).toBe(before);
   expect(await control()).toEqual({paused_streams:[],blocked_reason:null});
  }finally{
   vi.unstubAllEnvs();await q`update app.collection_proxy_control set enabled=false where id=1`;await q`truncate app.collection_proxies`;
   await rm(folder,{recursive:true,force:true});
  }
 });
});
