-- Apply only after the full-data rehearsal report passes and the disabled host
-- scheduler has demonstrated a heartbeat. Does not change crawl/source controls.
\set ON_ERROR_STOP on
begin;
do $$
declare
  before_row app.collection_control%rowtype;
  after_row app.collection_control%rowtype;
  latest app.monitoring_refreshes%rowtype;
begin
  select * into strict before_row from app.collection_control where id=1 for update;
  if before_row.processing_enabled or before_row.maintenance then
    raise exception 'Expected inactive schedule and available site';
  end if;
  if exists(select 1 from app.processing_runs where status='running') then
    raise exception 'A publication is already running';
  end if;
  select * into strict latest from app.monitoring_refreshes order by version desc limit 1;
  if latest.status <> 'ready' or latest.kind <> 'coordinated'
     or coalesce(jsonb_array_length(latest.validation->'checks'),0) <> 10
     or exists(select 1 from jsonb_array_elements(latest.validation->'checks') c where (c->>'passed')::boolean is distinct from true) then
    raise exception 'A fully verified live publication is required';
  end if;
  if not exists(select 1 from app.collection_workers where id='nightly-scheduler'
                and kind='scheduler' and heartbeat_at > clock_timestamp()-interval '2 minutes') then
    raise exception 'Disabled scheduler heartbeat required';
  end if;
  update app.collection_control set processing_enabled=true,
    processing_enabled_at=clock_timestamp(),processing_time='05:00',risk_weekday=0,
    revision=revision+1,updated_at=clock_timestamp() where id=1 returning * into after_row;
  insert into app.collection_audit(actor_id,actor_name,action,before,after)
    values('operator:codex','Program zilnic și duminical autorizat după validare','settings',jsonb_build_object('minSeconds',before_row.min_seconds,'maxSeconds',before_row.max_seconds,'dailyLimit',before_row.daily_limit,'processingTime',before_row.processing_time,'processingEnabled',before_row.processing_enabled,'riskWeekday',before_row.risk_weekday,'paused',before_row.paused,'pausedStreams',before_row.paused_streams,'blockedReason',before_row.blocked_reason,'revision',before_row.revision),jsonb_build_object('minSeconds',after_row.min_seconds,'maxSeconds',after_row.max_seconds,'dailyLimit',after_row.daily_limit,'processingTime',after_row.processing_time,'processingEnabled',after_row.processing_enabled,'riskWeekday',after_row.risk_weekday,'paused',after_row.paused,'pausedStreams',after_row.paused_streams,'blockedReason',after_row.blocked_reason,'revision',after_row.revision));
end $$;
commit;
