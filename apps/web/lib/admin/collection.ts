import {proxyStatus,changeProxySettings} from './proxies';
import type { MoneyQuality } from "@seap/db";
import {recoveryInputs,recoveryStatus} from './recovery-status';
import {historicalInputs,historicalStatus} from './historical-status';
import type {RecoveryCounts} from './recovery-forecast';
import {cachedRead} from './status-cache';
import { createDb, COLLECTION_STREAMS, validateCollectionSettings, processingSchedule, collectionQuietWindow, type DbSql } from '@seap/db';
const g=globalThis as unknown as {collectionSql?:DbSql};
const iso=(value:unknown)=>value?new Date(String(value)).toISOString():null;
export const collectionDb=()=>g.collectionSql??=createDb().sql;
export class CollectionConflict extends Error {}
/**
 * What each page of the administration reads (owner, 14 November 2026: the tabs took ~17 s, every page read
 * everything). The base comes with every page: the collector's state, the last requests, the workers, the schedule,
 * today's counts. A page adds only the sections it shows; `collectionStatus(q)` without a page reads them all.
 */
export const ADMIN_STATUS_VIEWS=['acum','trafic','conexiune','jurnal','procesare','fisiere','oameni'] as const;
export type AdminStatusView=typeof ADMIN_STATUS_VIEWS[number];
type Section='proxies'|'failures'|'audit'|'streams'|'runs'|'raw'|'isolated'|'money'|'publication'|'recovery'|'historical';
const VIEW_SECTIONS:Record<AdminStatusView,readonly Section[]>={
 acum:['proxies','failures','raw','isolated','money','publication','recovery','historical'],
 trafic:['streams','runs','recovery','historical'],
 conexiune:['proxies'],
 jurnal:['failures','audit'],
 procesare:['isolated','money','publication'],
 fisiere:[],
 oameni:[],
};
const ALL_SECTIONS=new Set<Section>(Object.values(VIEW_SECTIONS).flat());
/** How long a slow part may be reused (status-cache.ts): counts of the day a minute, totals and forecasts five. On
 * production, 14 November 2026: forecast reads 11.4 s, all-time totals per stream 1.6 s, today's counts 1.9 s,
 * today's archive 0.8 s, the batch's progress 0.4 s, the award backfill 0.4 s. */
const TTL={today:60_000,raw:60_000,progress:60_000,streams:300_000,recovery:300_000,historical:300_000};
/** Every field of a page that reads all sections. */
type Full<T>={[K in keyof T]-?:Exclude<T[K],undefined>};

