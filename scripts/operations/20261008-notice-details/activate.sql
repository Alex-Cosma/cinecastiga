\set ON_ERROR_STOP on
-- Dated operation. Run only after deploying the notice detail graph and reviewing current state.
-- Required psql variables: pilot (true/false), revision (current collection_control revision).
begin;
set local statement_timeout='120s';
set local lock_timeout='5s';
create temporary table operation_mode as select :'pilot'::boolean pilot, :'revision'::bigint revision;
select id from app.collection_control where id=1 for update;
select id from app.collection_batches where id='recovery-2026-09-25' for update;
do $$begin
 if not exists(select 1 from app.collection_control c,operation_mode m where c.id=1 and c.revision=m.revision and not c.paused and c.maintenance and c.collection_during_maintenance and c.blocked_reason is null) then raise exception 'Control changed or maintenance collection is not authorized';end if;
 if exists(select 1 from app.processing_runs where status='running') or exists(select 1 from app.collection_tasks where status in ('pending','running')) then raise exception 'Processing/collection work is active; inspect before activation';end if;
 if not exists(select 1 from app.collection_proxy_control where enabled and requests_per_minute=200 and max_in_flight=10 and min_seconds=35 and max_seconds=45) then raise exception 'Proxy settings changed';end if;
end$$;
create temporary table detail_backfill on commit drop as
 select t.id,t.stream,r.id raw_id,r.payload from app.collection_tasks t
 cross join lateral (select id,payload from raw.raw_documents
  where source='elicitatie' and external_id=(case when t.stream='awards' then 'award:' else 'tender:' end)||(t.params->>'noticeId')
    and endpoint_version=(case when t.stream='awards' then 'award-list:v1' else 'tender-list:v1' end)
  order by id desc limit 1) r
 where t.batch_id='recovery-2026-09-25' and t.kind='detail' and t.status='deferred'
 and (not (select pilot from operation_mode) or (t.params->>'noticeId')::bigint=any(array[100212868,100004340,100029522,100245639,100245674,100245591,100659960,100632358,100658370,100659915,100659979,100659943]::bigint[]));
do $$declare expected int;begin
 select count(*) into expected from app.collection_tasks t where t.batch_id='recovery-2026-09-25' and kind='detail' and status='deferred'
 and (not (select pilot from operation_mode) or (t.params->>'noticeId')::bigint=any(array[100212868,100004340,100029522,100245639,100245674,100245591,100659960,100632358,100658370,100659915,100659979,100659943]::bigint[]));
 if expected=0 or (select count(*) from detail_backfill)<>expected then raise exception 'Missing source list metadata / operation already applied';end if;
 if (select pilot from operation_mode) and expected<>12 then raise exception 'Pilot must cover all 12 source types';end if;
 if exists(select 1 from detail_backfill d join app.collection_tasks t using(id) where
    (d.payload->>'sysNoticeVersionId')::int is distinct from 2 or
    not coalesce((d.payload->>'noticeId') ~ '^[1-9][0-9]*$',false) or
    coalesce(d.payload->>'caNoticeId',d.payload->>'cNoticeId') is distinct from t.params->>'noticeId' or
    not coalesce((d.payload->>'noticeNo') ~ '^[A-Z]*[0-9]+$',false) or
    not coalesce((d.payload->>'sysNoticeTypeId')::int=any(case when d.stream='awards' then array[3,8,13,16,18,20] else array[2,6,7,12,17,19] end),false)) then raise exception 'Source metadata not validated';end if;
end$$;
create temporary table before_retry as select t.id,t.params,t.error,t.status,r.timeouts,r.status retry_status,r.last_request_id,to_jsonb(r) retry_record
 from app.collection_tasks t left join app.collection_retries r on r.task_id=t.id
 where t.id=any(array[14560,79183,84685,88076,89249,105970,106064]::bigint[]);
update app.collection_tasks t set params=t.params||jsonb_build_object('noticeType',(d.payload->>'sysNoticeTypeId')::int,'noticeVersion',2,'internalNoticeId',(d.payload->>'noticeId')::bigint,'noticeNo',d.payload->>'noticeNo','metadataRawId',d.raw_id),
 status='pending',error=null,started_at=null,finished_at=null
 from detail_backfill d where d.id=t.id;
-- The three pagination failures were replayed against their archived response with current validation.
-- The other four are transport failures; old retry counters are retained in the audit below.
update app.collection_tasks set status='pending',error=null,started_at=null,finished_at=null,priority=0
 where id in (select id from before_retry where status='failed') and not (select pilot from operation_mode);
delete from app.collection_retries
 where task_id in (select id from before_retry where status='failed') and not (select pilot from operation_mode);
update app.collection_batches set status='collecting' where id='recovery-2026-09-25';
update app.collection_control set revision=revision+1,updated_at=clock_timestamp() where id=1;
insert into app.collection_audit(actor_id,actor_name,action,before,after)
 select 'system:notice-details-20261008','Operator — reluare autorizată 8 octombrie','notice-details-activation',
 jsonb_build_object('revision',m.revision,'pilot',m.pilot,'deferredDetails',(select count(*) from detail_backfill),'reviewedFailedTasks',(select jsonb_agg(b) from before_retry b)),
 jsonb_build_object('revision',m.revision+1,'detailsQueued',(select count(*) from detail_backfill),'failedTasksRequeued',case when m.pilot then 0 else (select count(*) from before_retry where status='failed') end,'sourceMetadata','latest archived public list; metadataRawId retained','maintenance',true,'processingStarted',false)
 from operation_mode m;
select stream,count(*) from detail_backfill group by stream;
commit;
