#!/usr/bin/env bash
# Authorized once: apply only after the isolated full repair has passed validation.
set -euo pipefail
umask 077
exec 9>/srv/seap/backups/ted-live-repair-20260927.lock
flock -n 9 || exit 1
report_dir=/srv/seap/backups/ted-repair-20260927
while [ ! -f "$report_dir/clone-validated" ]; do
 if [ -f "$report_dir/clone-failed" ]; then echo 'Clone repair failed; production left unchanged.'; exit 1; fi
 sleep 20
done
python3 - "$report_dir/clone-validation.json" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]))
assert r['notices']==161633 and r['pending']==0 and r['links']>0 and r['competition']>0
assert r['checkpoint']['status']=='ready' and all(c['passed'] for c in r['checkpoint']['validation']['checks'])
PY
# Serialize the entire publication with deployments; public serving stays gated on error.
exec 8>/srv/seap/src/.git/deploy.lock
flock 8
cd /srv/seap/src/infra/prod
test ! -f "$report_dir/live-ready"
live_started=false
on_error() {
 if [ "$live_started" = true ]; then
  docker exec cinecastiga-postgres-1 psql -v ON_ERROR_STOP=1 -X -U seap -d seap -c "update app.collection_control set paused=true,maintenance=true,revision=revision+1,updated_at=clock_timestamp() where id=1" || true
  echo 'Publication failed; maintenance retained/re-enabled. Inspect the stage log.'
 fi
 date -u '+live_repair_failed=%Y-%m-%dT%H:%M:%SZ'
 touch "$report_dir/live-failed"
}
trap on_error ERR
# A user change since authorization prevents a surprise maintenance start.
started=$(docker exec -i cinecastiga-postgres-1 psql -v ON_ERROR_STOP=1 -X -U seap -d seap -At <<'SQL'
with previous as materialized(select * from app.collection_control where id=1 for update), changed as (
 update app.collection_control c set paused=true,maintenance=true,revision=c.revision+1,updated_at=clock_timestamp()
 from previous p where c.id=p.id and p.revision=7 and not p.paused and not p.maintenance and p.blocked_reason is null
 returning c.*
), audited as (
 insert into app.collection_audit(actor_id,actor_name,action,before,after)
 select 'operator:codex','Reparare TED autorizată după validarea copiei','ted-repair-start',to_jsonb(p),to_jsonb(c)
 from previous p,changed c returning id
) select count(*) from audited;
SQL
)
if [ "$started" != 1 ]; then echo 'Operator state changed; production repair was not started.'; touch "$report_dir/live-not-started"; exit 1; fi
live_started=true
date -u '+live_maintenance_start=%Y-%m-%dT%H:%M:%SZ'
test "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/domenii)" = 503
test "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/api/health)" = 200
docker compose --profile collection stop collection documents
remaining=$(docker exec cinecastiga-postgres-1 psql -X -U seap -d seap -Atc "select (select count(*) from app.collection_requests where outcome='running')+(select count(*) from app.collection_tasks where status='running')")
test "$remaining" = 0
docker exec cinecastiga-postgres-1 psql -X -U seap -d seap -Atc "select jsonb_build_object('rawMax',(select max(id) from raw.raw_documents),'requests',(select max(id) from app.collection_requests),'control',(select row_to_json(c) from app.collection_control c))" > "$report_dir/live-boundary.json"
backup=/srv/seap/backups/pre-ted-repair-20260927.dump
test ! -e "$backup"
date -u '+live_backup_start=%Y-%m-%dT%H:%M:%SZ'
docker exec cinecastiga-postgres-1 pg_dump -U seap -d seap -Fc > "$backup.partial"
mv "$backup.partial" "$backup"
docker exec -i cinecastiga-postgres-1 pg_restore --list < "$backup" > "$backup.list"
sha256sum "$backup" > "$backup.sha256"
date -u '+live_backup_complete=%Y-%m-%dT%H:%M:%SZ'
# This dedicated staging schema is absent in live production before this one-off.
docker exec cinecastiga-postgres-1 psql -v ON_ERROR_STOP=1 -X -U seap -d seap -c 'create schema repair_20260927; create table repair_20260927.ted_raw (like raw.raw_documents including constraints);'
echo '70bd913b219b8e44757f9b7becf9df1370c04960d9cd0d80ea16f4846eeb332b  /srv/seap/backups/ted-raw.copy.gz' | sha256sum -c -
gzip -dc /srv/seap/backups/ted-raw.copy.gz | docker exec -i cinecastiga-postgres-1 psql -v ON_ERROR_STOP=1 -X -U seap -d seap -c 'copy repair_20260927.ted_raw(id,source,external_id,endpoint_version,content_hash,payload,fetched_at) from stdin with (format binary)'
docker exec -i cinecastiga-postgres-1 psql -v ON_ERROR_STOP=1 -X -U seap -d seap < /srv/seap/backups/restore-ted-archive-20260927.sql
run_live() {
 docker compose -f docker-compose.yml -f /srv/seap/backups/ted-repair.compose.yml --profile collection run --rm --no-deps -T --name cinecastiga-ted-live-repair -e TED_REPAIR_APPLY=20260927 -v /srv/seap/backups/ted-live-command.mjs:/app/apps/ingestion/dist/scripts/ted-live-command.mjs:ro collection node apps/ingestion/dist/scripts/ted-live-command.mjs "$@"
}
date -u '+live_replay_start=%Y-%m-%dT%H:%M:%SZ'
run_live replay-ted --apply --limit 100000 --concurrency 4
run_live replay-ted --apply --limit 100000 --concurrency 4
test "$(docker exec cinecastiga-postgres-1 psql -X -U seap -d seap -Atc 'select count(*) from core.ted_notices where normalization_version is distinct from 2')" = 0
docker exec -i cinecastiga-postgres-1 psql -v ON_ERROR_STOP=1 -X -U seap -d seap < /srv/seap/backups/all-signatures.sql > "$report_dir/live-all-signatures.csv"
cmp /srv/seap/backups/local-all-signatures.csv "$report_dir/live-all-signatures.csv"
date -u '+live_replay_complete=%Y-%m-%dT%H:%M:%SZ'
run_live seed-legal-eras
run_live monitoring-refresh --run
run_live index-search
# Search and full data checks have passed. Clear cached application queries before reopening.
docker compose restart web
docker compose --profile collection up -d --no-deps collection documents
for attempt in $(seq 1 40); do
 if [ "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/api/health || true)" = 200 ]; then break; fi
 sleep 3
