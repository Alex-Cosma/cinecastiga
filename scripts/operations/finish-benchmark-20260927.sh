#!/usr/bin/env bash
# One-off completion handler for the isolated September 27 measurement.
# Never publishes the clone. Any operator state change prevents automatic resume.
set -euo pipefail
umask 077
exec 9>/srv/seap/backups/benchmark-20260927-finish.lock
flock -n 9 || exit 1
report=/srv/seap/backups/benchmark-20260927/benchmark.json
completion=/srv/seap/backups/benchmark-20260927/completion.json
while ! python3 - "$report" <<'PY'
import json,sys
try:
    r=json.load(open(sys.argv[1]))
    ready=r.get('database')=='seap_benchmark_20260927' and bool(r.get('finishedAt')) and r.get('status') in ('validated','validation_failed','failed')
except (OSError,ValueError):
    ready=False
sys.exit(0 if ready else 1)
PY
 do sleep 15; done
# The report is written just before the database connection closes.
while [ "$(docker inspect --format '{{.State.Running}}' cinecastiga-benchmark-20260927 2>/dev/null || true)" = true ]; do sleep 5; done
python3 - "$report" "$completion" <<'PY'
import json,sys,datetime
r=json.load(open(sys.argv[1]))
c={'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'benchmarkStatus':r['status'],'recalculationMs':r.get('recalculationMs'),'publication':'none; isolated clone only','collectionResume':'checking operator guard'}
with open(sys.argv[2],'w') as f: json.dump(c,f,indent=2)
print(json.dumps(c))
PY
exec 8>/srv/seap/src/.git/deploy.lock
flock 8
cd /srv/seap/src/infra/prod
# Read-only preflight, repeated under a row lock in the atomic resume below.
check_sql="select count(*) from app.collection_control where id=1 and revision=6 and paused and not maintenance and blocked_reason is null and min_seconds=50 and max_seconds=70 and paused_streams='[]'::jsonb and (select max(id) from app.collection_requests)=379 and not exists(select 1 from app.collection_requests where outcome='running') and not exists(select 1 from app.collection_tasks where status='running') and (select max(id) from app.collection_audit)=6"
if [ "$(docker exec cinecastiga-postgres-1 psql -X -U seap -d seap -Atc "$check_sql")" = 1 ]; then
 docker compose --profile collection --profile documents up -d --no-deps collection documents
 resumed=$(docker exec -i cinecastiga-postgres-1 psql -v ON_ERROR_STOP=1 -X -U seap -d seap -At <<'SQL'
with previous as materialized (
 select * from app.collection_control where id=1 for update
), changed as (
 update app.collection_control c set paused=false,revision=c.revision+1,updated_at=clock_timestamp()
 from previous p where c.id=p.id and p.revision=6 and p.paused and not p.maintenance and p.blocked_reason is null
 and p.min_seconds=50 and p.max_seconds=70 and p.paused_streams='[]'::jsonb
 and (select max(id) from app.collection_requests)=379
 and not exists(select 1 from app.collection_requests where outcome='running')
 and not exists(select 1 from app.collection_tasks where status='running')
 and (select max(id) from app.collection_audit)=6
 returning c.*
), audited as (
 insert into app.collection_audit(actor_id,actor_name,action,before,after)
 select 'operator:codex','Reluare după măsurătoarea izolată din 27 septembrie','pause',to_jsonb(p),to_jsonb(c)||jsonb_build_object('reason','Isolated benchmark finished; no live publication; retain common 50–70 second budget')
 from previous p,changed c returning id
) select count(*) from audited;
SQL
 )
else resumed=0; fi
flock -u 8
python3 - "$completion" "$resumed" <<'PY'
import json,sys,datetime
p=sys.argv[1];c=json.load(open(p))
c['collectionResume']='resumed' if sys.argv[2]=='1' else 'not resumed: operator state changed or safety guard failed'
c['collectionResumeCheckedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
with open(p,'w') as f:json.dump(c,f,indent=2)
print(json.dumps(c))
PY
# Save the first ordinary post-resume attempt, without causing a probe request.
if [ "$resumed" = 1 ]; then
 for attempt in $(seq 1 30); do
  observed=$(docker exec cinecastiga-postgres-1 psql -X -U seap -d seap -Atc "select coalesce((select row_to_json(r)::text from (select id,stream,method,endpoint,status,outcome,records,started_at,finished_at,diagnostics is not null has_diagnostics from app.collection_requests where id>379 and finished_at is not null order by id limit 1) r),'')")
  if [ -n "$observed" ]; then printf '%s\n' "$observed" > /srv/seap/backups/benchmark-20260927/first-resumed-request.json; printf '%s\n' "$observed"; exit 0; fi
  sleep 10
 done
 echo 'No completed ordinary request observed within five minutes; inspect collector status.'
fi
