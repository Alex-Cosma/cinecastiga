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
  ), detail_work as (
   select stream,(case when stream='tenders' then case (params->>'noticeType')::int when 2 then 'cn' when 6 then 'dc' when 7 then 'pc' else 'rfq' end else 'award' end)||':'||(params->>'noticeId') notice,count(*)::numeric work from tasks where kind='detail' group by stream,notice
  ), detail_mean as (
   select stream,avg(work) work from detail_work group by stream
  ), day_work as (
   select n.stream,n.unit_day,case when n.total is not null then greatest(1,ceil(n.total/100)) + n.total *
    (coalesce(d.work,1) + case when n.stream='awards' then coalesce((select avg(work) from contract_pages),1) else 0 end) end work
   from notice_days n left join detail_mean d on d.stream=n.stream
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
    where action in ('proxies','pause','unblock','settings','processing-complete','processing-failed','resume-archive-during-maintenance','notice-details-activation')),b.created_at)) at
   from app.collection_batches b where b.id=${batchId}
  ) select extract(epoch from(now()-at))/86400 elapsed_days,
   (select count(*)::int from app.collection_tasks where batch_id=${batchId} and status in ('complete','split') and finished_at>=boundary.at and finished_at<=now()) recent_completed
  from boundary`;
 const catalogue=progress.find(s=>s.stream==='catalogue');
 const catalogueReady=!!catalogue&&Number(catalogue.complete)>0&&!['pending','running','failed','deferred'].some(k=>Number(catalogue[k as keyof RecoveryCounts])>0);
 const layers=await q`with notices as (select stream,kind,(case when stream='tenders' then case (params->>'noticeType')::int when 2 then 'cn' when 6 then 'dc' when 7 then 'pc' else 'rfq' end else 'award' end)||':'||(params->>'noticeId') notice,
    bool_and(status='complete') complete,bool_or(status in ('failed','deferred')) gap,
    bool_or(kind='detail' and coalesce(params->>'part','root') in ('root','general','lots') and status<>'complete') discovering
   from app.collection_tasks where batch_id=${batchId} and kind in ('detail','contracts') group by stream,kind,notice)
   select stream,kind,count(*)::int total,count(*) filter(where complete)::int complete,count(*) filter(where gap)::int gaps,
   count(*) filter(where not complete and not gap)::int pending,bool_or(discovering) discovering from notices group by stream,kind order by stream,kind`;
 const forecast=recoveryForecast({samples:samples as unknown as RecoverySample[],progress,catalogueReady,detailDiscoveryPending:layers.some(r=>r.discovering),
  elapsedDays:Number(pace?.elapsed_days??0),recentCompleted:Number(pace?.recent_completed??0),minSeconds:control.min_seconds,maxSeconds:control.max_seconds,dailyLimit:control.daily_limit});
 return {...forecast,layers,calculatedAt:new Date().toISOString()};
}
