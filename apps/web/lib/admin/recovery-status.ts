import type {DbSql} from '@seap/db';
import {recoveryForecast,type RecoveryCounts,type RecoverySample} from './recovery-forecast';
/** Only aggregate task metadata. Never fetch result bodies/ids into the web process. */
export async function recoveryStatus(q:DbSql,batchId:string,progress:RecoveryCounts[],control:Record<string,any>){
 const samples=await q`
  with tasks as materialized (
   select stream,kind,params,status,partition,
    case when jsonb_typeof(result->'total')='number' then (result->>'total')::numeric else null end total
   from app.collection_tasks where batch_id=${batchId}
  ), da_units as (
   select params->>'authorityId' unit,count(*)::numeric work,
    bool_and(status in ('complete','split')) closed
   from tasks where kind='da' group by params->>'authorityId'
  ), notice_days as (
   select stream,params->>'from' as unit_day,max(total) filter(where (params->>'page')::int=0 and status='complete') total
   from tasks where kind='list' group by stream,params->>'from'
  ), contract_pages as (
   select greatest(1,ceil(total/200)) work from tasks where kind='contracts' and (params->>'page')::int=0 and status='complete'
  ), day_work as (
   select stream,unit_day,case when total is not null then greatest(1,ceil(total/100)) + total *
    (case when stream='awards' then 1+coalesce((select avg(work) from contract_pages),1) else 1 end) end work
   from notice_days
  )
  select 'da' stream,count(*)::int units,count(*) filter(where closed)::int sampled,
    coalesce(avg(work) filter(where closed),0)::float8 mean_work,coalesce(stddev_samp(work) filter(where closed),0)::float8 sd_work,
    0::int months,0::int total_months from da_units
  union all
  select stream,count(*)::int units,count(work)::int sampled,coalesce(avg(work),0)::float8 mean_work,
    coalesce(stddev_samp(work),0)::float8 sd_work,count(distinct left(unit_day,7)) filter(where work is not null)::int months,
    count(distinct left(unit_day,7))::int total_months from day_work group by stream`;
 // Use the current operating regime, not the old single-IP recovery average.
 const [pace]=await q`with boundary as (
   select greatest(b.created_at,now()-interval '10 minutes',coalesce((select max(created_at) from app.collection_audit
    where action in ('proxies','pause','unblock','settings')),b.created_at)) at
   from app.collection_batches b where b.id=${batchId}
  ) select extract(epoch from(now()-at))/86400 elapsed_days,
   (select count(*)::int from app.collection_tasks where batch_id=${batchId} and status in ('complete','split') and finished_at>=boundary.at and finished_at<=now()) recent_completed
  from boundary`;
 const catalogue=progress.find(s=>s.stream==='catalogue');
 const catalogueReady=!!catalogue&&Number(catalogue.complete)>0&&!['pending','running','failed','deferred'].some(k=>Number(catalogue[k as keyof RecoveryCounts])>0);
 const forecast=recoveryForecast({samples:samples as unknown as RecoverySample[],progress,catalogueReady,
  elapsedDays:Number(pace?.elapsed_days??0),recentCompleted:Number(pace?.recent_completed??0),minSeconds:control.min_seconds,maxSeconds:control.max_seconds,dailyLimit:control.daily_limit});
 return {...forecast,calculatedAt:new Date().toISOString()};
}
