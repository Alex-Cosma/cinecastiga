import {collectionHeartbeat,collectionQuietWindow,collectionWorkerId,CollectionSuspendedError,type DbSql} from '@seap/db';
import {setTimeout as sleep} from 'node:timers/promises';
import {DocumentYield,DocumentFormatError} from './errors';
import {DOCUMENT_LOCK,runDocumentJob} from './worker';
import {classifyDocumentBatch} from './classify';
import {DOCUMENT_NOTICE_TYPES,NOTICE_VIEWS} from './shared';

// No source traffic: discover the participation notices that awarded contracts, matched like the contract
// page (same procedure and buyer, or an explicit source link), newest first. Returns how many it added.
export async function seedDocumentInventory(q:DbSql){
 const types=DOCUMENT_NOTICE_TYPES,views=types.map(t=>NOTICE_VIEWS[t]!);
 const rows=await q`insert into app.document_notices(key,notice_id,notice_type,notice_no,title,url,automatic,source_date)
  select n.sys_notice_type_id||':'||n.c_notice_id,n.c_notice_id::text,n.sys_notice_type_id,n.notice_no,coalesce(n.title,n.notice_no),
   'https://www.e-licitatie.ro/pub/notices/'||v.view||'/v2/view/'||n.c_notice_id,true,n.state_date
  from core.notices n join unnest(${types}::int[],${views}::text[]) v(type,view) on v.type=n.sys_notice_type_id
  left join app.document_notices d on d.key=n.sys_notice_type_id||':'||n.c_notice_id
  where n.c_notice_id>0 and n.notice_no is not null and (n.sys_notice_type_id<>17 or n.notice_namespace='rfq') and (d.key is null or not d.automatic)
   and (exists(select 1 from core.awards a where a.procedure_id=n.procedure_id and a.authority_entity_id=n.authority_entity_id)
    or exists(select 1 from core.notice_award_sources l join core.awards a on a.ca_notice_id=l.ca_notice_id
     where l.c_notice_id=n.c_notice_id and l.notice_namespace=n.notice_namespace and a.authority_entity_id=n.authority_entity_id))
  order by n.state_date desc nulls last,n.c_notice_id desc limit 1000
  on conflict(key) do update set automatic=true,source_date=excluded.source_date returning key`;
 await q`update app.document_collection_control set scanned_at=now(),error=null where id=1`;
 return rows.length;
}
/** No source traffic: the awards whose collected detail counts attached documents (ackDocsCount > 0), found by
 * walking the details in the order they were collected (0093). A detail collected again with more documents than
 * the award's list holds sends that list back to be read. Returns how many details it examined. */
