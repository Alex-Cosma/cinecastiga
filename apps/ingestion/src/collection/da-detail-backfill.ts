import type {DbSql} from '@seap/db';
import {task,BACKGROUND_PRIORITY,type Task} from './plan.js';
import {requeueFailedTasks} from './award-backfill.js';
/**
 * Direct-award details, historical download (owner, 11 November 2026: „pe tot parcursul zilei contractele directe”).
 * The list gives an award's header only; its item lines (name, quantity, unit, unit price) come from one
 * `getView/{id}` per award, archived as `da-detail:v1` and normalized into core.da_items by the nightly run.
 *
 * Background work, like the award-detail download: claimed only by the enabled background lanes, after every
 * ordinary task, through the same request gate (interval per IP, ceiling per minute, requests in flight).
 *
 * Order: the last days first (new awards keep getting their lines), then the product groups the unit prices
 * read (food, fuel wood, paper, cleaning: ~97% of the compared lines in ~32% of the awards), newest day first,
 * then every other accepted award, newest day first. Only accepted awards; one that already has lines or an
 * archived detail is skipped.
 */
export const DA_DETAIL_PRIORITY=BACKGROUND_PRIORITY+20;
const RECENT=DA_DETAIL_PRIORITY,PRODUCTS=DA_DETAIL_PRIORITY+1,REST=DA_DETAIL_PRIORITY+2;
export const DA_DETAIL_MAX=50000;
/** The collector schedules the next awards when fewer download tasks than this wait. */
export const DA_DETAIL_REFILL_BELOW=10000;
/** The 2018–2019 lines come from the 2020 archive; the download starts where the archive has none. */
export const DA_DETAIL_FLOOR='2020-01-01';
/** The last days are read again at every refill: an award can enter the list days after it was finalized. */
export const DA_DETAIL_RECENT_DAYS=7;
/** One call walks at most this many days, so a call stays short whatever it finds. */
export const DA_DETAIL_DAYS_PER_CALL=400;
/** Award CPV prefixes of the product groups (measured on 2018–2019: 03 farm produce, 15 food, 091 fuels and wood,
 * 301 office paper, 398 cleaning, 337 hygiene paper, 243 alcohol and chemicals, 184 gloves). */
export const DA_PRODUCT_CPV=['03','15','091','301','398','337','243','184'] as const;
const PRODUCT_PATTERN=`^(${DA_PRODUCT_CPV.join('|')})`;
/** A finished task stays this long, so the last-day pace reads from live rows; then it is counted and removed. */
const KEEP_FINISHED_HOURS=26;
export type DaDetailCursor={tier:1|2;day:string}|null;
export interface DaDetailState {batchId:string;queued:number;auto:boolean;pilot:boolean;limit:number;floor:string;
 /** Next day to schedule going back, in the product groups (tier 1) or the rest (tier 2); null once the floor is reached. */
 cursor:DaDetailCursor;
 /** The day the walk started from (the awards were counted up to it) and the newest day already read. */
 start:string;forwardTo:string;
 /** Accepted awards between the floor and `forwardTo`, and how many of them the walk has passed. */
 universe:number;covered:number;remaining:number;days:number;priority:number}
