-- Reviewed internal failure before source admission; no HTTP request for task36017.
-- Apply only after the fixed collector release is running. Preserve the original
-- task/error and PostgreSQL diagnosis in the audit; keep the shared request pace.
\set ON_ERROR_STOP on
begin;
do $$
declare c app.collection_control%rowtype; t app.collection_tasks%rowtype;
begin
 if not pg_try_advisory_xact_lock(729114,4) then raise exception 'Source work is active'; end if;
 select * into strict c from app.collection_control where id=1 for update;
 select * into strict t from app.collection_tasks where id=36017 for update;
 if c.revision<>10 or c.maintenance or c.paused or not c.processing_enabled
    or c.min_seconds<>50 or c.max_seconds<>70
    or c.blocked_reason is distinct from 'Sarcina 36017: Cererea sau arhivarea nu a fost confirmată. Verifică jurnalul înainte de reluare.'
    or t.status<>'failed' then raise exception 'Operator/task state changed'; end if;
 if (select max(id) from app.collection_requests)<>776
    or exists(select 1 from app.collection_requests where outcome='running' or diagnostics->'context'->>'taskId'='36017')
    or exists(select 1 from app.collection_tasks where status='running')
    or c.blocked_until>clock_timestamp() then raise exception 'Source boundary changed'; end if;
 insert into app.collection_audit(actor_id,actor_name,action,before,after)
 values('operator:codex','Reluare după corectarea interogării și verificarea PostgreSQL','retry-task',
   jsonb_build_object('taskId',t.id,'task',to_jsonb(t),'requestId',null,'exception',
     jsonb_build_object('sqlstate','0A000','message','cached plan must not change result type','observedAt','2026-09-27T16:21:52.461Z','source','PostgreSQL container log')),
   jsonb_build_object('status','pending','reason','Explicitly reviewed internal pre-request schema failure; stable projection deployed; shared pacing retained'));
 update app.collection_tasks set status='pending',started_at=null,finished_at=null,error=null where id=t.id;
 update app.collection_control set blocked_reason=null,blocked_until=null,
   next_allowed_at=greatest(next_allowed_at,clock_timestamp()+max_seconds*interval '1 second'),
   revision=revision+1,updated_at=clock_timestamp() where id=1;
end $$;
commit;
