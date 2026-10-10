import {NoticeDetailValidationError} from './notice-details.js';
import {CollectionProxyFailureError,collectionQuietWindow,diagnosticError,sanitizeDiagnostics,CollectionSuspendedError,collectionHeartbeat,collectionWorkerId,withCollectionStream,type DbSql} from '@seap/db';
import {getNoticeContracts,getNoticeDetailPart,type NoticeDetailParams,ScrapeError,listContractingAuthorities,listDirectAcquisitions,listNotices,NOTICE_TYPE_IDS,type ElicitatieClient} from '@seap/scraper-clients';
import {archiveDocumentsSql} from '../scrape/archive.js';
import {isoDaysAgo} from '../scrape/window.js';
import {planResponse,task,noticePageSize,NoticePageOverlapError,type Task,type PageResult} from './plan.js';
import {compareNoticeInventory} from './inventory.js';
import type {NoticeListItem} from '@seap/scraper-clients';
export const RECOVERY_LOCK=[729114,5] as const;
export const recoveryWorker=collectionWorkerId('recovery');
const streams=['da','tenders','awards','catalogue'] as const;
export async function insertTasks(q:DbSql,tasks:Task[]){
 for(const t of tasks)await q`insert into app.collection_tasks(batch_id,key,partition,stream,kind,params,priority,status,error) values(${t.batch_id},${t.key},${t.partition},${t.stream},${t.kind},${JSON.stringify(t.params)}::jsonb,${t.priority},${t.status??'pending'},${t.error??null}) on conflict(batch_id,key) do nothing`;
}
/** No source traffic. Freeze the last closed day and seed known authorities. */
export async function seedRecovery(q:DbSql,end=isoDaysAgo(1)){
 if(!/^2026-\d{2}-\d{2}$/.test(end)||end<'2026-07-01'||end>isoDaysAgo(1))throw Error('Recovery end must be a closed 2026 day after July 1.');
 const batch=`recovery-${end}`;
 await q.begin(async tx=>{
  const [existing]=await tx`select id from app.collection_batches limit 1`;
  if(existing){if(existing.id!==batch)throw Error('An existing recovery batch must be inspected before starting another.');return;}
  await tx`insert into app.collection_batches(id,end_day,seed_end_day) values(${batch},${end},${end})`;
  await tx`insert into app.collection_tasks(batch_id,key,partition,stream,kind,params,priority)
   select ${batch},'da:da:'||s.sicap_id||':2026-07-01:'||${end}||':0','da:da:'||s.sicap_id||':2026-07-01:'||${end},'da','da',jsonb_build_object('authorityId',s.sicap_id,'from','2026-07-01','to',${end}::text,'page',0),case when e.name_normalized='municipiul buzau' then 0 else 10 end
   from core.entity_sicap_ids s join core.entities e on e.id=s.entity_id where s.namespace='authority'`;
  await tx`insert into app.collection_tasks(batch_id,key,partition,stream,kind,params,priority)
   select ${batch},f||':list::'||d::date||':'||d::date||':0',f||':list::'||d::date||':'||d::date,f,'list',jsonb_build_object('from',d::date::text,'to',d::date::text,'page',0),case when d::date=${end}::date then 0 else 10 end
   from generate_series('2026-01-01'::date,${end}::date,interval '1 day') d cross join unnest(array['tenders','awards']) f`;
  await insertTasks(tx as unknown as DbSql,[task(batch,'catalogue','catalogue',{page:0},0)]);
 });
 return batch;
}
export async function fetchTask(client:ElicitatieClient,t:Task):Promise<unknown>{
 return withCollectionStream(t.stream,async()=>{
  const p=t.params;
  if(t.kind==='catalogue')return listContractingAuthorities(client,{pageIndex:p.page,pageSize:2000});
  if(t.kind==='da')return (await listDirectAcquisitions(client,{finalizationDateStart:p.from!,finalizationDateEnd:p.to!,contractingAuthorityId:p.authorityId!,pageIndex:p.page,pageSize:2000})).data;
  if(t.kind==='list')return (await listNotices(client,{sysNoticeTypeIds:t.stream==='tenders'?NOTICE_TYPE_IDS.participation:NOTICE_TYPE_IDS.award,startPublicationDate:p.from!,endPublicationDate:p.to!,pageIndex:p.page,pageSize:noticePageSize(t)})).data;
  if(t.kind==='detail')return (await getNoticeDetailPart(client,p as NoticeDetailParams)).data;
  return (await getNoticeContracts(client,{caNoticeId:p.noticeId!,skip:p.page*200,take:200})).data;
 },{taskId:t.id,batchId:t.batch_id,partition:t.partition,kind:t.kind,parameters:t.params});
}
/** Replace an unstable small daily pagination with one bounded source response.
 * Original attempts/results remain audited; the replacement must still prove
 * every distinct identity and exactly the same source total. No recursive retry. */
