import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { DbSql } from './client.js';
import { safeCollectionEndpoint, safeCollectionParameters, retryAfterSeconds, type CollectionStream } from './collection-policy.js';
export const COLLECTION_LOCK=[729114,4] as const;
const context=new AsyncLocalStorage<CollectionStream>();
export const withCollectionStream=<T>(stream:CollectionStream,work:()=>Promise<T>)=>context.run(stream,work);
export const currentCollectionStream=()=>context.getStore();
export class CollectionSuspendedError extends Error {constructor(message='Colectarea SEAP este oprită din administrare.'){super(message);this.name='CollectionSuspendedError';}}
export async function collectionHeartbeat(q:DbSql,id:string,kind:string,state:string){
 await q`insert into app.collection_workers(id,kind,state) values(${id},${kind},${state}) on conflict(id) do update set heartbeat_at=clock_timestamp(),state=excluded.state`;
}
export const collectionWorkerId=(kind:string)=>`${kind}:${process.pid}:${randomUUID().slice(0,8)}`;
export interface CollectionRequestInfo {stream:CollectionStream;worker:string;method:string;url:string;parameters?:unknown;fileDownload?:boolean}
export interface CollectionResult<T>{value:T;status:number;bytes?:number;records?:number;retryAfter?:string|null;challenge?:boolean}

/** Caller supplies a RESERVED physical DB session. Lock spans the full response body.
 * No lease expiry can admit a second live request. A broken session aborts transport;
 * an unfinished ledger entry stops future traffic until manually acknowledged. */
