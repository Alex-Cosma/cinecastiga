import type { DbSql } from './client.js';

/** Host runner holds the deployment lock before calling these operations. */
export async function claimProcessing(q: DbSql, at?: Date) {
 await q`insert into app.collection_workers(id,kind,state) values('nightly-scheduler','scheduler','waiting')
   on conflict(id) do update set heartbeat_at=clock_timestamp(),state=excluded.state`;
 return q.begin(async tx=>{
  const [c]=await tx`with clock as (select coalesce(${at?.toISOString()??null}::timestamptz,clock_timestamp()) instant)
    select c.*,instant,(instant at time zone 'Europe/Bucharest')::date::text as scheduled_day,
    extract(dow from instant at time zone 'Europe/Bucharest')::int weekday,
    (((instant at time zone 'Europe/Bucharest')::date+processing_time::time) at time zone 'Europe/Bucharest') due
    from app.collection_control c cross join clock where id=1 for update of c`;
  if(!c?.processing_enabled || (c.maintenance&&!c.collection_during_maintenance) || !c.processing_enabled_at) return null;
  const [due]=await tx`select ${c.due}::timestamptz<=${c.instant}::timestamptz and ${c.due}::timestamptz>=${c.processing_enabled_at}::timestamptz eligible`;
  if(!due?.eligible) return null;
  const [orphan]=await tx`select id from app.processing_runs where status='running' limit 1`;
  if(orphan)throw Error('An unfinished publication requires operator recovery');
  // A failed publication can leave historical core rows changed. Rebuild risk
  // once on the next scheduled day rather than reusing its old provenance.
  const scope=(c.maintenance&&c.collection_during_maintenance)||c.weekday===c.risk_weekday?'full':'daily';
  const [run]=await tx`insert into app.processing_runs(scheduled_day,scope,control_revision,before_control)
    values(${c.scheduled_day}::date,${scope},${c.revision+1},${JSON.stringify({paused:c.paused,revision:c.revision})}::jsonb)
    on conflict(scheduled_day) where trigger='scheduled' do nothing returning id,scope`;
  if(!run)return null;
  await tx`update app.collection_control set paused=true,maintenance=true,collection_during_maintenance=false,revision=revision+1,updated_at=clock_timestamp() where id=1`;
  await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after)
    values('system:processor','Procesare programată','processing-start',${JSON.stringify({paused:c.paused})}::jsonb,${JSON.stringify({runId:run.id,scope,maintenance:true})}::jsonb)`;
  return {id:String(run.id),scope:String(run.scope)};
 });
}

/** Explicit host invocation only. Never consumes or rewrites the scheduled run for today. */
export async function claimRepairProcessing(q: DbSql, repairId: string) {
 if(repairId!=='reference-import-v1')throw Error('Unknown manual repair');
 return q.begin(async tx=>{
  const [c]=await tx`select *, (clock_timestamp() at time zone 'Europe/Bucharest')::date::text as repair_day
    from app.collection_control where id=1 for update`;
  if(!c||c.maintenance)throw Error('An existing maintenance must be resolved first');
  if((await tx`select id from app.processing_runs where status='running' limit 1`).length)throw Error('An unfinished publication requires recovery');
  const [repair]=await tx`select status,scheduled_day from app.data_repairs where id=${repairId} for update`;
  if(repair?.status!=='scheduled'||repair.scheduled_day!==c.repair_day)throw Error('An explicit repair scheduled for today is required');
  const [run]=await tx`insert into app.processing_runs(scheduled_day,trigger,scope,control_revision,before_control)
    values(${c.repair_day}::date,'manual','full',${c.revision+1},${JSON.stringify({paused:c.paused,revision:c.revision,repairId})}::jsonb)
    returning id,scope`;
  await tx`update app.collection_control set paused=true,maintenance=true,collection_during_maintenance=false,revision=revision+1,updated_at=clock_timestamp() where id=1`;
  await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after)
    values('system:processor','Intervenție autorizată','processing-start',${JSON.stringify({paused:c.paused})}::jsonb,
      ${JSON.stringify({runId:run!.id,scope:'full',trigger:'manual',repairId,maintenance:true})}::jsonb)`;
  return {id:String(run!.id),scope:'full'};
 });
}