const ACTION='da-detail-backfill';
const isDay=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v));
const shift=(day:string,n:number)=>new Date(Date.parse(`${day}T00:00:00Z`)+n*86400000).toISOString().slice(0,10);
const detail=(batchId:string,id:string,priority:number)=>task(batchId,'da','da-detail',{noticeId:Number(id),page:0,backfill:true},priority);
/** The accepted awards of one Bucharest day in one group, each with whether it still needs its detail. */
async function dayAwards(tx:DbSql,day:string,products:boolean|null){
 return tx`select d.sicap_da_id::text id,
   (not exists(select 1 from core.da_items i where i.da_id=d.id)
    and not exists(select 1 from raw.raw_documents r where r.source='elicitatie' and r.external_id='da:'||d.sicap_da_id and r.endpoint_version='da-detail:v1')) need
  from core.direct_acquisitions d
  where d.finalization_date>=(${day}::date::timestamp at time zone 'Europe/Bucharest') and d.finalization_date<((${day}::date+1)::timestamp at time zone 'Europe/Bucharest')
   and d.state='Oferta acceptata' and (${products}::boolean is null or (coalesce(d.cpv_code,'')~${PRODUCT_PATTERN})=${products}::boolean)
  order by d.sicap_da_id desc` as unknown as Promise<{id:string;need:boolean}[]>;
}
async function insert(tx:DbSql,tasks:Task[]){
 let added=0;
 for(let i=0;i<tasks.length;i+=1000){
  const rows=await tx`insert into app.collection_tasks(batch_id,key,partition,stream,kind,params,priority)
   select batch_id,key,partition,stream,kind,params,priority from jsonb_to_recordset(${JSON.stringify(tasks.slice(i,i+1000))}::jsonb) as x(batch_id text,key text,partition text,stream text,kind text,params jsonb,priority int)
   on conflict(batch_id,key) do nothing returning 1`;
  added+=rows.length;
 }
 return added;
}
/** The latest schedule that moved the walk (a pilot does not). */
export async function daDetailState(q:DbSql){
 const [row]=await q`select created_at,actor_id,after from app.collection_audit where action=${ACTION} and coalesce(after->>'pilot','false')<>'true' order by id desc limit 1`;
 return row?{at:row.created_at as Date,state:row.after as DaDetailState}:null;
}
/** Metadata only, no source traffic. Schedule the details of accepted direct awards that have no item lines.
 * The first operator call fixes the floor and counts the awards; later calls (the collector's refill too) continue
 * the same walk. `restart` begins the walk again from yesterday with the given floor: awards already fetched are
 * skipped, so nothing is asked twice. */