async function readStatus(q:DbSql,sections:ReadonlySet<Section>){
 // Kept in the web process for the server's own pool only: a test database (any other `q`) always reads live.
 const caching=g.collectionSql!==undefined&&q===g.collectionSql;
 const has=(section:Section)=>sections.has(section);
 return q.begin('isolation level repeatable read read only',async tx=>{
  await tx`set local statement_timeout='20000ms'`;
  const live=tx as unknown as DbSql;
  // A slow part: from the cache (its own read-only transaction, read again in the background once stale) or live.
  const slow=async<T>(key:string,ttl:number,load:(s:DbSql)=>Promise<T>):Promise<T>=>caching
   ?(await cachedRead(key,ttl,()=>q.begin('isolation level repeatable read read only',async s=>{
     await s`set local statement_timeout='120000ms'`;return load(s as unknown as DbSql);
    }) as Promise<T>)).value
   :load(live);
  const [control]=await tx`select *,clock_timestamp() server_now from app.collection_control where id=1`;
  if(!control)throw Error('Configurația colectării lipsește.');
  const {today,dataToday}=await slow('today',TTL.today,async s=>{
   const today=await s`select count(*)::int attempts,count(*) filter(where outcome='success')::int succeeded,count(*) filter(where outcome in ('failed','interrupted'))::int failed,coalesce(sum(records),0)::text received from app.collection_requests where started_at>=((now() at time zone 'Europe/Bucharest')::date::timestamp at time zone 'Europe/Bucharest')`;
   const [dataToday]=await s`select count(*)::int attempts,count(*) filter(where outcome='success')::int succeeded,count(*) filter(where outcome in ('failed','interrupted'))::int failed,coalesce(sum(records),0)::text received from app.collection_requests where stream<>'documents' and started_at>=((now() at time zone 'Europe/Bucharest')::date::timestamp at time zone 'Europe/Bucharest')`;
   return {today:[...today],dataToday:dataToday!};
  });
  const streams=has('streams')?await slow('streams',TTL.streams,async s=>[...await s`select stream,count(*)::int attempts,coalesce(sum(records),0)::text received,count(*) filter(where outcome in ('failed','interrupted'))::int failed from app.collection_requests group by stream`]):undefined;
  const requests=await tx`select id::text,proxy_id,stream,method,endpoint,parameters,status,outcome,error,records,bytes::text,diagnostics is not null as has_diagnostics,started_at,finished_at,extract(epoch from(finished_at-started_at))*1000 duration_ms from app.collection_requests order by app.collection_requests.id desc limit 100`;
  const failures=has('failures')?await tx`select id::text,proxy_id,stream,method,endpoint,parameters,status,outcome,error,records,bytes::text,diagnostics is not null as has_diagnostics,started_at,finished_at,extract(epoch from(finished_at-started_at))*1000 duration_ms from app.collection_requests where outcome in ('failed','interrupted') order by app.collection_requests.id desc limit 100`:undefined;
  const workers=await tx`select id,kind,state,heartbeat_at,heartbeat_at>now()-interval '30 seconds' alive from app.collection_workers order by heartbeat_at desc limit 20`;
  const audit=has('audit')?await tx`select id::text,actor_name,action,before,after,created_at from app.collection_audit order by app.collection_audit.id desc limit 20`:undefined;
  const runs=has('runs')?await tx`select distinct on(source) id::text,source,window_start,window_end,status,fetched_count,pages_fetched,started_at,finished_at from core.scrape_runs where started_at>=${control.created_at} order by source,started_at desc`:undefined;
  const [documents]=await tx`select count(*) filter(where j.status='queued')::int queued,count(*) filter(where j.status='running')::int running,count(*) filter(where j.status='queued' and j.kind='file' and d.original_hash is null)::int awaiting_download from app.document_jobs j left join app.procurement_documents d on d.id=j.document_id`;
  const raw=has('raw')?await slow(`raw:${iso(control.created_at)}`,TTL.raw,async s=>{const [raw]=await s`select count(*)::int archived from raw.raw_documents where source='elicitatie' and fetched_at>=greatest(${control.created_at}::timestamptz,((now() at time zone 'Europe/Bucharest')::date::timestamp at time zone 'Europe/Bucharest'))`;return raw!;}):undefined;
  const moneyQuality=has('money')?((await tx`select observation from marts.contract_money_quality where id=1`)[0]?.observation as MoneyQuality|undefined)??null:undefined;
  // Problems isolated from publication (18 October 2026), open until resolved: a revoked
  // approval while any former member is still excluded, a record until its retry succeeds.
  const isolated=has('isolated')?{revokedIdentities:await tx`select a.id::text,a.after->>'candidateId' candidate,a.after->>'reason' reason,
    jsonb_array_length(a.after->'contracts')::int publications,a.created_at from app.collection_audit a
    where a.action='identity-revoked' and exists(select 1 from marts.contract_identity_exclusions x
      where x.contract_id::text in (select jsonb_array_elements_text(a.after->'contracts')))
    order by a.id desc limit 20`,quarantinedRecords:await tx`select raw_id::text,max(endpoint_version) endpoint,min(created_at) first_seen,count(*)::int attempts,
    left((array_agg(zod_error order by id desc))[1],300) error from core.quarantine where retry_required and resolved_at is null
    group by raw_id order by min(created_at) desc limit 20`}:undefined;
  const publication=has('publication')?(await tx`select id,version::text,status,kind,started_at,completed_at,validation->'stages' stages,methodology,error,validation->'checks' checks from app.monitoring_refreshes order by monitoring_refreshes.version desc limit 1`)[0]??null:undefined;
  const lastVerified=has('publication')?(await tx`select id,version::text,kind,started_at,completed_at,methodology,validation->'checks' checks,validation->'risk' risk,validation->>'refreshScope' refresh_scope from app.monitoring_refreshes where status='ready' and kind='coordinated' order by monitoring_refreshes.version desc limit 1`)[0]??null:undefined;
  const processingRows=await tx`select id,scheduled_day::text,scope,status,stage,started_at,stage_started_at,heartbeat_at,completed_at,stages,raw_boundary,checkpoint_id,error,mode from app.processing_runs order by started_at desc limit 7`;
  const processingRuns=processingRows.map(r=>({...r,started_at:iso(r.started_at),stage_started_at:iso(r.stage_started_at),heartbeat_at:iso(r.heartbeat_at),completed_at:iso(r.completed_at)}) as typeof r);
  const [timeoutRetry]=await tx`select r.task_id::text,r.last_request_id::text,r.timeouts,r.retry_at,t.stream from app.collection_retries r join app.collection_tasks t on t.id=r.task_id join app.collection_requests attempt on attempt.id=r.last_request_id where r.status='pending' and attempt.proxy_id is null order by r.retry_at limit 1`;
  const proxyRetries=await tx`select r.task_id::text,r.timeouts,r.retry_at,attempt.proxy_id from app.collection_retries r join app.collection_requests attempt on attempt.id=r.last_request_id where r.status='pending' and attempt.proxy_id is not null order by r.retry_at,r.task_id`;
  const quietWindow=await collectionQuietWindow(live);
  const schedule=await processingSchedule(live);
  const [scheduler]=await tx`select heartbeat_at>now()-interval '2 minutes' alive from app.collection_workers where id='nightly-scheduler'`;
  const [batch]=await tx`select id,end_day,status,follow_latest from app.collection_batches order by created_at desc limit 1`;
  // Historical backfill (priority>=50) runs only after ordinary work; keep it out of progress, ETA and gaps.
  const recovery=has('recovery')&&batch?await slow(`progress:${batch.id}`,TTL.progress,async s=>{
   const progress=await s`select stream,count(*) filter(where status='pending')::int pending,count(*) filter(where status='running')::int running,count(*) filter(where status='complete')::int complete,count(*) filter(where status='split')::int split,count(*) filter(where status='deferred')::int deferred,count(*) filter(where status='failed')::int failed from app.collection_tasks where batch_id=${batch.id} and priority<50 group by stream`;
   const [background]=await s`select count(*) filter(where status='pending')::int pending,count(*) filter(where status='running')::int running,count(*) filter(where status='complete')::int complete,count(*) filter(where status in ('failed','deferred'))::int failed from app.collection_tasks where batch_id=${batch.id} and priority>=50`;
   return {progress:[...progress],background};
  }):undefined;
  const proxies=has('proxies')?await proxyStatus(live):undefined;
  // The forecast's pace needs only the proxy settings and how many endpoints are enabled, not the whole pool.
  const [pool]=await tx`select c.enabled,c.requests_per_minute,c.min_seconds,c.max_seconds,(select count(*)::int from app.collection_proxies where enabled) endpoints from app.collection_proxy_control c where c.id=1`;
  const proxySeconds=pool?.enabled?Math.max(60/Number(pool.requests_per_minute),(Number(pool.min_seconds)+Number(pool.max_seconds))/2/Math.max(1,Number(pool.endpoints))):null;
  const historical=has('historical')?batch?await historicalStatus(live,batch.id,Number(control.background_lanes??0),await slow(`historical:${batch.id}`,TTL.historical,s=>historicalInputs(s,batch.id))):null:undefined;
  const forecast=has('recovery')?batch&&recovery?await recoveryStatus(live,batch.id,recovery.progress as unknown as RecoveryCounts[],proxySeconds===null?control:{...control,min_seconds:proxySeconds,max_seconds:proxySeconds},await slow(`recovery:${batch.id}`,TTL.recovery,s=>recoveryInputs(s,batch.id))):null:undefined;
  const background=recovery?.background;
  return {proxies,proxyRetries,moneyQuality,isolated,forecast,historical,timeoutRetry:timeoutRetry??null,quietWindow,
   recovery:has('recovery')?batch&&recovery?{batch,progress:recovery.progress,background:{pending:Number(background?.pending??0),running:Number(background?.running??0),complete:Number(background?.complete??0),failed:Number(background?.failed??0),lanes:Number(control.background_lanes??0)}}:null:undefined,
   control,dataToday,today:today[0]!,streams,requests,failures,workers,audit,runs,documents:documents!,raw,publication,lastVerified,
   processing:{runs:processingRuns,schedule:{next_at:iso(schedule.next_at),next_risk_at:iso(schedule.next_risk_at)},schedulerAlive:scheduler?.alive===true}};
 });
}
export type CollectionStatus=Full<Awaited<ReturnType<typeof readStatus>>>;
/** One page's part of the status: the base plus that page's sections (a missing key is a section the page does not read). */
export type CollectionStatusPart=Partial<CollectionStatus>&Pick<CollectionStatus,'control'|'today'|'dataToday'|'requests'|'workers'|'documents'|'processing'|'timeoutRetry'|'proxyRetries'|'quietWindow'>;
export async function collectionStatus(q?:DbSql):Promise<CollectionStatus>;
export async function collectionStatus(q:DbSql,view:AdminStatusView):Promise<CollectionStatusPart>;
export async function collectionStatus(q:DbSql=collectionDb(),view?:AdminStatusView):Promise<CollectionStatusPart>{
 const status=await readStatus(q,view?new Set(VIEW_SECTIONS[view]):ALL_SECTIONS);
 // Absent, not undefined: the page merges parts and must keep what another page read.
 return Object.fromEntries(Object.entries(status).filter(([,value])=>value!==undefined)) as CollectionStatusPart;
}