export async function seedAwardInventory(q:DbSql,batch=2000){
 const [c]=await q`select coalesce(award_scanned_at::text,'-infinity') at,coalesce(award_scanned_id,0)::text id from app.document_collection_control where id=1`;
 const rows=await q`select r.id::text id,r.fetched_at::text at,split_part(r.external_id,':',2) ca,(r.payload#>>'{data,ackDocsCount}')::int n
  from raw.raw_documents r where r.source='elicitatie' and r.fetched_at>=${c!.at}::timestamptz and (r.fetched_at>${c!.at}::timestamptz or r.id>${c!.id}::bigint)
   and r.endpoint_version='award-detail-root:v2' and r.external_id ~ '^award:[0-9]+$'
  order by r.fetched_at,r.id limit ${batch}`;
 if(!rows.length)return 0;
 const found=rows.filter(r=>Number(r.n)>0),cas=found.map(r=>r.ca),counts=found.map(r=>Number(r.n));
 if(found.length){
  await q`update app.document_notices n set checked_at=null from unnest(${cas}::text[],${counts}::int[]) d(ca,n) where n.key='ack:'||d.ca and n.checked_at is not null and coalesce(n.total,0)<d.n`;
  await q`insert into app.document_notices(key,notice_id,notice_type,notice_no,title,url,automatic,source_date)
   select 'ack:'||a.ca_notice_id,a.ca_notice_id::text,3,a.notice_no,coalesce(a.title,a.notice_no),'https://www.e-licitatie.ro/pub/notices/ca-notices/view-c/'||a.ca_notice_id,true,a.state_date
   from unnest(${cas}::bigint[]) d(ca) join core.awards a on a.ca_notice_id=d.ca where a.notice_no ~ '^CAN[0-9]+$'
   on conflict(key) do update set automatic=true,source_date=excluded.source_date`;
 }
 const last=rows.at(-1)!;
 await q`update app.document_collection_control set award_scanned_at=${last.at}::timestamptz,award_scanned_id=${last.id}::bigint where id=1`;
 return rows.length;
}
/** downloads: whether identified specifications are downloaded automatically (an operator setting, off by default). */
/** frontier: queued and running automatic lists kept ahead of the lanes (twice the network lanes, at least 40). */
export async function fillDocumentQueue(q:DbSql,downloads=true,frontier=40){
 // Park automatic downloads (all of them while automatic downloads are off, otherwise those of files that are
 // not specifications) without losing their request history. Requests and processing of archived originals remain.
 await q`update app.document_jobs j set stage='specifications_only' from app.procurement_documents d
  where j.document_id=d.id and j.automatic and j.kind='file' and j.status='queued'
   and d.original_hash is null and (d.priority<>0 or not ${downloads}) and j.stage<>'specifications_only'`;
 await q`update app.document_jobs j set stage=case when d.original_hash is null then 'queued' else 'process_queued' end from app.procurement_documents d
  where j.document_id=d.id and j.automatic and j.status='queued' and j.stage='specifications_only'
   and ((d.priority=0 and ${downloads}) or d.original_hash is not null)`;
 // Bounded materialization: discovery continues throughout the history without a giant job INSERT.
 await q`insert into app.document_jobs(notice_key,kind,dedup_key,requested_by,automatic)
  select n.key,'list','list:'||n.key,'system:document-collection',true from app.document_notices n
  where n.automatic and (n.checked_at is null or n.inventory<2) and not exists(select 1 from app.document_jobs j where j.notice_key=n.key and j.kind='list' and j.automatic
   and (j.status in ('queued','running') or j.created_at>coalesce(n.checked_at,'-infinity'::timestamptz)))
  order by n.source_date desc nulls last,n.key desc limit greatest(0,${frontier}-(select count(*)::int from app.document_jobs where automatic and kind='list' and status in ('queued','running'))) on conflict(dedup_key) where status in ('queued','running') do nothing`;
 // Keep a separate bounded frontier for specifications, so forty older queued
 // archived ordinary files cannot prevent a newly discovered specification entering.
 for(const specifications of [true,false])await q`insert into app.document_jobs(notice_key,document_id,kind,dedup_key,requested_by,automatic,stage)
  select n.key,d.id,'file','file:'||d.id,'system:document-collection',true,case when d.original_hash is null then 'queued' else 'process_queued' end
  from app.procurement_documents d join app.document_notices n on n.key=d.notice_key
  where n.automatic and d.processed_at is null and (d.priority=0)=${specifications} and ((d.priority=0 and ${downloads}) or d.original_hash is not null) and d.filename ~* '[.](pdf|p7[sm]|docx?|xlsx?|zip|rar|7z)$'
   and not exists(select 1 from app.document_jobs j where j.document_id=d.id and j.automatic)
  order by n.source_date desc nulls last,d.published_at desc nulls last,d.id limit greatest(0,40-(select count(*)::int from app.document_jobs j join app.procurement_documents f on f.id=j.document_id where j.automatic and j.kind='file' and j.status in ('queued','running') and (f.priority=0)=${specifications} and (f.priority=0 or f.original_hash is not null)))
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
  if(error instanceof DocumentYield){await q`update app.document_jobs set status='queued',stage='process_queued',retry_at=now()+interval '1 second',error=null,attempts=0 where id=${job.id}`;return;}
  const suspended=signal.aborted||error instanceof CollectionSuspendedError;
  const attempts=Number(job.attempts)+(suspended?0:1),retry=suspended||!(error instanceof DocumentFormatError)&&job.automatic&&attempts<3;
  const [archived]=await q`select original_hash from app.procurement_documents where id=${job.document_id??null}`;
  const message=error instanceof Error&&/^(SEAP|Lista|Identitatea|Documentul|Anunțul|Originalul|Procesarea|Formatul|Pagina|Răspuns|Modul|Adresă)/.test(error.message)?error.message:archived?.original_hash?'Operațiunea a fost întreruptă. Originalul păstrat poate fi reutilizat.':'Operațiunea s-a întrerupt înainte de arhivarea fișierului.';
  await q`update app.document_jobs set status=${retry?'queued':'failed'},stage=case when ${!retry} then 'failed' when kind='file' and exists(select 1 from app.procurement_documents d where d.id=document_id and d.original_hash is not null) then 'process_queued' else 'queued' end,
   attempts=${attempts},error=${message.slice(0,500)},retry_at=case when ${retry} then now()+${suspended?15:attempts===1?300:600}*interval '1 second' else null end,finished_at=case when ${retry} then null else now() end where id=${job.id}`;
 }finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}
}

/** One supervisor, up to a hundred network lanes (slots 1-100) and four extraction lanes (0, 101-103).
 * Durable jobs survive restart. Manual requests take processing slot zero first and retain their source admission policy.
 * A network lane holds a proxy for its job but no database connection while it waits on that proxy's spacing:
 * it runs on the pool, and the gate takes a connection per request. Extraction lanes keep a reserved one. */
export const NETWORK_LANES=100,PROCESSING_SLOTS=[0,101,102,103];
/** Proxies left to the data streams: twenty always, half the pool while they are collecting. */
export function documentLaneCap(lanes:number,proxies:number,dataActive:boolean){
 return Math.max(0,Math.min(lanes,NETWORK_LANES,dataActive?Math.floor(proxies/2):proxies-20));
}
export async function runAutomaticCollector(sql:DbSql,shutdown:AbortSignal,work=runDocumentJob){
 const [enabled]=await sql`select enabled from app.document_collection_control where id=1`;
 if(!enabled?.enabled)return false;
 const owner=await sql.reserve(),q=owner as unknown as DbSql,stop=new AbortController(),abort=()=>stop.abort();
 shutdown.addEventListener('abort',abort,{once:true});if(shutdown.aborted)abort();
 const lanes=new Map<number,Promise<void>>();let locked=false,nextInventory=0,nextAwards=0,nextQueue=0,nextClassification=0;
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
   if(Date.now()>=nextClassification){await classifyDocumentBatch(sql);nextClassification=Date.now()+3000;}
   const automatic=state.enabled&&!state.paused,source=!state.source_paused&&!state.blocked_reason&&!state.paused_streams.includes('documents')&&!(await collectionQuietWindow(q)).active;
   // Once every awarded procedure is seeded, look again every ten minutes (new awards arrive nightly).
   if(automatic&&Date.now()>=nextInventory){const added=await seedDocumentInventory(q);nextInventory=Date.now()+(added?10000:600000);}
   if(automatic&&Date.now()>=nextAwards){const examined=await seedAwardInventory(q);nextAwards=Date.now()+(examined?10000:600000);}
   if(automatic&&Date.now()>=nextQueue){await fillDocumentQueue(q,!!state.automatic_downloads,Math.max(40,2*Number(state.download_concurrency)));nextQueue=Date.now()+3000;}
   const [manual]=await q`select exists(select 1 from app.document_jobs where not automatic and batch_id is null and status='queued' and (retry_at is null or retry_at<=now())) waiting`;
   const [pool]=await q`select (select count(*)::int from app.collection_proxies where configured and enabled) proxies,
    exists(select 1 from app.collection_requests where stream<>'documents' and started_at>now()-interval '2 minutes') data_active`;
   const networkLanes=documentLaneCap(Number(state.download_concurrency),Number(pool?.proxies??0),!!pool?.data_active);
   for(const slot of [...PROCESSING_SLOTS.slice(0,Number(state.processing_concurrency)),...Array.from({length:Math.min(NETWORK_LANES,Number(state.download_concurrency))},(_,i)=>i+1)]){
    if(lanes.has(slot))continue;
    const processing=slot===0||slot>NETWORK_LANES;
    const networkBusy=[...lanes.keys()].filter(s=>s>=1&&s<=NETWORK_LANES).length;
    // While someone's request waits, one network lane is kept for it: automatic work takes the others.
    const requestsOnly=!processing&&networkBusy>=networkLanes-(source&&manual?.waiting?1:0);
    if(!processing&&(networkBusy>=Math.max(1,networkLanes)||!source||!state.proxy_enabled))continue;
    const session=processing?await sql.reserve():null,db=(session??sql) as unknown as DbSql;
    let job:Record<string,any>|undefined;
    try{[job]=await db`update app.document_jobs set status='running',slot=${slot},started_at=coalesce(started_at,now()) where id=(
     select j.id from app.document_jobs j join app.document_notices n on n.key=j.notice_key left join app.procurement_documents d on d.id=j.document_id
     where j.status='queued' and j.batch_id is null and (j.retry_at is null or j.retry_at<=now()) and (
      -- Requests made by anyone come first, on every lane: lists and downloads on the network lanes, preparation on the processing lanes.
      (not j.automatic and ((${!processing} and (j.kind='list' or d.original_hash is null)) or (${processing} and j.kind='file' and d.original_hash is not null)))
      or (${automatic&&!requestsOnly} and j.automatic and ((${processing} and j.kind='file' and d.original_hash is not null)
       or (${!processing&&source&&state.proxy_enabled} and (j.kind='list' or (${!!state.automatic_downloads} and d.original_hash is null and d.priority=0)))))
     ) order by j.automatic,case when j.kind='list' then case when ${slot===Math.min(NETWORK_LANES,Number(state.download_concurrency))} then -1 else 1 end else 0 end,coalesce(d.priority,100),n.source_date desc nulls last,j.created_at,j.id limit 1 for update of j skip locked
    ) and status='queued' returning *`;}catch(error){session?.release();throw error;}
    if(!job){session?.release();continue;}
    const task=runAutomaticJob(db,job,processing?'process':'download',stop.signal,work)
     .catch(async()=>{stop.abort();await sql`update app.document_collection_control set error='Workerul s-a întrerupt; reluarea păstrează originalele.' where id=1`;})
     .finally(()=>{session?.release();lanes.delete(slot);});lanes.set(slot,task);
   }
   await sleep(1000,undefined,{signal:stop.signal});
  }
  return true;
 }catch(error){if(!stop.signal.aborted){await sql`update app.document_collection_control set error='Colectarea documentelor întâmpină o problemă. Workerul va reîncerca fără să elimine progresul.' where id=1`;throw error;}return true;}
 finally{stop.abort();await Promise.allSettled(lanes.values());shutdown.removeEventListener('abort',abort);if(locked)await q`select pg_advisory_unlock(${DOCUMENT_LOCK[0]},${DOCUMENT_LOCK[1]})`.catch(()=>{});owner.release();}
}