export async function processingStage(q:DbSql,id:string,stage:string) {
 const rows=await q`update app.processing_runs set
   stages=case when stage<>${stage} then stages||jsonb_build_object(stage,jsonb_build_object('startedAt',stage_started_at,'completedAt',clock_timestamp(),'durationMs',round(extract(epoch from(clock_timestamp()-stage_started_at))*1000))) else stages end,
   stage_started_at=case when stage<>${stage} then clock_timestamp() else stage_started_at end,
   stage=${stage},heartbeat_at=clock_timestamp() where id=${id}::uuid and status='running' returning id`;
 if(!rows.length)throw Error('Publication is no longer running');
}

export async function failProcessing(q:DbSql,id:string) {
 return q.begin(async tx=>{
  const [control]=await tx`select * from app.collection_control where id=1 for update`;
  const [run]=await tx`update app.processing_runs set status='failed',completed_at=clock_timestamp(),
    error='Procesarea s-a oprit. Mentenanța rămâne activă; verifică etapa și jurnalul de pe server înainte de recuperare.'
    where id=${id}::uuid and status='running' returning *`;
  if(!run)return;
  const [busy]=await tx`select (select count(*) from app.processing_runs where status='running')+
    (select count(*) from app.collection_requests where outcome='running')+
    (select count(*) from app.document_jobs where status='running')+
    (select count(*) from app.collection_tasks where status='running') n`;
  const rawCollection=!!run.raw_boundary&&!!run.stages?.['backup-verified']&&Number(busy?.n)===0&&control?.revision===run.control_revision;
  const paused=!rawCollection||!!run.before_control.paused||!!control?.blocked_reason;
  await tx`update app.collection_control set paused=${paused},maintenance=true,collection_during_maintenance=${rawCollection},revision=revision+1,updated_at=clock_timestamp() where id=1`;
  await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after)
    values('system:processor','Procesare programată','processing-failed','{}',${JSON.stringify({id:run.id,stage:run.stage,rawCollection,paused})}::jsonb)`;
 });
}

/** Reopen only the exact verified run; never overwrite later operator settings. */
export async function finishProcessing(q:DbSql,id:string) {
 return q.begin(async tx=>{
  const [c]=await tx`select * from app.collection_control where id=1 for update`;
  const [r]=await tx`select * from app.processing_runs where id=${id}::uuid for update`;
  const [latest]=await tx`select id,status from app.monitoring_refreshes order by version desc limit 1`;
  if(!r||r.status!=='running'||r.stage!=='reopen'||!r.search_verified||latest?.id!==r.checkpoint_id||latest?.status!=='ready'
     ||!c?.maintenance||!c.paused||c.revision!==r.control_revision)throw Error('Publication or operator state changed; maintenance retained');
  await processingStage(tx as unknown as DbSql,id,'complete');
  await tx`update app.processing_runs set status='ready',completed_at=clock_timestamp() where id=${id}::uuid`;
  await tx`update app.data_repairs set status='completed',completed_at=clock_timestamp()
    where processing_run_id=${id}::uuid and status='applied'`;
  // A source failure is independent of data publication. Keep its block and pause.
  await tx`update app.collection_control set maintenance=false,collection_during_maintenance=false,paused=${Boolean(r.before_control.paused)||!!c.blocked_reason},revision=revision+1,updated_at=clock_timestamp() where id=1`;
  await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after)
    values('system:processor','Procesare programată','processing-complete','{}',${JSON.stringify({runId:id,scope:r.scope})}::jsonb)`;
 });
}

/** Romanian wall-clock schedule, computed in PostgreSQL; one row/day handles DST repeats. */
export async function processingSchedule(q:DbSql) {
 const [schedule]=await q`with days as (
   select c.*,d::date as scheduled_day,((d::date+c.processing_time::time) at time zone 'Europe/Bucharest') as scheduled_at
   from app.collection_control c cross join generate_series((now() at time zone 'Europe/Bucharest')::date,
     (now() at time zone 'Europe/Bucharest')::date+8,interval '1 day') d where c.id=1
 ) select min(scheduled_at) filter(where processing_enabled and scheduled_at>=processing_enabled_at and not exists(select 1 from app.processing_runs r where r.scheduled_day=days.scheduled_day and r.trigger='scheduled')) next_at,
   min(scheduled_at) filter(where processing_enabled and ((maintenance and collection_during_maintenance) or extract(dow from scheduled_day)=risk_weekday) and scheduled_at>=processing_enabled_at and not exists(select 1 from app.processing_runs r where r.scheduled_day=days.scheduled_day and r.trigger='scheduled')) next_risk_at
   from days`;
 return schedule??{next_at:null,next_risk_at:null};
}
