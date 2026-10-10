import {collectionHeartbeat,collectionQuietWindow,collectionWorkerId,CollectionSuspendedError,type DbSql} from '@seap/db';
import {setTimeout as sleep} from 'node:timers/promises';
import {DOCUMENT_LOCK,runDocumentJob} from './worker';

// No source traffic: discover already normalized, namespace-verified source notices.
export async function seedDocumentInventory(q:DbSql){
 await q`insert into app.document_notices(key,notice_id,notice_type,notice_no,title,url,automatic,source_date)
  select '17:'||n.c_notice_id,n.c_notice_id::text,17,n.notice_no,coalesce(n.title,n.notice_no),
   'https://www.e-licitatie.ro/pub/notices/simplified-notice/v2/view/'||n.c_notice_id,true,n.state_date
  from core.notices n left join app.document_notices d on d.key='17:'||n.c_notice_id
  where n.sys_notice_type_id=17 and n.notice_namespace='rfq' and n.c_notice_id>0 and n.notice_no is not null and (d.key is null or not d.automatic)
  order by n.state_date desc nulls last,n.c_notice_id desc limit 1000
  on conflict(key) do update set automatic=true,source_date=excluded.source_date`;
 await q`update app.document_collection_control set scanned_at=now(),error=null where id=1`;
}
export async function fillDocumentQueue(q:DbSql){
 // Bounded materialization: discovery continues throughout the history without a giant job INSERT.
 await q`insert into app.document_jobs(notice_key,kind,dedup_key,requested_by,automatic)
  select n.key,'list','list:'||n.key,'system:document-collection',true from app.document_notices n
  where n.automatic and n.checked_at is null and not exists(select 1 from app.document_jobs j where j.notice_key=n.key and j.kind='list' and j.automatic)
  order by n.source_date desc nulls last,n.key desc limit greatest(0,40-(select count(*)::int from app.document_jobs where automatic and kind='list' and status in ('queued','running'))) on conflict(dedup_key) where status in ('queued','running') do nothing`;
 await q`insert into app.document_jobs(notice_key,document_id,kind,dedup_key,requested_by,automatic,stage)
  select n.key,d.id,'file','file:'||d.id,'system:document-collection',true,case when d.original_hash is null then 'queued' else 'process_queued' end
  from app.procurement_documents d join app.document_notices n on n.key=d.notice_key
  where n.automatic and d.processed_at is null and d.filename ~* '[.](pdf|p7s)$'
   and not exists(select 1 from app.document_jobs j where j.document_id=d.id and j.automatic)
  order by n.source_date desc nulls last,d.published_at desc nulls last,d.id limit greatest(0,40-(select count(*)::int from app.document_jobs where automatic and kind='file' and status in ('queued','running')))
  on conflict(dedup_key) where status in ('queued','running') do nothing`;
}

export async function recoverAutomaticJobs(q:DbSql){
 // Caller owns the supervisor lock. HTTP/tool children of a killed process have bounded lifetimes.
 const rows=await q`update app.document_jobs set status='queued',stage=case when kind='file' and exists(select 1 from app.procurement_documents d where d.id=document_id and d.original_hash is not null) then 'process_queued' else 'queued' end,
  retry_at=now()+interval '120 seconds',error='Reluare după repornirea workerului; originalele salvate se păstrează.'
  where automatic and status='running' returning id`;
 return rows.length;
}

export async function runAutomaticJob(q:DbSql,job:Record<string,any>,phase:'download'|'process'|'all',signal:AbortSignal,work=runDocumentJob){
 const stop=new AbortController(),cancel=()=>stop.abort();signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
 const timer=setTimeout(cancel,20*60*1000);
 try{
  await work(q,job,stop.signal,undefined,phase);stop.signal.throwIfAborted();
  const next=phase==='download'&&job.kind==='file';
  await q`update app.document_jobs set status=${next?'queued':'complete'},stage=${next?'process_queued':'complete'},attempts=0,retry_at=null,error=null,finished_at=case when ${next} then null else now() end where id=${job.id}`;
 }catch(error){
  const suspended=signal.aborted||error instanceof CollectionSuspendedError;
  const attempts=Number(job.attempts)+(suspended?0:1),retry=suspended||job.automatic&&attempts<3;
  const message=error instanceof Error&&/^(SEAP|Lista|Identitatea|Documentul|Anunțul|Originalul|Procesarea|Formatul|Pagina|Răspuns|Modul|Adresă)/.test(error.message)?error.message:'Operațiunea a fost întreruptă. Originalul păstrat poate fi reutilizat.';
  await q`update app.document_jobs set status=${retry?'queued':'failed'},stage=case when ${!retry} then 'failed' when kind='file' and exists(select 1 from app.procurement_documents d where d.id=document_id and d.original_hash is not null) then 'process_queued' else 'queued' end,
   attempts=${attempts},error=${message.slice(0,500)},retry_at=case when ${retry} then now()+${suspended?15:attempts===1?300:600}*interval '1 second' else null end,finished_at=case when ${retry} then null else now() end where id=${job.id}`;
 }finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}
}

/** One supervisor, ten network lanes and four extraction lanes. Durable jobs survive restart.
 * Manual requests take processing slot zero first and retain their source admission policy. */
