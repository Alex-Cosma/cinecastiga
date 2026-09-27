-- Explicit user authorization: retry failed task42952 once AFTER quiet-window deploy.
-- Guarded one-off; cannot be reapplied. Original attempt and task diagnosis retained.
\set ON_ERROR_STOP on
begin;
do $$
declare c app.collection_control%rowtype; t app.collection_tasks%rowtype; r app.collection_requests%rowtype;
begin
 if not pg_try_advisory_xact_lock(729114,4) then raise exception 'Source work is active'; end if;
 select * into strict c from app.collection_control where id=1 for update;
 select * into strict t from app.collection_tasks where id=42952 for update;
 select * into strict r from app.collection_requests where id=801;
 if c.revision<>11 or c.maintenance or c.paused or c.paused_streams<>'[]'::jsonb
    or c.min_seconds<>50 or c.max_seconds<>70
    or c.blocked_reason is distinct from 'Eroare de transport. Verifică jurnalul înainte de reluare.'
    or c.blocked_until>clock_timestamp()
    or t.status<>'failed' or t.stream<>'awards' or t.kind<>'contracts'
    or r.outcome<>'failed' or r.diagnostics->>'abortReason' is distinct from 'request_timeout'
    or r.diagnostics->'context'->>'taskId' is distinct from '42952'
    then raise exception 'Operator/task/diagnostic state changed'; end if;
 if (select max(id) from app.collection_requests)<>801
    or exists(select 1 from app.collection_requests where outcome='running')
    or exists(select 1 from app.collection_tasks where status='running')
    or exists(select 1 from app.document_jobs where status='running')
    or not exists(select 1 from app.collection_batches where id=t.batch_id and status='collecting')
    then raise exception 'Source boundary changed'; end if;
 insert into app.collection_audit(actor_id,actor_name,action,before,after)
 values('operator:codex','Reîncercare unică autorizată după timeoutul cererii 801','retry-task',
   jsonb_build_object('taskId',t.id,'task',to_jsonb(t),'requestId',r.id,'request',to_jsonb(r)),
   jsonb_build_object('status','pending','reason','User explicitly authorized one retry after quiet-window deployment; further failure stops collection; 50–70 second pacing retained'));
 -- Prioritize this exact retry; ordinary round-robin collection resumes after it.
 update app.collection_tasks set status='pending',started_at=null,finished_at=null,error=null,
   priority=(select least(t.priority,coalesce(min(priority),t.priority))-1 from app.collection_tasks where batch_id=t.batch_id and stream=t.stream and status='pending')
 where id=t.id;
 update app.collection_batches set next_stream=2 where id=t.batch_id;
 update app.collection_control set blocked_reason=null,blocked_until=null,
   next_allowed_at=greatest(next_allowed_at,clock_timestamp()+max_seconds*interval '1 second'),
   revision=revision+1,updated_at=clock_timestamp() where id=1;
end $$;
commit;
