import type {DbSql} from '@seap/db';
import {task,BACKGROUND_PRIORITY,type Task} from './plan.js';
export const AWARD_BACKFILL_PRIORITY=BACKGROUND_PRIORITY+10;
export const AWARD_BACKFILL_MAX=100000;
/** The collector queues the next AWARD_BACKFILL_MAX notices when fewer background tasks than this wait. */
export const AWARD_BACKFILL_REFILL_BELOW=20000;
const AWARD_TYPES=['3','8','13','16','18','20'];
/** Metadata only, no source traffic. Queue root details for archived award list rows that never got a
 * detail archive. Tasks run as background work: only in enabled background lanes, after ordinary work.
 * `remaining` counts the valid notices still unscheduled after this call. */
export async function enqueueAwardDetailBackfill(q:DbSql,{limit,pilot=false,auto=false}:{limit:number;pilot?:boolean;auto?:boolean}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>AWARD_BACKFILL_MAX)throw Error(`--limit must be an integer between 1 and ${AWARD_BACKFILL_MAX}`);
 return q.begin(async tx=>{
  await tx`set local statement_timeout='300s'`;await tx`set local lock_timeout='10s'`;
  const batches=await tx`select id,status from app.collection_batches order by created_at`;
  if(batches.length!==1||batches[0]!.status!=='collecting')throw Error('Exactly one collecting recovery batch is required.');
  if((await tx`select id from app.processing_runs where status='running' limit 1`).length)throw Error('A processing run is running; enqueue after it finishes.');
  const batchId=String(batches[0]!.id);
  // Latest archived list row per notice; same validation as the 8 October detail activation.
  await tx`create temporary table award_backfill(raw_id bigint,notice text,payload jsonb,valid boolean) on commit drop`;
  await tx`insert into award_backfill
   with known as materialized (select distinct params->>'noticeId' notice from app.collection_tasks where batch_id=${batchId} and stream='awards' and kind='detail'),
   latest as (select distinct on (external_id) id,external_id,payload from raw.raw_documents
    where source='elicitatie' and endpoint_version='award-list:v1' and external_id ~ '^award:[1-9][0-9]*$' order by external_id,id desc)
   select l.id raw_id,substr(l.external_id,7) notice,l.payload,
    coalesce(l.payload->>'caNoticeId'=substr(l.external_id,7) and l.payload->>'noticeId' ~ '^[1-9][0-9]*$' and l.payload->>'noticeNo' ~ '^[A-Z]*[0-9]+$'
     and l.payload->>'sysNoticeTypeId'=any(${AWARD_TYPES}::text[]) and l.payload->>'sysNoticeVersionId' in ('1','2'),false) valid
   from latest l
   where not exists(select 1 from raw.raw_documents d where d.source='elicitatie' and d.external_id=l.external_id and d.endpoint_version='award-detail-root:v2')
    and not exists(select 1 from known k where k.notice=substr(l.external_id,7))`;
  // Newest first (ISO text order is close enough across the DST offset); pilot keeps two per source shape.
  const rows=await tx`select raw_id::text,notice,payload->>'noticeId' internal,payload->>'noticeNo' notice_no,(payload->>'sysNoticeTypeId')::int notice_type,(payload->>'sysNoticeVersionId')::int notice_version
   from (select *,row_number() over(partition by payload->>'sysNoticeTypeId',payload->>'sysNoticeVersionId' order by payload->>'noticeStateDate' desc nulls last,raw_id desc) shape_rank from award_backfill where valid) c
   where not ${pilot} or shape_rank<=2 order by c.payload->>'noticeStateDate' desc nulls last,c.raw_id desc limit ${limit}`;
  const [skipped]=await tx`select count(*) filter(where not valid)::int invalid,count(*) filter(where valid)::int valid from award_backfill`;
  const tasks:Task[]=rows.map(r=>task(batchId,'awards','detail',{noticeId:Number(r.notice),page:0,noticeType:Number(r.notice_type),noticeVersion:Number(r.notice_version),internalNoticeId:Number(r.internal),noticeNo:String(r.notice_no),metadataRawId:Number(r.raw_id),backfill:true},AWARD_BACKFILL_PRIORITY));
  // Never strand tasks in a batch that just closed; claims wait on this lock only for the inserts.
  const [b]=await tx`select status from app.collection_batches where id=${batchId} for update`;
  if(b?.status!=='collecting')throw Error('The recovery batch closed while preparing the backfill; nothing was queued.');
  const [before]=await tx`select count(*) filter(where status='pending')::int pending,count(*)::int total from app.collection_tasks where batch_id=${batchId} and priority>=${BACKGROUND_PRIORITY}`;
  const [control]=await tx`select revision,background_lanes from app.collection_control where id=1`;
  const inserted=new Set<string>();
  for(let i=0;i<tasks.length;i+=1000){
   const added=await tx`insert into app.collection_tasks(batch_id,key,partition,stream,kind,params,priority)
    select batch_id,key,partition,stream,kind,params,priority from jsonb_to_recordset(${JSON.stringify(tasks.slice(i,i+1000))}::jsonb) as x(batch_id text,key text,partition text,stream text,kind text,params jsonb,priority int)
    on conflict(batch_id,key) do nothing returning key`;
   for(const r of added)inserted.add(String(r.key));
  }
  const byTypeVersion:Record<string,number>={};
  for(const t of tasks)if(inserted.has(t.key)){const k=`${t.params.noticeType}:v${t.params.noticeVersion}`;byTypeVersion[k]=(byTypeVersion[k]??0)+1;}
  const result={batchId,queued:inserted.size,byTypeVersion,pilot,auto,limit,skippedInvalid:Number(skipped?.invalid??0),remaining:Math.max(0,Number(skipped?.valid??0)-inserted.size),priority:AWARD_BACKFILL_PRIORITY};
  const [actorId,actorName]=auto?['system:award-detail-backfill-auto','Colector — reîncărcare automată a descărcării istorice']:['system:award-detail-backfill','Operator — descărcare istorică atribuiri'];
  await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values(${actorId},${actorName},'award-detail-backfill',
   ${JSON.stringify({batchId,revision:control?.revision,backgroundLanes:control?.background_lanes,backgroundPending:before?.pending,backgroundTotal:before?.total})}::jsonb,
   ${JSON.stringify({...result,sourceMetadata:'latest archived award-list:v1; metadataRawId retained',contracts:false})}::jsonb)`;
  return result;
 });
}
/** Collector refill, metadata only. Continues a backfill the operator started (latest enqueue not a pilot)
 * while background lanes are on: queues the next notices once fewer than AWARD_BACKFILL_REFILL_BELOW
 * background tasks wait, or when the latest enqueue predates the `remaining` count. Stops for good
 * after an enqueue that left nothing unscheduled; an operator enqueue restarts it. */
export async function refillAwardBackfill(q:DbSql){
 const [control]=await q`select maintenance,collection_during_maintenance,paused,blocked_reason,background_lanes,paused_streams from app.collection_control where id=1`;
 if(!control||(control.maintenance&&!control.collection_during_maintenance)||control.paused||control.blocked_reason||!Number(control.background_lanes)||(control.paused_streams as string[]).includes('awards'))return {refilled:false,reason:'background-off'} as const;
 const [last]=await q`select after from app.collection_audit where action='award-detail-backfill' order by id desc limit 1`;
 const after=last?.after as {pilot?:boolean;remaining?:number}|undefined;
 if(!after||after.pilot)return {refilled:false,reason:'not-started'} as const;
 if(after.remaining===0)return {refilled:false,reason:'complete'} as const;
 const batches=await q`select id,status from app.collection_batches order by created_at`;
 if(batches.length!==1||batches[0]!.status!=='collecting')return {refilled:false,reason:'no-batch'} as const;
 if((await q`select id from app.processing_runs where status='running' limit 1`).length)return {refilled:false,reason:'processing'} as const;
 const [waiting]=await q`select count(*)::int n from app.collection_tasks where batch_id=${String(batches[0]!.id)} and priority>=${BACKGROUND_PRIORITY} and status in ('pending','running')`;
 if(after.remaining!==undefined&&Number(waiting?.n)>=AWARD_BACKFILL_REFILL_BELOW)return {refilled:false,reason:'queue-full'} as const;
 return {refilled:true,...await enqueueAwardDetailBackfill(q,{limit:AWARD_BACKFILL_MAX,auto:true})} as const;
}
/** Operator switch for background lanes; 0 disables background work. Lanes above the proxy concurrency never start. */
export async function setBackgroundLanes(q:DbSql,lanes:number){
 if(!Number.isSafeInteger(lanes)||lanes<0||lanes>10)throw Error('Background lanes must be an integer between 0 and 10');
 return q.begin(async tx=>{
  const [before]=await tx`select revision,background_lanes from app.collection_control where id=1 for update`;
  if(!before)throw Error('Collection control is missing.');
  const [after]=await tx`update app.collection_control set background_lanes=${lanes},revision=revision+1,updated_at=clock_timestamp() where id=1 returning revision,background_lanes`;
  await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('system:background-lanes','Operator — benzi de fundal','background-lanes',${JSON.stringify({revision:before.revision,backgroundLanes:before.background_lanes})}::jsonb,${JSON.stringify({revision:after!.revision,backgroundLanes:after!.background_lanes})}::jsonb)`;
  const [proxy]=await tx`select enabled,max_in_flight from app.collection_proxy_control where id=1`;
  return {backgroundLanes:Number(after!.background_lanes),revision:Number(after!.revision),effectiveLanes:Math.min(lanes,proxy?.enabled?Number(proxy.max_in_flight):1)};
 });
}
/** Metadata only. Return failed backfill detail tasks to the queue once a parser fix is deployed.
 * Their failed requests stay in the ledger and the previous errors are kept in the audit. */
