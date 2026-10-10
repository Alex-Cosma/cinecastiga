import type {DbSql} from '@seap/db';
import {DA_STRATEGY} from './da-partition.js';
import {task} from './plan.js';
import {insertTasks} from './runner.js';
/** Explicit operator action after the shadow audit. Metadata only; caller pauses/drains first. */
export async function activateNationalDa(q:DbSql){
 return q.begin(async tx=>{
  const [c]=await tx`select paused,blocked_reason from app.collection_control where id=1 for update`;
  if(!c?.paused||c.blocked_reason)throw Error('Pause and inspect collection before changing its discovery strategy.');
  const batches=await tx`select * from app.collection_batches order by created_at for update`;
  if(batches.length!==1||!batches[0]!.follow_latest)throw Error('One continuous recovery batch is required.');
  const b=batches[0]!;
  if(b.da_strategy===DA_STRATEGY)return {batchId:b.id,alreadyActive:true,added:0,superseded:0};
  if(b.da_strategy!=='authority')throw Error('Unknown prior discovery strategy');
  if((await tx`select id from app.collection_tasks where batch_id=${b.id} and status='running' limit 1`).length)throw Error('Wait for all admitted tasks to drain.');
  // Retry budgets and failed tasks remain intact. Only untouched pending authority work is replaced.
  const pending=await tx`select id,params,result,error from app.collection_tasks t where batch_id=${b.id} and kind='da' and status='pending' and not(params ? 'daStrategy')
   and not exists(select 1 from app.collection_retries r where r.task_id=t.id) for update`;
  const days=await tx`select distinct d::date::text unit_day from (
   select (params->>'from')::date a,(params->>'to')::date z from app.collection_tasks t where id=any(${pending.map(r=>r.id)}::bigint[])
   union all select greatest('2026-07-01'::date,${b.end_day}::date-6),${b.end_day}::date
  ) windows cross join lateral generate_series(a,z,interval '1 day') d order by unit_day`;
  if(days.some(d=>String(d.unit_day)>String(b.end_day))||days.length>366)throw Error('Inspect unusually large replacement scope.');
  const roots=days.map(d=>task(String(b.id),'da','da',{from:String(d.unit_day),to:String(d.unit_day),page:0,daStrategy:DA_STRATEGY,daScan:String(b.end_day)},5));
  await insertTasks(tx as unknown as DbSql,roots);
  const [week]=await tx`select date_trunc('week',${b.end_day}::date)::date::text unit_day`;
  await insertTasks(tx as unknown as DbSql,[task(String(b.id),'catalogue','cpv-catalogue',{from:String(week!.unit_day),to:String(week!.unit_day),page:0},0)]);
  await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('system:da-activation','Colector','da-national-activation',${JSON.stringify({batchId:b.id,strategy:b.da_strategy,tasks:pending})}::jsonb,${JSON.stringify({strategy:DA_STRATEGY,roots:roots.map(t=>t.key),scan:b.end_day})}::jsonb)`;
  await tx`update app.collection_tasks set status='split',finished_at=clock_timestamp(),error=null,result=coalesce(result,'{}'::jsonb)||${JSON.stringify({supersededBy:`national-da:${b.end_day}`,replacementDays:days.map(d=>d.unit_day)})}::jsonb where id=any(${pending.map(r=>r.id)}::bigint[])`;
  await tx`update app.collection_batches set da_strategy=${DA_STRATEGY},status='collecting' where id=${b.id}`;
  return {batchId:b.id,added:roots.length,superseded:pending.length,days:days.map(d=>d.unit_day),strategy:DA_STRATEGY};
 });
}