export async function enqueueDaDetailBackfill(q:DbSql,{limit,pilot=false,auto=false,floor,restart=false}:{limit:number;pilot?:boolean;auto?:boolean;floor?:string;restart?:boolean}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>DA_DETAIL_MAX)throw Error(`--limit must be an integer between 1 and ${DA_DETAIL_MAX}`);
 if(floor!==undefined&&(!isDay(floor)||floor<'2007-01-01'))throw Error('--from must be a day, YYYY-MM-DD');
 return q.begin(async tx=>{
  await tx`set local statement_timeout='300s'`;await tx`set local lock_timeout='10s'`;
  const batches=await tx`select id,status from app.collection_batches order by created_at`;
  if(batches.length!==1||batches[0]!.status!=='collecting')throw Error('Exactly one collecting recovery batch is required.');
  if((await tx`select id from app.processing_runs where status='running' limit 1`).length)throw Error('A processing run is running; enqueue after it finishes.');
  const batchId=String(batches[0]!.id);
  const [clock]=await tx`select ((now() at time zone 'Europe/Bucharest')::date-1)::text yesterday`;
  const yesterday=String(clock!.yesterday);
  const prior=restart?null:(await daDetailState(tx as unknown as DbSql))?.state??null;
  if(prior&&floor!==undefined&&floor!==prior.floor)throw Error(`The download runs from ${prior.floor}; pass --restart to walk again from another day.`);
  if(auto&&!prior)throw Error('The download was not started by an operator.');
  const floorDay=prior?.floor??floor??DA_DETAIL_FLOOR;
  if(floorDay>yesterday)throw Error('--from must be a closed day.');
  const tasks:Task[]=[];let days=0;
  if(pilot){
   // The newest awards of the product groups that still need a detail; the walk does not move.
   for(let day=yesterday;tasks.length<Math.min(limit,20)&&days<60&&day>=floorDay;day=shift(day,-1),days++)
    for(const r of await dayAwards(tx as unknown as DbSql,day,true))if(r.need&&tasks.length<Math.min(limit,20))tasks.push(detail(batchId,r.id,RECENT));
   const [b]=await tx`select status from app.collection_batches where id=${batchId} for update`;
   if(b?.status!=='collecting')throw Error('The recovery batch closed while preparing the download; nothing was queued.');
   const queued=await insert(tx as unknown as DbSql,tasks);
   const result={batchId,queued,auto:false,pilot:true,limit,floor:floorDay,days,priority:RECENT};
   await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('system:da-detail-backfill','Operator — descărcare linii achiziții directe',${ACTION},${JSON.stringify({batchId})}::jsonb,${JSON.stringify(result)}::jsonb)`;
   return result;
  }
  let universe=prior?.universe??0,covered=prior?.covered??0;
  if(!prior){
   const [n]=await tx`select count(*)::int n from core.direct_acquisitions d where d.state='Oferta acceptata'
    and d.finalization_date>=(${floorDay}::date::timestamp at time zone 'Europe/Bucharest') and d.finalization_date<((${yesterday}::date+1)::timestamp at time zone 'Europe/Bucharest')`;
   universe=Number(n?.n??0);
  }
  // The last days, in both groups; days the collector missed while it was off are read once (at most 60).
  const from=prior?[shift(yesterday,-(DA_DETAIL_RECENT_DAYS-1)),shift(prior.forwardTo,1)].sort()[0]!:shift(yesterday,1);
  const first=[from,shift(yesterday,-59),floorDay].sort().at(-1)!;
  // Days after the start belong to this pass, in both groups; an older day only where the walk already passed it.
  const startDay=prior?.start??yesterday;
  let cursor:DaDetailCursor=prior?prior.cursor:{tier:1,day:startDay};
  const passed=(tier:1|2,day:string)=>day>startDay||cursor===null||(tier===1?cursor.tier===2||day>cursor.day:cursor.tier===2&&day>cursor.day);
  for(let day=yesterday;day>=first;day=shift(day,-1))for(const tier of [1,2] as const){
   if(!passed(tier,day))continue;
   const rows=await dayAwards(tx as unknown as DbSql,day,tier===1);days++;
   // A day newer than the last one read is outside the count: add it as read.
   if(prior&&day>prior.forwardTo){universe+=rows.length;covered+=rows.length;}
   for(const r of rows)if(r.need)tasks.push(detail(batchId,r.id,RECENT));
  }
  const start=tasks.length;
  while(cursor&&tasks.length-start<limit&&days<DA_DETAIL_DAYS_PER_CALL){
   const rows=await dayAwards(tx as unknown as DbSql,cursor.day,cursor.tier===1);days++;covered+=rows.length;
   for(const r of rows)if(r.need)tasks.push(detail(batchId,r.id,cursor.tier===1?PRODUCTS:REST));
   const next=shift(cursor.day,-1);
   cursor=next>=floorDay?{tier:cursor.tier,day:next}:cursor.tier===1?{tier:2,day:startDay}:null;
  }
  // Never strand tasks in a batch that just closed; claims wait on this lock only for the inserts.
  const [b]=await tx`select status from app.collection_batches where id=${batchId} for update`;
  if(b?.status!=='collecting')throw Error('The recovery batch closed while preparing the download; nothing was queued.');
  const queued=await insert(tx as unknown as DbSql,tasks);
  const result:DaDetailState={batchId,queued,auto,pilot:false,limit,floor:floorDay,cursor,start:startDay,forwardTo:yesterday,universe,covered:Math.min(covered,universe),remaining:cursor?Math.max(0,universe-covered):0,days,priority:DA_DETAIL_PRIORITY};
  // A refill that found nothing new and moved nothing leaves no audit line.
  const moved=!prior||queued>0||prior.forwardTo!==yesterday||JSON.stringify(prior.cursor)!==JSON.stringify(cursor);
  if(moved){
   const [actorId,actorName]=auto?['system:da-detail-backfill-auto','Colector — reîncărcare automată a liniilor achizițiilor directe']:['system:da-detail-backfill','Operator — descărcare linii achiziții directe'];
   const [control]=await tx`select revision,background_lanes from app.collection_control where id=1`;
   await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values(${actorId},${actorName},${ACTION},
    ${JSON.stringify({batchId,revision:control?.revision,backgroundLanes:control?.background_lanes,cursor:prior?.cursor??null,restart})}::jsonb,${JSON.stringify(result)}::jsonb)`;
  }
  return {...result,moved};
 });
}
/** Collector refill, metadata only. Continues a download the operator started while background lanes are on:
 * reads the last days again and schedules the next awards once fewer than DA_DETAIL_REFILL_BELOW wait. */
