import {TED_PACKAGE_SPACING_MS,type DbSql} from '@seap/db';
import type {BackfillPart,DaDetailStatus,HistoricalStatus} from './historical-forecast';
/** Historical downloads, from task metadata and the audit only (no result bodies, no source traffic):
 * the background SEAP award-detail backfill and the TED daily-package catch-up. */
const n=(v:unknown)=>Number(v??0);
/** The slow reads of the award-detail backfill and the TED catch-up (~0.4 s on production, 14 November 2026). The
 * administration keeps them for a few minutes (status-cache.ts). */
export async function historicalInputs(q:DbSql,batchId:string){
 const parts=await q`select coalesce(params->>'part','root') part,count(*) filter(where status='pending')::int pending,count(*) filter(where status='running')::int running,
   count(*) filter(where status='complete')::int complete,count(*) filter(where status in ('failed','deferred'))::int failed,
   count(*) filter(where status='complete' and finished_at>now()-interval '1 hour')::int last_hour
  from app.collection_tasks where batch_id=${batchId} and stream='awards' and priority>=50 and params->>'backfill'='true' group by 1`;
 // Grouped without notice numbers so one cause reads as one line.
 const errors=await q`select left(regexp_replace(error,'[0-9]{4,}','…','g'),160) error,count(*)::int n from app.collection_tasks
  where batch_id=${batchId} and stream='awards' and priority>=50 and params->>'backfill'='true' and status='failed' group by 1 order by 2 desc,1 limit 4`;
 const [enqueue]=await q`select created_at,actor_id,after from app.collection_audit where action='award-detail-backfill' order by id desc limit 1`;
 const [ted]=await q`with packages as (select params->>'ojs' ojs,status,result->>'published' published,result->>'publicationDate' pub_day,(result->>'total')::int total,finished_at
   from app.collection_tasks where batch_id=${batchId} and stream='ted' and kind='ted-package'),
  latest as (select distinct on (ojs) ojs,pub_day,total from packages where status='complete' and published='true' order by ojs,finished_at desc),
  checks as (select params->>'ojs' ojs,bool_or(result->'verified'->>'match'='true') matched,bool_or(status='failed' and error like 'TED: verificare%') failed
   from app.collection_tasks where batch_id=${batchId} and stream='ted' and kind='ted-list' and params ? 'ojs' group by 1),
  frontier as (select ojs,pub_day from latest order by ojs desc limit 1)
  select (select ojs from frontier) ojs,(select pub_day from frontier) pub_day,(select count(*)::int from latest) packages,(select coalesce(sum(total),0)::int from latest) notices,
   (select count(*) filter(where matched)::int from checks) matched,(select count(*) filter(where failed and not matched)::int from checks) gaps,
   (select count(*)::int from generate_series((select pub_day from frontier)::date+1,(now() at time zone 'Europe/Bucharest')::date,interval '1 day') d where extract(isodow from d)<6) behind,
   (select max(finished_at) from packages) last_finished,(select bool_or(status in ('pending','running')) from packages) in_flight,
   (select ojs from packages where status='failed' order by finished_at desc nulls last limit 1) failed_attempt`;
 return {parts,errors,enqueue,ted};
}
export type HistoricalInputs=Awaited<ReturnType<typeof historicalInputs>>;
export async function historicalStatus(q:DbSql,batchId:string,lanes:number,inputs?:HistoricalInputs):Promise<HistoricalStatus>{
 const {parts,errors,enqueue,ted}=inputs??await historicalInputs(q,batchId);
 const after=(enqueue?.after??{}) as {queued?:number;remaining?:number;pilot?:boolean};
 const order={root:0,lots:1,eform:2} as Record<string,number>;
 return {
  daDetails:await daDetailStatus(q,batchId,lanes),
  awards:{
   parts:parts.map(r=>({part:String(r.part) as BackfillPart['part'],pending:n(r.pending),running:n(r.running),complete:n(r.complete),failed:n(r.failed),lastHour:n(r.last_hour)})).sort((a,b)=>(order[a.part]??9)-(order[b.part]??9)),
   errors:errors.map(r=>({error:String(r.error),n:n(r.n)})),
   lastEnqueue:enqueue?{at:new Date(String(enqueue.created_at)).toISOString(),auto:enqueue.actor_id==='system:award-detail-backfill-auto',queued:n(after.queued),remaining:typeof after.remaining==='number'?after.remaining:null,pilot:after.pilot===true}:null,
   lanes,
  },
  ted:{
   latest:ted?.ojs?{ojs:String(ted.ojs),day:String(ted.pub_day)}:null,packages:n(ted?.packages),notices:n(ted?.notices),matched:n(ted?.matched),gaps:n(ted?.gaps),
   behind:ted?.ojs?n(ted.behind):null,lastFinishedAt:ted?.last_finished?new Date(String(ted.last_finished)).toISOString():null,inFlight:ted?.in_flight===true,
   spacingMinutes:TED_PACKAGE_SPACING_MS/60000,failedAttempt:ted?.failed_attempt?String(ted.failed_attempt):null,
  },
 };
}
/** Priority of the direct-award lines download (apps/ingestion/src/collection/da-detail-backfill.ts). */
const DA_DETAIL_PRIORITY=70;
/** The direct-award lines download, from task metadata, its day counts and the audit. The status list keeps the
 * query on the queue index; finished tasks older than a day live only in app.da_detail_backfill_days. */