export async function scheduleNoticeOverlapRecovery(q:DbSql,t:Task,total:number){
 if(t.kind!=='list'||!['awards','tenders'].includes(t.stream)||t.params.singlePageTotal!==undefined||!t.params.from||t.params.from!==t.params.to||!Number.isSafeInteger(total)||total<1||total>2000)return false;
 const replacement=task(t.batch_id,t.stream,'list',{...t.params,page:0,singlePageTotal:total},0);
 await q.begin(async tx=>{
  const rows=await tx`select * from app.collection_tasks where batch_id=${t.batch_id} and partition=${t.partition} for update`;
  if(!rows.some(r=>String(r.id)===String(t.id)&&r.status==='running')||rows.some(r=>!['complete','running'].includes(r.status)))throw Error('Notice partition ownership changed');
  if((await tx`select id from app.collection_tasks where batch_id=${t.batch_id} and key=${replacement.key}`).length)throw Error('Notice single-page recovery was already attempted');
  await insertTasks(tx as unknown as DbSql,[replacement]);
  await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('system:collector','Reverificare paginare','notice-pagination-recovery',${JSON.stringify({tasks:rows})}::jsonb,${JSON.stringify({replacement:replacement.key,total,pageSize:2000})}::jsonb)`;
  await tx`update app.collection_tasks set status='split',finished_at=clock_timestamp(),error='Paginare suprapusă; reverificare într-o singură pagină.',result=coalesce(result,'{}'::jsonb)||${JSON.stringify({supersededBy:replacement.key})}::jsonb where batch_id=${t.batch_id} and partition=${t.partition}`;
  await tx`update app.collection_retries set status='resolved',retry_at=null,updated_at=clock_timestamp() where task_id=${t.id!} and status='pending'`;
 });
 return true;
}
/** Caller holds RECOVERY_LOCK for the entire worker lifetime, including archive commits. */
export async function recoverInterrupted(q:DbSql){
 const rows=await q`update app.collection_tasks set status='failed',error='Worker întrerupt. Verifică răspunsul și arhiva înainte de reprogramare.',finished_at=now() where status='running' returning id`;
 if(rows.length)await q`update app.collection_control set blocked_reason='Colector întrerupt înainte de confirmarea arhivei. Verifică sarcinile eșuate.',blocked_until=clock_timestamp()+interval '120 seconds' where id=1`;
 return rows.length;
}
export async function recoveryStep(q:DbSql,fetcher:(t:Task)=>Promise<unknown>,lane='0'){
 await collectionHeartbeat(q,`${recoveryWorker}:${lane}`,'ingestion','idle');
 if((await collectionQuietWindow(q)).active)return false;
 const claimed=await q.begin(async tx=>{
  const [c]=await tx`select paused,maintenance,collection_during_maintenance,blocked_reason,daily_limit,paused_streams from app.collection_control where id=1`;
  if(!c||c.paused||(c.maintenance&&!c.collection_during_maintenance)||c.blocked_reason)return null;
  if(c.maintenance&&(await tx`select id from app.processing_runs where status='running' limit 1`).length)return null;
  if(c.daily_limit!==null){const [n]=await tx`select count(*)::int n from app.collection_requests where started_at>=((now() at time zone 'Europe/Bucharest')::date::timestamp at time zone 'Europe/Bucharest')`;if(Number(n?.n)>=c.daily_limit)return null;}
  const [b]=await tx`select * from app.collection_batches where status='collecting' order by created_at limit 1 for update`;
  if(!b)return null;
  const [retry]=await tx`select x.task_id,x.retry_at>clock_timestamp() waiting from app.collection_retries x join app.collection_requests r on r.id=x.last_request_id join app.collection_tasks t on t.id=x.task_id where x.status='pending' and (r.proxy_id is null or (x.retry_at<=clock_timestamp() and t.status='pending' and t.batch_id=${b.id} and not (t.stream=any(${c.paused_streams}::text[])))) order by (r.proxy_id is null) desc,x.retry_at,x.task_id limit 1`;
  if(retry){
   const [t]=await tx`select * from app.collection_tasks where id=${retry.task_id} for update`;
   if(!t||t.status!=='pending'||t.batch_id!==b.id||retry.waiting||c.paused_streams.includes(t.stream))return null;
   await tx`update app.collection_tasks set status='running',started_at=clock_timestamp() where id=${t.id}`;
   return {t:t as unknown as Task,end:String(b.seed_end_day??b.end_day)};
  }
  for(let i=0;i<streams.length;i++){
   const index=(Number(b.next_stream)+i)%streams.length,stream=streams[index]!;
   if(c.paused_streams.includes(stream))continue;
   const [t]=await tx`select * from app.collection_tasks where batch_id=${b.id} and stream=${stream} and status='pending' and not exists(select 1 from app.collection_retries r where r.task_id=app.collection_tasks.id and r.status in ('pending','stopped')) order by priority,id limit 1 for update`;
   if(t){await tx`update app.collection_tasks set status='running',started_at=clock_timestamp() where id=${t.id}`;await tx`update app.collection_batches set next_stream=${(index+1)%streams.length} where id=${b.id}`;return {t:t as unknown as Task,end:String(b.seed_end_day??b.end_day)};}
  }
  const [left]=await tx`select count(*) filter(where status in ('pending','running'))::int pending,count(*) filter(where status in ('failed','deferred'))::int gaps from app.collection_tasks where batch_id=${b.id}`;
  if(!left?.pending)await tx`update app.collection_batches set status=${left?.gaps?'incomplete':'collected'} where id=${b.id}`;
  return null;
 });
 if(!claimed)return false;
 const {t,end}=claimed;
 console.log(JSON.stringify({event:'recovery-task',task:t.id,stream:t.stream,kind:t.kind,parameters:t.params}));
 let response:unknown;
 try{
  response=await fetcher(t);
  const prior=await q`select result from app.collection_tasks where batch_id=${t.batch_id} and partition=${t.partition} and status='complete' order by (params->>'page')::int`;
  const plan=planResponse(t,response,prior.map(r=>r.result as PageResult),end);
  await q.begin(async tx=>{
   const [scope]=t.kind==='catalogue'?await tx`select end_day from app.collection_batches where id=${t.batch_id} for share`:[];
   const [current]=await tx`select status from app.collection_tasks where id=${t.id!} for update`;
   if(current?.status!=='running')throw Error('Task ownership changed before archive commit');
   const inventory=t.params.inventoryOnly?await compareNoticeInventory(tx as unknown as DbSql,t,(response as {items:NoticeListItem[]}).items):undefined;
   const archive=await archiveDocumentsSql(tx as unknown as DbSql,plan.docs);
   if(t.kind==='catalogue'){
    const ids=plan.children.filter(c=>c.kind==='da').map(c=>c.params.authorityId!);
    const known=await tx`select distinct (params->>'authorityId')::bigint id from app.collection_tasks where batch_id=${t.batch_id} and kind='da' and (params->>'authorityId')::bigint=any(${ids}::bigint[])`;
    const seen=new Set(known.map(r=>Number(r.id)));
    plan.children=plan.children.map(child=>child.kind==='da'&&!seen.has(child.params.authorityId!)?task(t.batch_id,'da','da',{...child.params,from:'2026-07-01',to:String(scope!.end_day)},child.priority):child);
   }
   await insertTasks(tx as unknown as DbSql,plan.children);
   const result=JSON.stringify({...plan.result,...(inventory?{inventory}:{}),archived:archive.inserted,duplicates:archive.skipped}).replace(/\\u0000/g,'');
   await tx`update app.collection_tasks set status=${plan.status},result=${result}::jsonb,finished_at=clock_timestamp() where id=${t.id!}`;
   await tx`update app.collection_retries set status='resolved',retry_at=null,updated_at=clock_timestamp() where task_id=${t.id!} and status='pending'`;
  });
  console.log(JSON.stringify({event:'recovery-archived',task:t.id,status:plan.status,documents:plan.docs.length,children:plan.children.length}));
 }catch(error){
  if(error instanceof CollectionProxyFailureError){await q`update app.collection_tasks set status='failed',error=${error.message},finished_at=clock_timestamp() where id=${t.id!}`;return true;}
  if(error instanceof CollectionSuspendedError){await q`update app.collection_tasks set status='pending',started_at=null where id=${t.id!}`;return false;}
  // Only gate-confirmed timeouts are requeued above. Other failures may have partly succeeded. Keep
  // the exact task identity and stop admission until an operator inspects it.
  const isolatedDetailFailure=t.kind==='detail'&&(error instanceof NoticeDetailValidationError||error instanceof ScrapeError&&[400,404,410].includes(error.status??0));
  const message=isolatedDetailFailure&&error instanceof ScrapeError?`Detaliu SEAP indisponibil (HTTP ${error.status}); celelalte anunțuri continuă.`:error instanceof Error?error.message:'Eroare de colectare';
  const safe=/^(Structur|Detaliu|Identitatea|O singură|Fereastra|Dimensiunea|Totalul|Lipsește|Lista|SEAP|Numărul|Data|Filtrul|Tip de|Anunț)/.test(message)?message:'Cererea sau arhivarea nu a fost confirmată. Verifică jurnalul înainte de reluare.';
  await q`update app.collection_requests set diagnostics=coalesce(diagnostics,'{}'::jsonb)||${JSON.stringify(sanitizeDiagnostics({taskFailure:{taskId:t.id,exception:diagnosticError(error),...(response===undefined?{}:{response})}}))}::jsonb where id=(select id from app.collection_requests where diagnostics->'context'->>'taskId'=${String(t.id)} order by id desc limit 1)`;
  if(error instanceof NoticePageOverlapError&&await scheduleNoticeOverlapRecovery(q,t,error.total)){console.log(JSON.stringify({event:'notice-pagination-recovery',task:t.id,total:error.total}));return true;}
  await q.begin(async tx=>{await tx`update app.collection_retries set status='stopped',retry_at=null,updated_at=clock_timestamp() where task_id=${t.id!} and status='pending'`;await tx`update app.collection_tasks set status='failed',error=${safe.slice(0,500)},finished_at=clock_timestamp() where id=${t.id!}`;if(!isolatedDetailFailure)await tx`update app.collection_control set blocked_reason=coalesce(blocked_reason,${`Sarcina ${t.id}: ${safe}`}) where id=1`;});
  console.error(JSON.stringify({event:isolatedDetailFailure?'recovery-detail-gap':'recovery-stopped',task:t.id,error:safe}));
 }
 return true;
}