export async function runCollectionRequest<T>(q:DbSql,info:CollectionRequestInfo,work:(signal:AbortSignal)=>Promise<CollectionResult<T>>,parentSignal?:AbortSignal):Promise<T>{
 const endpoint=safeCollectionEndpoint(info.url),parameters=safeCollectionParameters(info.parameters);
 let locked=false,id:number|undefined,finished=false;
 const controller=new AbortController();const abort=()=>controller.abort();parentSignal?.addEventListener('abort',abort,{once:true});
 let heartbeat:ReturnType<typeof setInterval>|undefined,deadline:ReturnType<typeof setTimeout>|undefined;
 try{
  for(;;){
   parentSignal?.throwIfAborted();
   await collectionHeartbeat(q,info.worker,info.stream==='documents'?'documents':'ingestion','waiting');
   const [lock]=await q`select pg_try_advisory_lock(${COLLECTION_LOCK[0]},${COLLECTION_LOCK[1]}) acquired,pg_backend_pid() pid`;
   if(!lock?.acquired){await sleep(2000,undefined,{signal:parentSignal});continue;}locked=true;
   await q`begin`;
   let delay=0,transaction=true;
   try{
    const [c]=await q`select *,extract(epoch from clock_timestamp())*1000 now_ms,extract(epoch from next_allowed_at)*1000 next_ms,extract(epoch from last_file_at)*1000 file_ms from app.collection_control where id=1 for update`;
    if(!c)throw new CollectionSuspendedError('Configurația colectării lipsește. Aplică migrațiile.');
    if(c.paused||c.maintenance||(c.paused_streams as string[]).includes(info.stream))throw new CollectionSuspendedError();
    if(c.blocked_reason)throw new CollectionSuspendedError(String(c.blocked_reason));
    const [orphan]=await q`select id from app.collection_requests where outcome='running' limit 1`;
    if(orphan){await q`update app.collection_control set blocked_reason='O cerere a rămas fără rezultat după întreruperea unui worker. Verifică înainte de reluare.',blocked_until=clock_timestamp()+interval '120 seconds' where id=1`;await q`commit`;transaction=false;throw new CollectionSuspendedError('O cerere anterioară a fost întreruptă. Verifică jurnalul.');}
    if(c.daily_limit!==null){const [n]=await q`select count(*)::int n from app.collection_requests where started_at >= ((clock_timestamp() at time zone 'Europe/Bucharest')::date::timestamp at time zone 'Europe/Bucharest')`;if(Number(n?.n)>=Number(c.daily_limit))throw new CollectionSuspendedError('Limita zilnică SEAP a fost atinsă.');}
    delay=Math.max(0,Number(c.next_ms??0)-Number(c.now_ms),info.fileDownload?Number(c.file_ms??0)+60000-Number(c.now_ms):0);
    if(delay<=0){
     const jitter=Math.floor(Number(c.min_seconds)+Math.random()*(Number(c.max_seconds)-Number(c.min_seconds)+1));
     const [request]=await q`insert into app.collection_requests(stream,worker,method,endpoint,parameters) values(${info.stream},${info.worker},${info.method},${endpoint},${JSON.stringify(parameters)}::jsonb) returning id`;
     id=Number(request!.id);
     await q`update app.collection_control set next_allowed_at=clock_timestamp()+${jitter}*interval '1 second',last_file_at=case when ${!!info.fileDownload} then clock_timestamp() else last_file_at end where id=1`;
    }
    await q`commit`;transaction=false;
   }catch(e){if(transaction)await q`rollback`.catch(()=>{});throw e;}
   if(id!==undefined){
    const pid=lock.pid;
    // Protect against postgres.js reconnecting onto a session without our lock.
    let checking=false,ticks=0;
    heartbeat=setInterval(()=>{if(checking)return;checking=true;void q`select pg_backend_pid() pid`.then(async r=>{if(r[0]?.pid!==pid)controller.abort();else if(++ticks%5===0)await collectionHeartbeat(q,info.worker,info.stream==='documents'?'documents':'ingestion','request');}).catch(()=>controller.abort()).finally(()=>checking=false);},1000);
    break;
   }
   await q`select pg_advisory_unlock(${COLLECTION_LOCK[0]},${COLLECTION_LOCK[1]})`;locked=false;
   await sleep(Math.min(2000,Math.ceil(delay)),undefined,{signal:parentSignal});
  }
  controller.signal.throwIfAborted();deadline=setTimeout(()=>controller.abort(),45000);
  await collectionHeartbeat(q,info.worker,info.stream==='documents'?'documents':'ingestion','request');
  const result=await work(controller.signal);controller.signal.throwIfAborted();
  const failure=result.status<200||result.status>=300||!!result.challenge;
  const reason=result.challenge?'SEAP solicită o verificare suplimentară.':result.status===429?'SEAP a răspuns cu 429. Verifică limita înainte de reluare.':result.status===403?'SEAP a refuzat accesul (403).':null;
  await q`update app.collection_requests set status=${result.status},outcome=${failure?'failed':'success'},bytes=${result.bytes??null},records=${result.records??null},error=${reason??(failure?`HTTP ${result.status}`:null)},finished_at=clock_timestamp() where id=${id!}`;
  finished=true;
  if(reason){const after=retryAfterSeconds(result.retryAfter??null);await q`update app.collection_control set blocked_reason=${reason},blocked_until=case when ${after}::int is null then null else clock_timestamp()+${after}::int*interval '1 second' end where id=1`;throw new CollectionSuspendedError(reason);}
  return result.value;
 }catch(error){
  if(id!==undefined&&!finished){await q`update app.collection_requests set outcome='failed',error='Cerere întreruptă, răspuns nevalid sau eroare de transport. Fără reîncercare automată.',finished_at=clock_timestamp() where id=${id}`.catch(()=>{});await q`update app.collection_control set blocked_reason='Eroare de transport. Verifică jurnalul înainte de reluare.',blocked_until=clock_timestamp()+interval '120 seconds' where id=1`.catch(()=>{});}
  throw error;
 }finally{
  if(deadline)clearTimeout(deadline);if(heartbeat)clearInterval(heartbeat);controller.abort();parentSignal?.removeEventListener('abort',abort);
  if(locked)await q`select pg_advisory_unlock(${COLLECTION_LOCK[0]},${COLLECTION_LOCK[1]})`.catch(()=>{});
 }
}
