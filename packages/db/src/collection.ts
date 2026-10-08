import {proxyAdmission,recordProxyFailure} from './collection-proxies.js';
import type {SeapProxy} from './proxy-config.js';
import { CollectionTransportError, diagnosticError, sanitizeDiagnostics, type CollectionDiagnostics } from './collection-diagnostics.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { DbSql } from './client.js';
import { collectionTaskId, scheduleCollectionTimeout } from './collection-retry.js';
import { collectionQuietWindow } from './collection-quiet-window.js';
import { safeCollectionEndpoint, safeCollectionParameters, retryAfterSeconds, type CollectionStream } from './collection-policy.js';
export const COLLECTION_LOCK=[729114,4] as const;
const context=new AsyncLocalStorage<{stream:CollectionStream;context?:unknown}>();
export const withCollectionStream=<T>(stream:CollectionStream,work:()=>Promise<T>,metadata?:unknown)=>context.run({stream,context:metadata},work);
export const currentCollectionStream=()=>context.getStore()?.stream;
export const currentCollectionContext=()=>context.getStore()?.context;
export class CollectionProxyFailureError extends Error {constructor(message:string){super(message);this.name='CollectionProxyFailureError';}}
export class CollectionSuspendedError extends Error {constructor(message='Colectarea SEAP este oprită din administrare.'){super(message);this.name='CollectionSuspendedError';}}
export async function collectionHeartbeat(q:DbSql,id:string,kind:string,state:string){
 await q`insert into app.collection_workers(id,kind,state) values(${id},${kind},${state}) on conflict(id) do update set heartbeat_at=clock_timestamp(),state=excluded.state`;
}
export const collectionWorkerId=(kind:string)=>`${kind}:${process.pid}:${randomUUID().slice(0,8)}`;
export interface CollectionRequestInfo {stream:CollectionStream;worker:string;method:string;url:string;parameters?:unknown;fileDownload?:boolean;context?:unknown;proxyId?:string;documentJobId?:string}
export interface CollectionResult<T>{value:T;status:number;bytes?:number;records?:number;retryAfter?:string|null;challenge?:boolean;diagnostics?:CollectionDiagnostics}

/** Caller supplies a RESERVED physical DB session. Shared drain lock and exclusive request/IP locks span the full response body.
 * No lease expiry can admit a second live request. A broken session aborts transport;
 * an unfinished ledger entry stops future traffic until manually acknowledged. */
