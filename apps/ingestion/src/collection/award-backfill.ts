import type {DbSql} from '@seap/db';
import {task,BACKGROUND_PRIORITY,type Task} from './plan.js';
export const AWARD_BACKFILL_PRIORITY=BACKGROUND_PRIORITY+10;
export const AWARD_BACKFILL_MAX=100000;
const AWARD_TYPES=['3','8','13','16','18','20'];
/** Metadata only, no source traffic. Queue root details for archived award list rows that never got a
 * detail archive. Tasks run as background work: only in enabled background lanes, after ordinary work. */
export async function enqueueAwardDetailBackfill(q:DbSql,{limit,pilot=false}:{limit:number;pilot?:boolean}){
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
  const [skipped]=await tx`select count(*) filter(where not valid)::int invalid from award_backfill`;
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
  const result={batchId,queued:inserted.size,byTypeVersion,pilot,limit,skippedInvalid:Number(skipped?.invalid??0),priority:AWARD_BACKFILL_PRIORITY};
  await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('system:award-detail-backfill','Operator — descărcare istorică atribuiri','award-detail-backfill',
   ${JSON.stringify({batchId,revision:control?.revision,backgroundLanes:control?.background_lanes,backgroundPending:before?.pending,backgroundTotal:before?.total})}::jsonb,
   ${JSON.stringify({...result,sourceMetadata:'latest archived award-list:v1; metadataRawId retained',contracts:false})}::jsonb)`;
  return result;
 });
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