export async function retryFailedAwardBackfill(q:DbSql){
 return q.begin(async tx=>{
  const batches=await tx`select id,status from app.collection_batches order by created_at`;
  if(batches.length!==1||batches[0]!.status!=='collecting')throw Error('Exactly one collecting recovery batch is required.');
  const batchId=String(batches[0]!.id);
  await tx`select id from app.collection_batches where id=${batchId} for update`;
  const failed=await tx`select id::text,key,left(error,200) error from app.collection_tasks
   where batch_id=${batchId} and stream='awards' and kind='detail' and status='failed' and priority>=${BACKGROUND_PRIORITY} and params->>'backfill'='true' order by id for update`;
  if(failed.length){
   const ids=failed.map(r=>String(r.id));
   await tx`update app.collection_retries set status='stopped',retry_at=null,updated_at=clock_timestamp() where task_id=any(${ids}::bigint[]) and status='pending'`;
   await tx`update app.collection_tasks set status='pending',error=null,result=null,started_at=null,finished_at=null where id=any(${ids}::bigint[])`;
  }
  await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('system:award-detail-backfill','Operator — descărcare istorică atribuiri','award-detail-backfill-retry',
   ${JSON.stringify({batchId,failed:failed.map(r=>({id:r.id,key:r.key,error:r.error}))})}::jsonb,${JSON.stringify({requeued:failed.length})}::jsonb)`;
  return {batchId,requeued:failed.length};
 });
}