done
test "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/api/health)" = 200
# Preserve a later administrator pause/settings change instead of overriding it.
reopened=$(docker exec -i cinecastiga-postgres-1 psql -v ON_ERROR_STOP=1 -X -U seap -d seap -At <<'SQL'
with previous as materialized(select * from app.collection_control where id=1 for update), changed as (
 update app.collection_control c set maintenance=false,paused=false,revision=c.revision+1,updated_at=clock_timestamp()
 from previous p where c.id=p.id and p.revision=8 and p.paused and p.maintenance and p.blocked_reason is null
 and (select status from app.monitoring_refreshes order by version desc limit 1)='ready'
 and not exists(select 1 from core.ted_notices where normalization_version is distinct from 2)
 returning c.*
), audited as (
 insert into app.collection_audit(actor_id,actor_name,action,before,after)
 select 'operator:codex','Reparare TED verificată și publicată','ted-repair-complete',to_jsonb(p),to_jsonb(c)
 from previous p,changed c returning id
) select count(*) from audited;
SQL
)
test "$reopened" = 1
test "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/domenii)" = 200
docker exec cinecastiga-postgres-1 psql -X -U seap -d seap -Atc "select jsonb_build_object('notices',(select count(*) from core.ted_notices),'pending',(select count(*) from core.ted_notices where normalization_version is distinct from 2),'links',(select count(*) from core.award_links),'competition',(select count(*) from marts.contract_competition),'checkpoint',(select row_to_json(r) from (select version,status,completed_at,validation from app.monitoring_refreshes order by version desc limit 1) r))" > "$report_dir/live-validation.json"
date -u '+live_repair_complete=%Y-%m-%dT%H:%M:%SZ'
touch "$report_dir/live-ready"
