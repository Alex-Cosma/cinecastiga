import {collectionHeartbeat,collectionWorkerId,type DbSql} from '@seap/db';
import {setTimeout as sleep} from 'node:timers/promises';
import {DOCUMENT_LOCK,runDocumentJob} from './worker';

export async function poolMap<T>(items:T[],lanes:number,work:(item:T,slot:number)=>Promise<void>){
 let cursor=0;
 const results=await Promise.allSettled(Array.from({length:Math.min(lanes,items.length)},(_,i)=>(async()=>{
  for(;;){const index=cursor++;if(index>=items.length)return;await work(items[index]!,i+1);}
 })()));
 const error=results.find(r=>r.status==='rejected');if(error?.status==='rejected')throw error.reason;
}

/** A bounded operator batch owns the same supervisor lock as the ordinary worker.
 * Download slots are disjoint; processing slots 0/11/12/13 work only on retained bytes.
 * No abandoned batch is silently picked up by the ordinary on-demand worker. */
export async function runDocumentPoolPilot(sql:DbSql,batchId:string,shutdown:AbortSignal,work=runDocumentJob){
 const owner=await sql.reserve(),q=owner as unknown as DbSql;
 const stop=new AbortController(),abort=()=>stop.abort();shutdown.addEventListener('abort',abort,{once:true});
 if(shutdown.aborted)stop.abort();
 let locked=false,heartbeat:ReturnType<typeof setInterval>|undefined;
 const deadline=setTimeout(abort,45*60*1000),worker=collectionWorkerId('document-pool');
 try{
  const [lock]=await q`select pg_try_advisory_lock(${DOCUMENT_LOCK[0]},${DOCUMENT_LOCK[1]}) acquired,pg_backend_pid() pid`;
  if(!lock?.acquired)throw Error('A document worker is already processing; wait for drain.');locked=true;
  const [batch]=await q`select * from app.document_batches where id=${batchId}`;
  const [control]=await q`select paused,maintenance,blocked_reason,paused_streams from app.collection_control where id=1`;
  const [proxy]=await q`select enabled from app.collection_proxy_control where id=1`;
  if(!batch||batch.status!=='running'||!proxy?.enabled||!control||control.paused||control.maintenance||control.blocked_reason||control.paused_streams.includes('documents'))throw Error('Inspect batch, proxy and collection controls before pilot.');
  if((await q`select id from app.document_jobs where status='running' limit 1`).length)throw Error('An interrupted document needs inspection before pilot.');
  let checking=false;
  heartbeat=setInterval(()=>{if(checking)return;checking=true;void q`select pg_backend_pid() pid`.then(async rows=>{if(rows[0]?.pid!==lock.pid)stop.abort();else await collectionHeartbeat(q,worker,'documents','pilot');}).catch(abort).finally(()=>{checking=false;});},1000);
  async function execute(id:string,slot:number,phase:'download'|'process'){
   if(stop.signal.aborted)return;
   const session=await sql.reserve(),db=session as unknown as DbSql;
   try{
    const [current]=await db`select paused,maintenance,blocked_reason,paused_streams from app.collection_control where id=1`;
    if(!current||current.paused||current.maintenance||current.blocked_reason||current.paused_streams.includes('documents')){stop.abort();return;}
    const [job]=await db`update app.document_jobs set status='running',slot=${slot},stage=${phase==='process'?'text':'source'},started_at=coalesce(started_at,now()) where id=${id} and batch_id=${batchId} and status='queued' returning *`;
    if(!job)return;
    console.log(JSON.stringify({event:'document-pilot-job',batchId,jobId:id,phase,slot}));
    const taskStop=new AbortController(),cancel=()=>taskStop.abort();stop.signal.addEventListener('abort',cancel,{once:true});
    if(stop.signal.aborted)cancel();const timer=setTimeout(cancel,20*60*1000);
    try{
     await work(db,job,taskStop.signal,100,phase);taskStop.signal.throwIfAborted();
     const next=phase==='download'&&job.kind==='file';
     await db`update app.document_jobs set status=${next?'queued':'complete'},stage=${next?'process_queued':'complete'},finished_at=case when ${next} then null else now() end where id=${id}`;
    }catch(error){
     const message=error instanceof Error?error.message:'Document operation failed';
     // Retain technical details in source request diagnostics; never include credentials here.
     const safe=/^(SEAP|Lista|Identitatea|Documentul|Anunțul|Originalul|Procesarea|Formatul|Pagina|Răspuns|Modul|Adresă)/.test(message)?message:'Operațiunea nu s-a încheiat; verifică diagnosticul cererii. Originalul păstrat poate fi reutilizat.';
     await db`update app.document_jobs set status='failed',stage='failed',error=${safe.slice(0,500)},finished_at=now() where id=${id}`;
    }finally{clearTimeout(timer);stop.signal.removeEventListener('abort',cancel);}
   }finally{session.release();}
  }
  const lists=await sql`select id from app.document_jobs where batch_id=${batchId} and kind='list' and status='queued' order by created_at,id`;
  await poolMap(lists,Number(batch.concurrency),(r,slot)=>execute(r.id,slot,'download'));
  // Round-robin across notices before taking a second/third file from one procedure.
  // Only formats supported by this pilot are scheduled; the full inventory remains visible.
  const candidates=await sql`select id,notice_key from (
   select d.id,d.notice_key,d.published_at,row_number() over(partition by d.notice_key order by d.published_at desc nulls last,d.code) rank
   from app.procurement_documents d where d.notice_key in (select notice_key from app.document_jobs where batch_id=${batchId} and kind='list' and status='complete')
   and d.processed_at is null and d.filename ~* '[.](pdf|p7s)$'
  ) f order by rank,published_at desc nulls last,id limit ${Number(batch.max_files)}`;
  if(!stop.signal.aborted)for(const d of candidates)await sql`insert into app.document_jobs(notice_key,document_id,kind,dedup_key,requested_by,batch_id) values(${d.notice_key},${d.id},'file',${`file:${d.id}`},'system:document-pool-pilot',${batchId}) on conflict(dedup_key) where status in ('queued','running') do nothing`;
  const files=await sql`select id from app.document_jobs where batch_id=${batchId} and kind='file' and status='queued' order by created_at,id`;
  let downloadsDone=false;
  const download=poolMap(files,Number(batch.concurrency),(r,slot)=>execute(r.id,slot,'download')).finally(()=>{downloadsDone=true;});
  const process=poolMap([0,11,12,13],4,async slot=>{
   while(!stop.signal.aborted){
    const [ready]=await sql`select j.id from app.document_jobs j join app.procurement_documents d on d.id=j.document_id where j.batch_id=${batchId} and j.status='queued' and j.stage='process_queued' and d.original_hash is not null order by j.created_at,j.id limit 1`;
    if(ready)await execute(ready.id,slot,'process');else if(downloadsDone)break;else await sleep(250);
   }
  });
  const results=await Promise.allSettled([download,process]);
  const failure=results.find(r=>r.status==='rejected');if(failure?.status==='rejected')throw failure.reason;
  await sql`update app.document_jobs set status='failed',stage='failed',error='Pilot oprit; fără reluare automată. Originalul păstrat poate fi reutilizat.',finished_at=now() where batch_id=${batchId} and status='queued'`;
  const [counts]=await sql`select count(*) filter(where status<>'complete')::int gaps from app.document_jobs where batch_id=${batchId}`;
  await sql`update app.document_batches set status=${stop.signal.aborted||counts?.gaps?'stopped':'complete'},finished_at=now() where id=${batchId}`;
 }finally{
  stop.abort();clearTimeout(deadline);if(heartbeat)clearInterval(heartbeat);shutdown.removeEventListener('abort',abort);
  if(locked)await q`select pg_advisory_unlock(${DOCUMENT_LOCK[0]},${DOCUMENT_LOCK[1]})`.catch(()=>{});owner.release();
 }
}
