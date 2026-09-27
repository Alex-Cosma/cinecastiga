import { createDb, COLLECTION_STREAMS, validateCollectionSettings, type DbSql } from '@seap/db';
const g=globalThis as unknown as {collectionSql?:DbSql};
export const collectionDb=()=>g.collectionSql??=createDb().sql;
export class CollectionConflict extends Error {}
export async function collectionStatus(q:DbSql=collectionDb()){
 return q.begin('isolation level repeatable read read only',async tx=>{
  await tx`set local statement_timeout='5000ms'`;
  const [control]=await tx`select *,clock_timestamp() server_now from app.collection_control where id=1`;
  if(!control)throw Error('Configurația colectării lipsește.');
  const today=await tx`select count(*)::int attempts,count(*) filter(where outcome='success')::int succeeded,count(*) filter(where outcome in ('failed','interrupted'))::int failed,coalesce(sum(records),0)::text received from app.collection_requests where started_at>=((now() at time zone 'Europe/Bucharest')::date::timestamp at time zone 'Europe/Bucharest')`;
  const streams=await tx`select stream,count(*)::int attempts,coalesce(sum(records),0)::text received,count(*) filter(where outcome in ('failed','interrupted'))::int failed from app.collection_requests group by stream`;
  const requests=await tx`select id::text,stream,method,endpoint,parameters,status,outcome,error,records,bytes::text,diagnostics is not null as has_diagnostics,started_at,finished_at,extract(epoch from(finished_at-started_at))*1000 duration_ms from app.collection_requests order by app.collection_requests.id desc limit 100`;
  const failures=await tx`select id::text,stream,method,endpoint,parameters,status,outcome,error,records,bytes::text,diagnostics is not null as has_diagnostics,started_at,finished_at,extract(epoch from(finished_at-started_at))*1000 duration_ms from app.collection_requests where outcome in ('failed','interrupted') order by app.collection_requests.id desc limit 100`;
  const workers=await tx`select id,kind,state,heartbeat_at,heartbeat_at>now()-interval '30 seconds' alive from app.collection_workers order by heartbeat_at desc limit 20`;
  const audit=await tx`select id::text,actor_name,action,before,after,created_at from app.collection_audit order by app.collection_audit.id desc limit 20`;
  const runs=await tx`select distinct on(source) id::text,source,window_start,window_end,status,fetched_count,pages_fetched,started_at,finished_at from core.scrape_runs where started_at>=${control.created_at} order by source,started_at desc`;
  const [documents]=await tx`select count(*) filter(where j.status='queued')::int queued,count(*) filter(where j.status='running')::int running,count(*) filter(where j.status='queued' and j.kind='file' and d.original_hash is null)::int awaiting_download from app.document_jobs j left join app.procurement_documents d on d.id=j.document_id`;
  const [raw]=await tx`select count(*)::int archived from raw.raw_documents where source='elicitatie' and fetched_at>=greatest(${control.created_at}::timestamptz,((now() at time zone 'Europe/Bucharest')::date::timestamp at time zone 'Europe/Bucharest'))`;
  const publication=await tx`select id,version::text,status,kind,started_at,completed_at,validation->'stages' stages,methodology,error,validation->'checks' checks from app.monitoring_refreshes order by version desc limit 1`;
  const [lastVerified]=await tx`select id,version::text,kind,started_at,completed_at,methodology,validation->'checks' checks from app.monitoring_refreshes where status='ready' and kind='coordinated' order by version desc limit 1`;
  const [batch]=await tx`select id,end_day,status from app.collection_batches order by created_at desc limit 1`;
  const progress=batch?await tx`select stream,count(*) filter(where status='pending')::int pending,count(*) filter(where status='running')::int running,count(*) filter(where status='complete')::int complete,count(*) filter(where status='split')::int split,count(*) filter(where status='deferred')::int deferred,count(*) filter(where status='failed')::int failed from app.collection_tasks where batch_id=${batch.id} group by stream`:[];
  return {recovery:batch?{batch,progress}:null,control,today:today[0]!,streams,requests,failures,workers,audit,runs,documents:documents!,raw:raw!,publication:publication[0]??null,lastVerified:lastVerified??null};
 });
}
export type CollectionStatus=Awaited<ReturnType<typeof collectionStatus>>;
export async function changeCollection(actor:{id:string;name:string},body:Record<string,unknown>,q:DbSql=collectionDb()){
 return q.begin(async tx=>{
  const [before]=await tx`select * from app.collection_control where id=1 for update`;
  if(!before||body.revision!==before.revision)throw new CollectionConflict('Setările au fost modificate între timp. Reîncarcă valorile și aplică din nou.');
  if(body.action==='settings'){
   const v=validateCollectionSettings(body);
   await tx`update app.collection_control set min_seconds=${v.minSeconds},max_seconds=${v.maxSeconds},daily_limit=${v.dailyLimit},processing_time=${v.processingTime},next_allowed_at=case when ${v.minSeconds}>min_seconds then greatest(next_allowed_at,clock_timestamp()+${v.minSeconds}*interval '1 second') else next_allowed_at end where id=1`;
  }else if(body.action==='pause'){
   if(typeof body.paused!=='boolean')throw Error('Stare invalidă.');
   // Pause cannot clear a source block or bypass Retry-After.
   await tx`update app.collection_control set paused=${body.paused} where id=1`;
  }else if(body.action==='stream'){
   if(typeof body.stream!=='string'||!COLLECTION_STREAMS.includes(body.stream as typeof COLLECTION_STREAMS[number])||typeof body.paused!=='boolean')throw Error('Flux invalid.');
   const streams=new Set<string>(before.paused_streams);if(body.paused)streams.add(body.stream);else streams.delete(body.stream);
   await tx`update app.collection_control set paused_streams=${JSON.stringify([...streams])}::jsonb where id=1`;
  }else if(body.action==='unblock'){
   const [lock]=await tx`select pg_try_advisory_xact_lock(729114,4) acquired`;
   if(!lock?.acquired)throw new CollectionConflict('O cerere este încă activă. Așteaptă încheierea ei.');
   if(body.acknowledged!==true)throw Error('Confirmă verificarea răspunsului SEAP.');
   const [wait]=await tx`select blocked_until>clock_timestamp() waiting from app.collection_control where id=1`;
   if(wait?.waiting)throw new CollectionConflict('Termenul de așteptare nu a expirat. Reluarea rămâne blocată.');
   await tx`update app.collection_requests set outcome='interrupted',finished_at=clock_timestamp(),error='Worker întrerupt; administratorul a verificat reluarea.' where outcome='running'`;
   await tx`update app.collection_control set blocked_reason=null,blocked_until=null,paused=false,next_allowed_at=greatest(next_allowed_at,clock_timestamp()+max_seconds*interval '1 second') where id=1`;
  }else throw Error('Acțiune neacceptată.');
  const [after]=await tx`update app.collection_control set revision=revision+1,updated_at=clock_timestamp() where id=1 returning *`;
  const snapshot=(r:Record<string,unknown>)=>({minSeconds:r.min_seconds,maxSeconds:r.max_seconds,dailyLimit:r.daily_limit,processingTime:r.processing_time,paused:r.paused,pausedStreams:r.paused_streams,blockedReason:r.blocked_reason,revision:r.revision});
  await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values(${actor.id},${actor.name.slice(0,150)},${String(body.action)},${JSON.stringify(snapshot(before))}::jsonb,${JSON.stringify(snapshot(after!))}::jsonb)`;
  return after;
 });
}
