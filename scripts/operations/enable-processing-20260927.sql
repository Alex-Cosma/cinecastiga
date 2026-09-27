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
    values('operator:codex','Program zilnic și duminical autorizat după validare','settings',to_jsonb(before_row),to_jsonb(after_row));
end $$;
commit;