export async function changeCollection(actor:{id:string;name:string},body:Record<string,unknown>,q:DbSql=collectionDb()){
 return q.begin(async tx=>{
  const [before]=await tx`select * from app.collection_control where id=1 for update`;
  if(!before||body.revision!==before.revision)throw new CollectionConflict('Setările au fost modificate între timp. Reîncarcă valorile și aplică din nou.');
  let proxyAudit:Awaited<ReturnType<typeof changeProxySettings>>|undefined;
  if(body.action==='proxies'){
   if(!before.paused||before.maintenance)throw new CollectionConflict('Pune colectarea pe pauză înainte să modifici proxy-urile. Așteaptă încheierea mentenanței, dacă este activă.');
   const [lock]=await tx`select pg_try_advisory_xact_lock(729114,4) acquired`;
   const [job]=await tx`select id from app.document_jobs where status='running' limit 1`;
   if(!lock?.acquired||job)throw new CollectionConflict('Așteaptă încheierea cererii sau documentului activ.');
   proxyAudit=await changeProxySettings(tx as unknown as DbSql,body);
  }else if(body.action==='settings'){
   if(before.maintenance)throw new CollectionConflict('Așteaptă încheierea mentenanței înainte de modificarea programului sau ritmului.');
   const v=validateCollectionSettings(body);
   const enabled=body.processingEnabled??before.processing_enabled,weekday=body.riskWeekday??before.risk_weekday;
   if(typeof enabled!=='boolean'||!Number.isInteger(weekday)||Number(weekday)<0||Number(weekday)>6)throw Error('Program de procesare invalid.');
   await tx`update app.collection_control set processing_enabled=${enabled},risk_weekday=${Number(weekday)},
     processing_enabled_at=case when ${enabled} and (not processing_enabled or processing_time<>${v.processingTime}) then clock_timestamp() else processing_enabled_at end where id=1`;
   await tx`update app.collection_control set min_seconds=${v.minSeconds},max_seconds=${v.maxSeconds},daily_limit=${v.dailyLimit},processing_time=${v.processingTime},next_allowed_at=case when ${v.minSeconds}>min_seconds then greatest(next_allowed_at,clock_timestamp()+${v.minSeconds}*interval '1 second') else next_allowed_at end where id=1`;
  }else if(body.action==='pause'){
   if(typeof body.paused!=='boolean')throw Error('Stare invalidă.');
   // Pause cannot clear a source block or bypass Retry-After.
   await tx`update app.collection_control set paused=${body.paused} where id=1`;
  }else if(body.action==='stream'){
   if(typeof body.stream!=='string'||!COLLECTION_STREAMS.includes(body.stream as typeof COLLECTION_STREAMS[number])||typeof body.paused!=='boolean')throw Error('Flux invalid.');
   const [dataToday]=await tx`select count(*)::int attempts,count(*) filter(where outcome='success')::int succeeded,count(*) filter(where outcome in ('failed','interrupted'))::int failed,coalesce(sum(records),0)::text received from app.collection_requests where stream<>'documents' and started_at>=((now() at time zone 'Europe/Bucharest')::date::timestamp at time zone 'Europe/Bucharest')`;
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
  const snapshot=(r:Record<string,unknown>)=>({minSeconds:r.min_seconds,maxSeconds:r.max_seconds,dailyLimit:r.daily_limit,processingTime:r.processing_time,processingEnabled:r.processing_enabled,riskWeekday:r.risk_weekday,paused:r.paused,pausedStreams:r.paused_streams,blockedReason:r.blocked_reason,revision:r.revision});
  await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values(${actor.id},${actor.name.slice(0,150)},${String(body.action)},${JSON.stringify({...snapshot(before),...(proxyAudit?{proxies:proxyAudit.before}:{})})}::jsonb,${JSON.stringify({...snapshot(after!),...(proxyAudit?{proxies:proxyAudit.after}:{})})}::jsonb)`;
  return after;
 });
}