export async function runCollectionRequest<T>(q:DbSql,info:CollectionRequestInfo,work:(signal:AbortSignal,proxy:SeapProxy|null)=>Promise<CollectionResult<T>>,parentSignal?:AbortSignal):Promise<T>{
 const endpoint=safeCollectionEndpoint(info.url),parameters=safeCollectionParameters(info.parameters),taskId=collectionTaskId(info.context);
 let locked=false,requestLocked=false,proxyLocked=false,id:number|undefined,finished=false,selectedProxy:SeapProxy|null=null;
 let abortReason:string|null=null,transportDiagnostics:CollectionDiagnostics|undefined;
 const diagnostics=(error?:unknown)=>JSON.stringify(sanitizeDiagnostics({version:1,timeoutMs:45000,abortReason,context:info.context,...transportDiagnostics,...(error instanceof CollectionTransportError?error.diagnostics:{}),...(error!==undefined?{exception:diagnosticError(error)}:{})}));
 const controller=new AbortController();const abort=()=>{abortReason="parent_cancelled";controller.abort();};parentSignal?.addEventListener('abort',abort,{once:true});
 let heartbeat:ReturnType<typeof setInterval>|undefined,deadline:ReturnType<typeof setTimeout>|undefined;
 try{
  for(;;){
   parentSignal?.throwIfAborted();
   await collectionHeartbeat(q,info.worker,info.stream==='documents'?'documents':'ingestion','waiting');
   const [lock]=await q`select pg_try_advisory_lock_shared(${COLLECTION_LOCK[0]},${COLLECTION_LOCK[1]}) acquired,pg_backend_pid() pid`;
   if(!lock?.acquired){await sleep(2000,undefined,{signal:parentSignal});continue;}locked=true;
   await q`begin`;
   let delay=0,transaction=true;
   try{
    // Stable result shape across additive migrations while an old worker drains.
    const [c]=await q`select paused,maintenance,collection_during_maintenance,paused_streams,blocked_reason,daily_limit,min_seconds,max_seconds,
      extract(epoch from clock_timestamp())*1000 now_ms,extract(epoch from next_allowed_at)*1000 next_ms,extract(epoch from last_file_at)*1000 file_ms from app.collection_control where id=1 for update`;
    if(!c)throw new CollectionSuspendedError('Configurația colectării lipsește. Aplică migrațiile.');
    if(c.paused||(c.maintenance&&(!c.collection_during_maintenance||info.stream==='documents'))||(c.paused_streams as string[]).includes(info.stream))throw new CollectionSuspendedError();
    if(c.maintenance&&(await q`select id from app.processing_runs where status='running' limit 1`).length)throw new CollectionSuspendedError();
    if(c.blocked_reason)throw new CollectionSuspendedError(String(c.blocked_reason));
    const [retry]=await q`select x.task_id,x.retry_at>clock_timestamp() waiting,r.endpoint,r.method,r.parameters from app.collection_retries x join app.collection_requests r on r.id=x.last_request_id where x.status='pending' and (r.proxy_id is null or x.task_id=${taskId}) order by (r.proxy_id is null) desc,x.retry_at,x.task_id limit 1`;
    if(retry){
     if(Number(retry.task_id)!==taskId||retry.waiting)throw new CollectionSuspendedError('SEAP așteaptă reîncercarea programată după timeout.');
     const [same]=await q`select ${JSON.stringify(parameters)}::jsonb=${JSON.stringify(retry.parameters)}::jsonb matched`;
     if(retry.endpoint!==endpoint||retry.method!==info.method||!same?.matched)throw Error('Retry request identity differs from the timed-out query');
    }
    for(;;){
     const [orphan]=await q`select r.id from app.collection_requests r where outcome='running'
      and not exists(select 1 from pg_locks l where l.database=(select oid from pg_database where datname=current_database()) and l.locktype='advisory' and l.classid=729119::oid and l.objid=r.id::oid and l.objsubid=2 and l.granted) limit 1`;
     if(!orphan)break;
     // pg_locks is live, but the ledger scan uses a statement snapshot. A peer can
     // finish and unlock during that scan. Lock/re-read the candidate before
     // declaring it orphaned; a locked running row cannot finish and then unlock.
     const [candidate]=await q`select outcome from app.collection_requests where id=${orphan.id} for update`;
     const [owner]=await q`select exists(select 1 from pg_locks where database=(select oid from pg_database where datname=current_database()) and locktype='advisory' and classid=729119::oid and objid=${orphan.id}::oid and objsubid=2 and granted) present`;
     if(candidate?.outcome==='running'&&!owner?.present){await q`update app.collection_control set blocked_reason='O cerere a rămas fără rezultat după întreruperea unui worker. Verifică înainte de reluare.',blocked_until=clock_timestamp()+interval '120 seconds' where id=1`;await q`commit`;transaction=false;throw new CollectionSuspendedError('O cerere anterioară a fost întreruptă. Verifică jurnalul.');}
    }
    if(c.daily_limit!==null){const [n]=await q`select count(*)::int n from app.collection_requests where started_at >= ((clock_timestamp() at time zone 'Europe/Bucharest')::date::timestamp at time zone 'Europe/Bucharest')`;if(Number(n?.n)>=Number(c.daily_limit))throw new CollectionSuspendedError('Limita zilnică SEAP a fost atinsă.');}
    const admission=await proxyAdmission(q,info.proxyId,info.documentJobId);
    selectedProxy=admission?.proxy??null;
    const [inFlight]=await q`select count(*)::int n from pg_locks where database=(select oid from pg_database where datname=current_database()) and locktype='advisory' and classid=729119::oid and objsubid=2 and granted`;
    const concurrency=admission?Number(admission.settings.max_in_flight):1;
    delay=Math.max(Number(inFlight!.n)>=concurrency?1000:0,admission?.delay??0,Number(c.next_ms??0)-Number(c.now_ms),info.fileDownload?Number(c.file_ms??0)+60000-Number(c.now_ms):0);
    if(delay<=0){
     // Recheck after taking the control-row lock and on every rate-limit retry.
     // Suspension precedes the ledger: no HTTP attempt, error or manual-pause mutation.
     if((await collectionQuietWindow(q)).active)throw new CollectionSuspendedError('Pauză SEAP programată: 02:59–03:30, ora României. Reluare automată după încheierea pauzei.');
     const policy=admission?.settings??c;
     const jitter=Math.floor(Number(policy.min_seconds)+Math.random()*(Number(policy.max_seconds)-Number(policy.min_seconds)+1));
     const globalDelay=admission?60/Number(policy.requests_per_minute):jitter;
     const [request]=await q`insert into app.collection_requests(stream,worker,method,endpoint,parameters,proxy_id,started_at) values(${info.stream},${info.worker},${info.method},${endpoint},${JSON.stringify(parameters)}::jsonb,${selectedProxy?.id??null},clock_timestamp()) returning id`;
     id=Number(request!.id);
     // A unique session lock proves ownership; elapsed time alone never frees a live request.
     await q`select pg_advisory_lock(729119,${id}::int)`;requestLocked=true;
     if(selectedProxy){await q`select pg_advisory_lock(729120,${Number(selectedProxy.id.slice(6))})`;proxyLocked=true;}
     await q`update app.collection_control set next_allowed_at=clock_timestamp()+${globalDelay}*interval '1 second',last_file_at=case when ${!!info.fileDownload} then clock_timestamp() else last_file_at end where id=1`;
     if(selectedProxy)await q`update app.collection_proxies set next_allowed_at=clock_timestamp()+${jitter}*interval '1 second' where id=${selectedProxy.id}`;
    }
    await q`commit`;transaction=false;
   }catch(e){if(transaction)await q`rollback`.catch(()=>{});throw e;}
   if(id!==undefined){
    const pid=lock.pid;
    // Protect against postgres.js reconnecting onto a session without our lock.
    let checking=false,ticks=0;
    heartbeat=setInterval(()=>{if(checking)return;checking=true;void q`select pg_backend_pid() pid,exists(select 1 from pg_locks where pid=pg_backend_pid() and locktype='advisory' and classid=729119::oid and objid=${id!}::oid and objsubid=2 and granted) owns`.then(async r=>{if(r[0]?.pid!==pid||!r[0]?.owns){abortReason="lock_session_changed";controller.abort();}else if(++ticks%5===0)await collectionHeartbeat(q,info.worker,info.stream==='documents'?'documents':'ingestion','request');}).catch(()=>{abortReason="lock_connection_lost";controller.abort();}).finally(()=>checking=false);},1000);
    break;
   }
   await q`select pg_advisory_unlock_shared(${COLLECTION_LOCK[0]},${COLLECTION_LOCK[1]})`;locked=false;
   await sleep(Math.min(2000,Math.ceil(delay)),undefined,{signal:parentSignal});
  }
  controller.signal.throwIfAborted();deadline=setTimeout(()=>{abortReason="request_timeout";controller.abort();},45000);
  await collectionHeartbeat(q,info.worker,info.stream==='documents'?'documents':'ingestion','request');
  const result=await work(controller.signal,selectedProxy);transportDiagnostics=result.diagnostics;controller.signal.throwIfAborted();
  const failure=result.status<200||result.status>=300||!!result.challenge;
  const reason=result.challenge?'SEAP solicită o verificare suplimentară.':result.status===429?'SEAP a răspuns cu 429. Verifică limita înainte de reluare.':result.status===403?'SEAP a refuzat accesul (403).':null;
  if(reason){const after=retryAfterSeconds(result.retryAfter??null);await q`update app.collection_control set blocked_reason=${reason},blocked_until=case when ${after}::int is null then null else clock_timestamp()+${after}::int*interval '1 second' end where id=1`;}
  await q`update app.collection_requests set status=${result.status},outcome=${failure?'failed':'success'},bytes=${result.bytes??null},records=${result.records??null},error=${reason??(failure?`HTTP ${result.status}`:null)},diagnostics=${failure?diagnostics():JSON.stringify(sanitizeDiagnostics({...transportDiagnostics,response:transportDiagnostics?.response?{...(transportDiagnostics.response as object),body:undefined}:undefined,context:info.context}))}::jsonb,finished_at=clock_timestamp() where id=${id!}`;
  if(selectedProxy)await q`update app.collection_proxies set consecutive_failures=case when ${failure} then consecutive_failures else 0 end,last_error=${failure?(reason??`HTTP ${result.status}`):null} where id=${selectedProxy.id}`;
  finished=true;
  if(selectedProxy&&!result.challenge&&[407,408,500,502,503,504].includes(result.status)){
   await recordProxyFailure(q,selectedProxy.id);
   if(await scheduleCollectionTimeout(q,id!,taskId,true))throw new CollectionSuspendedError('Cererea va fi reîncercată; celelalte proxy-uri continuă.');
   throw new CollectionProxyFailureError('Cerere prin proxy eșuată; celelalte proxy-uri continuă.');
  }
  if(failure&&taskId!==null)await q`update app.collection_retries set status='stopped',retry_at=null,updated_at=clock_timestamp() where task_id=${taskId} and status='pending'`;
  if(reason)throw new CollectionSuspendedError(reason);
  return result.value;
 }catch(error){
  if(id!==undefined&&!finished){
   if(selectedProxy)await q`update app.collection_proxies set last_error='Eroare de transport; verifică jurnalul.' where id=${selectedProxy.id}`;
   const response=(error instanceof CollectionTransportError?error.diagnostics.response:transportDiagnostics?.response) as {status?:number;receivedBytes?:number}|undefined;
   const scoped=selectedProxy&&(abortReason==='request_timeout'||(!abortReason&&error instanceof CollectionTransportError&&error.diagnostics.retryableProxyTransport===true))&&(!response?.status||(response.status>=200&&response.status<300)||[407,408,500,502,503,504].includes(response.status));
   if(!scoped&&abortReason!=='request_timeout')await q`update app.collection_control set blocked_reason=coalesce(blocked_reason,'Eroare de transport. Verifică jurnalul înainte de reluare.'),blocked_until=case when blocked_reason is null then clock_timestamp()+interval '120 seconds' else blocked_until end where id=1`;
   // Keep every attempt and its diagnostics before considering replay.
   await q`update app.collection_requests set outcome='failed',status=coalesce(status,${response?.status??null}),bytes=coalesce(bytes,${response?.receivedBytes??null}),error=${abortReason==='request_timeout'?'Timeout după 45 de secunde.':'Cerere întreruptă, răspuns nevalid sau eroare de transport. Fără reîncercare automată.'},diagnostics=${diagnostics(error)}::jsonb,finished_at=clock_timestamp() where id=${id}`;

   if(scoped){
    await recordProxyFailure(q,selectedProxy!.id);
    if(await scheduleCollectionTimeout(q,id,taskId,true))throw new CollectionSuspendedError('Cererea va fi reîncercată; celelalte proxy-uri continuă.');
    throw new CollectionProxyFailureError('Cerere prin proxy eșuată; celelalte proxy-uri continuă.');
   }
   if(abortReason==='request_timeout'&&await scheduleCollectionTimeout(q,id,taskId))throw new CollectionSuspendedError('Timeout SEAP. Reîncercarea a fost programată.');
   if(taskId!==null)await q`update app.collection_retries set status='stopped',retry_at=null,updated_at=clock_timestamp() where task_id=${taskId} and status='pending'`;
   await q`update app.collection_control set blocked_reason=coalesce(blocked_reason,'Eroare de transport. Verifică jurnalul înainte de reluare.'),blocked_until=case when blocked_reason is null then clock_timestamp()+interval '120 seconds' else blocked_until end where id=1`;
  }
  throw error;
 }finally{
  if(deadline)clearTimeout(deadline);if(heartbeat)clearInterval(heartbeat);controller.abort();parentSignal?.removeEventListener('abort',abort);
  if(proxyLocked&&selectedProxy)await q`select pg_advisory_unlock(729120,${Number(selectedProxy.id.slice(6))})`.catch(()=>{});
  if(requestLocked)await q`select pg_advisory_unlock(729119,${id!}::int)`.catch(()=>{});
  if(locked)await q`select pg_advisory_unlock_shared(${COLLECTION_LOCK[0]},${COLLECTION_LOCK[1]})`.catch(()=>{});
 }
}