export async function runAutomaticCollector(sql:DbSql,shutdown:AbortSignal,work=runDocumentJob){
 const [enabled]=await sql`select enabled from app.document_collection_control where id=1`;
 if(!enabled?.enabled)return false;
 const owner=await sql.reserve(),q=owner as unknown as DbSql,stop=new AbortController(),abort=()=>stop.abort();
 shutdown.addEventListener('abort',abort,{once:true});if(shutdown.aborted)abort();
 const lanes=new Map<number,Promise<void>>();let locked=false,nextInventory=0,nextQueue=0,manualRunning=false;
 const worker=collectionWorkerId('document-collection');
 try{
  const [lock]=await q`select pg_try_advisory_lock(${DOCUMENT_LOCK[0]},${DOCUMENT_LOCK[1]}) acquired,pg_backend_pid() pid`;
  if(!lock?.acquired)return false;locked=true;
  if((await q`select id from app.document_jobs where batch_id is not null and status='running' limit 1`).length)return false;
  const recovered=await recoverAutomaticJobs(q);
  const manual=await q`update app.document_jobs set status='queued',retry_at=now()+interval '120 seconds',error='Reluare după repornirea workerului.' where not automatic and batch_id is null and status='running' returning id`;
  if(recovered||manual.length)await sleep(120000,undefined,{signal:stop.signal});
  while(!stop.signal.aborted){
   const [state]=await q`select c.*,s.paused source_paused,s.maintenance,s.blocked_reason,s.paused_streams,p.enabled proxy_enabled,pg_backend_pid() pid
    from app.document_collection_control c cross join app.collection_control s cross join app.collection_proxy_control p where c.id=1 and s.id=1 and p.id=1`;
   if(!state||state.pid!==lock.pid)throw Error('Document supervisor lost its database session.');
   await collectionHeartbeat(q,worker,'documents',state.paused?'paused':'automatic');
   await q`update app.document_collection_control set heartbeat_at=now() where id=1`;
   if(state.maintenance){if(lanes.size)stop.abort();else await sleep(1000,undefined,{signal:stop.signal});continue;}
   const automatic=state.enabled&&!state.paused,source=!state.source_paused&&!state.blocked_reason&&!state.paused_streams.includes('documents')&&!(await collectionQuietWindow(q)).active;
   if(automatic&&Date.now()>=nextInventory){await seedDocumentInventory(q);nextInventory=Date.now()+10000;}
   if(automatic&&Date.now()>=nextQueue){await fillDocumentQueue(q);nextQueue=Date.now()+3000;}
   const [manual]=await q`select exists(select 1 from app.document_jobs where not automatic and batch_id is null and status='queued' and (retry_at is null or retry_at<=now())) waiting`;
   for(const slot of [...[0,11,12,13].slice(0,Number(state.processing_concurrency)),...Array.from({length:Number(state.download_concurrency)},(_,i)=>i+1)]){
    if(lanes.has(slot))continue;
    const processing=slot===0||slot>10;
    const networkBusy=[...lanes.keys()].filter(s=>s>=1&&s<=10).length;
    if(!processing&&networkBusy>=Number(state.download_concurrency)-(manualRunning||source&&manual?.waiting?1:0))continue;
    if(!automatic&&slot!==0||!processing&&(!source||!state.proxy_enabled))continue;
    const session=await sql.reserve(),db=session as unknown as DbSql;
    let job:Record<string,any>|undefined;
    try{[job]=await db`update app.document_jobs set status='running',slot=${slot},started_at=coalesce(started_at,now()) where id=(
     select j.id from app.document_jobs j join app.document_notices n on n.key=j.notice_key left join app.procurement_documents d on d.id=j.document_id
     where j.status='queued' and j.batch_id is null and (j.retry_at is null or j.retry_at<=now()) and (
      (${slot===0&&source&&networkBusy<Number(state.download_concurrency)} and not j.automatic)
      or (${automatic} and j.automatic and ((${processing} and j.kind='file' and d.original_hash is not null)
       or (${!processing&&source&&state.proxy_enabled} and (j.kind='list' or d.original_hash is null))))
     ) order by j.automatic,case when j.kind='file' then 0 else 1 end,n.source_date desc nulls last,j.created_at,j.id limit 1 for update of j skip locked
    ) and status='queued' returning *`;}catch(error){session.release();throw error;}
    if(!job){session.release();continue;}
    if(!job.automatic)manualRunning=true;
    const isManual=!job.automatic;
    const task=runAutomaticJob(db,job,job.automatic?(processing?'process':'download'):'all',stop.signal,work)
     .catch(async()=>{stop.abort();await sql`update app.document_collection_control set error='Workerul s-a întrerupt; reluarea păstrează originalele.' where id=1`;})
     .finally(()=>{session.release();lanes.delete(slot);if(isManual)manualRunning=false;});lanes.set(slot,task);
   }
   await sleep(1000,undefined,{signal:stop.signal});
  }
  return true;
 }catch(error){if(!stop.signal.aborted){await sql`update app.document_collection_control set error='Colectarea documentelor întâmpină o problemă. Workerul va reîncerca fără să elimine progresul.' where id=1`;throw error;}return true;}
 finally{stop.abort();await Promise.allSettled(lanes.values());shutdown.removeEventListener('abort',abort);if(locked)await q`select pg_advisory_unlock(${DOCUMENT_LOCK[0]},${DOCUMENT_LOCK[1]})`.catch(()=>{});owner.release();}
}