export async function daDetailStatus(q:DbSql,batchId:string,lanes:number):Promise<DaDetailStatus>{
 const live=q`select status,finished_at from app.collection_tasks where batch_id=${batchId} and status in ('pending','running','complete','failed','deferred') and stream='da' and priority>=${DA_DETAIL_PRIORITY}`;
 const [c]=await q`select count(*) filter(where status='pending')::int pending,count(*) filter(where status='running')::int running,count(*) filter(where status='complete')::int complete,
   count(*) filter(where status in ('failed','deferred'))::int failed,count(*) filter(where status='complete' and finished_at>now()-interval '1 hour')::int last_hour,
   count(*) filter(where status='complete' and finished_at>now()-interval '24 hours')::int last_day,(select coalesce(sum(complete),0)::bigint from app.da_detail_backfill_days) removed
  from (${live}) t`;
 const days=await q`with today as (select (now() at time zone 'Europe/Bucharest')::date d),
   fresh as (select (finished_at at time zone 'Europe/Bucharest')::date as day,count(*)::int n from (${live}) t where status='complete' group by 1)
  select g::date::text as day,(coalesce(s.complete,0)+coalesce(f.n,0))::int complete from today,generate_series(today.d-13,today.d,interval '1 day') g
   left join app.da_detail_backfill_days s on s.day=g::date left join fresh f on f.day=g::date order by 1`;
 const errors=await q`select left(regexp_replace(error,'[0-9]{4,}','…','g'),160) error,count(*)::int n from app.collection_tasks
  where batch_id=${batchId} and status='failed' and stream='da' and priority>=${DA_DETAIL_PRIORITY} group by 1 order by 2 desc,1 limit 4`;
 const [enqueue]=await q`select created_at,actor_id,after from app.collection_audit where action='da-detail-backfill' order by id desc limit 1`;
 const [moved]=await q`select after from app.collection_audit where action='da-detail-backfill' and coalesce(after->>'pilot','false')<>'true' order by id desc limit 1`;
 const w=moved?.after as {floor?:string;start?:string;forwardTo?:string;cursor?:{tier:1|2;day:string}|null;universe?:number;remaining?:number}|undefined;
 return {
  pending:n(c?.pending),running:n(c?.running),complete:n(c?.complete)+n(c?.removed),failed:n(c?.failed),lastHour:n(c?.last_hour),lastDay:n(c?.last_day),
  days:days.map(r=>({day:String(r.day),complete:n(r.complete)})),errors:errors.map(r=>({error:String(r.error),n:n(r.n)})),
  lastEnqueue:enqueue?{at:new Date(String(enqueue.created_at)).toISOString(),auto:enqueue.actor_id==='system:da-detail-backfill-auto',queued:n((enqueue.after as {queued?:number}).queued)}:null,
  walk:w&&w.floor&&w.start&&w.forwardTo?{floor:w.floor,start:w.start,forwardTo:w.forwardTo,cursor:w.cursor??null,universe:n(w.universe),remaining:n(w.remaining)}:null,
  lanes,
 };
}
