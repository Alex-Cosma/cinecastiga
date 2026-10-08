\set ON_ERROR_STOP on
-- One-time recovery only after deploying whole-inventory validation.
-- Required psql variable: revision. Existing collection may continue.
begin;
set local statement_timeout='20s';
set local lock_timeout='5s';
select id from app.collection_control where id=1 and revision=:'revision'::bigint for update;
create temporary table expected_revision as select :'revision'::bigint revision;
do $$begin
 if not exists(select 1 from app.collection_control c,expected_revision e where c.id=1 and c.revision=e.revision and not c.paused and c.blocked_reason is null and c.maintenance and c.collection_during_maintenance) then raise exception 'Control changed';end if;
 if exists(select 1 from app.processing_runs where status='running') then raise exception 'Processing active';end if;
end$$;
create temporary table replay on commit drop as
 select t.id,r.id request_id,t.error from app.collection_tasks t
 join lateral(select id,status,diagnostics->'taskFailure'->'response' response from app.collection_requests where diagnostics->'context'->>'taskId'=t.id::text order by id desc limit 1) r on true
 where t.batch_id='recovery-2026-09-25' and t.kind='detail' and t.stream='awards' and t.status='failed'
 and t.params->>'part'='lots' and t.params->>'page'='0' and t.error='Detaliu SEAP: paginarea loturilor nu se reconciliază.'
 and r.status=200 and jsonb_typeof(r.response->'items')='array' and jsonb_typeof(r.response->'total')='number'
 and (r.response->>'total')::int>100 and jsonb_array_length(r.response->'items')=(r.response->>'total')::int
 and (select count(distinct coalesce(i->>'noticeLotID',i->>'noticeLotId')) from jsonb_array_elements(r.response->'items') i)=(r.response->>'total')::int;
do $$begin if not exists(select 1 from replay) then raise exception 'No matching reviewed failures';end if;end$$;
update app.collection_tasks t set status='pending',error=null,started_at=null,finished_at=null from replay r where t.id=r.id;
update app.collection_control set revision=revision+1,updated_at=clock_timestamp() where id=1;
insert into app.collection_audit(actor_id,actor_name,action,before,after)
 select 'system:notice-details-20261008','Operator — inventare complete de loturi','requeue-whole-lot-inventories',
 jsonb_build_object('reviewed_tasks',(select jsonb_agg(r) from replay r),'revision',e.revision),jsonb_build_object('revision',e.revision+1,'requeued',(select count(*) from replay),'shared_settings_unchanged',true) from expected_revision e;
select count(*) requeued from replay;
commit;