export async function refillDaDetailBackfill(q:DbSql){
 const [control]=await q`select maintenance,collection_during_maintenance,paused,blocked_reason,background_lanes,paused_streams from app.collection_control where id=1`;
 if(!control||(control.maintenance&&!control.collection_during_maintenance)||control.paused||control.blocked_reason||!Number(control.background_lanes)||(control.paused_streams as string[]).includes('da'))return {refilled:false,reason:'background-off'} as const;
 if(!await daDetailState(q))return {refilled:false,reason:'not-started'} as const;
 const batches=await q`select id,status from app.collection_batches order by created_at`;
 if(batches.length!==1||batches[0]!.status!=='collecting')return {refilled:false,reason:'no-batch'} as const;
 if((await q`select id from app.processing_runs where status='running' limit 1`).length)return {refilled:false,reason:'processing'} as const;
 const [waiting]=await q`select count(*)::int n from app.collection_tasks where batch_id=${String(batches[0]!.id)} and status in ('pending','running') and stream='da' and priority>=${DA_DETAIL_PRIORITY}`;
 if(Number(waiting?.n)>=DA_DETAIL_REFILL_BELOW)return {refilled:false,reason:'queue-full'} as const;
 const r=await enqueueDaDetailBackfill(q,{limit:DA_DETAIL_MAX,auto:true});
 if(!('moved' in r)||!r.moved)return {refilled:false,reason:'nothing-new'} as const;
 return {refilled:true,queued:r.queued,remaining:r.remaining,cursor:r.cursor} as const;
}
/** Metadata only. Count the finished download tasks older than a day in app.da_detail_backfill_days and remove them
 * (with their resolved retry rows), at most `batch` per call. The archive and the request ledger keep the evidence;
 * failed tasks stay, with their errors. */
export async function pruneDaDetailTasks(q:DbSql,batch=20000){
 return q.begin(async tx=>{
  await tx`set local lock_timeout='5s'`;
  const ids=(await tx`select id from app.collection_tasks where status='complete' and stream='da' and priority>=${DA_DETAIL_PRIORITY} and kind='da-detail'
   and params->>'backfill'='true' and finished_at<now()-${KEEP_FINISHED_HOURS}*interval '1 hour' order by id limit ${batch} for update skip locked`).map(r=>String(r.id));
  if(!ids.length)return {removed:0};
  await tx`delete from app.collection_retries where task_id=any(${ids}::bigint[]) and status='resolved'`;
  const [n]=await tx`with gone as (delete from app.collection_tasks t where t.id=any(${ids}::bigint[]) and not exists(select 1 from app.collection_retries r where r.task_id=t.id) returning finished_at),
   days as (insert into app.da_detail_backfill_days(day,complete) select (finished_at at time zone 'Europe/Bucharest')::date,count(*)::int from gone group by 1
    on conflict(day) do update set complete=app.da_detail_backfill_days.complete+excluded.complete returning 1)
   select (select count(*)::int from gone) removed,(select count(*)::int from days) days`;
  return {removed:Number(n?.removed??0)};
 });
}
/** Metadata only. Return the failed download tasks to the queue (after a parser or source repair), keeping their
 * priority; the previous errors and retry budgets go into the audit. */
export async function retryFailedDaDetails(q:DbSql){
 return q.begin(async tx=>{
  const batches=await tx`select id,status from app.collection_batches order by created_at`;
  if(batches.length!==1||batches[0]!.status!=='collecting')throw Error('Exactly one collecting recovery batch is required.');
  const batchId=String(batches[0]!.id);
  await tx`select id from app.collection_batches where id=${batchId} for update`;
  const failed=await tx`select id::text,key,left(error,200) error from app.collection_tasks
   where batch_id=${batchId} and status='failed' and stream='da' and priority>=${DA_DETAIL_PRIORITY} and kind='da-detail' and params->>'backfill'='true' order by id for update`;
  const retryBudgets=await requeueFailedTasks(tx as unknown as DbSql,failed.map(r=>String(r.id)));
  const causes:Record<string,number>={};for(const r of failed){const k=String(r.error??'').replace(/[0-9]{4,}/g,'…');causes[k]=(causes[k]??0)+1;}
  await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('system:da-detail-backfill','Operator — descărcare linii achiziții directe','da-detail-backfill-retry',
   ${JSON.stringify({batchId,failed:failed.length,causes,retryBudgets:retryBudgets.length})}::jsonb,${JSON.stringify({requeued:failed.length})}::jsonb)`;
  return {batchId,requeued:failed.length};
 });
}
