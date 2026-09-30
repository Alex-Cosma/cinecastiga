#!/usr/bin/env bash
# One-off, explicitly authorized September 30 calendar transition. Not a cron job.
# prepare <old SHA>: gate/drain/backup BEFORE the ordinary CI deploy.
# publish <new SHA>: full refresh/search AFTER CI deploy; remains gated on failure.
# reopen <new SHA>: only after review of the validated report and public health.
set -Eeuo pipefail
umask 077
phase=${1:?prepare, publish or reopen required}
sha=${2:?pinned checkout SHA required}
[[ "$sha" =~ ^[a-f0-9]{40}$ ]]
[[ "$phase" =~ ^(prepare|publish|reopen)$ ]]
root=/srv/seap/backups/calendar-release-20260930
cd /srv/seap/src
exec 9>.git/deploy.lock
flock -n 9
test "$(git rev-parse HEAD)" = "$sha"
test -z "$(git status --porcelain)"
cd infra/prod
sql() { docker exec -i cinecastiga-postgres-1 psql -X -qAt -v ON_ERROR_STOP=1 -U seap -d seap "$@"; }
if [[ "$phase" == prepare ]]; then
 test ! -e "$root"
 mkdir -m 700 "$root"
 exec >>"$root/prepare.log" 2>&1
 date -u '+prepare_started=%FT%TZ'
 # The inspected revision is pinned. Never clear an unrelated operator/source block.
 sql >"$root/before.json" <<'SQL'
BEGIN;
SELECT pg_advisory_xact_lock(20260930,1);
DO $$ BEGIN
 PERFORM 1 FROM app.collection_control WHERE id=1 AND revision=20 AND NOT paused AND NOT maintenance AND blocked_reason IS NULL FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM app.processing_runs WHERE status='running') THEN RAISE EXCEPTION 'Control changed or processing active'; END IF;
END $$;
SELECT row_to_json(c) FROM app.collection_control c WHERE id=1;
UPDATE app.collection_control SET paused=true,maintenance=true,revision=revision+1,updated_at=clock_timestamp() WHERE id=1;
INSERT INTO app.collection_audit(actor_id,actor_name,action,before,after) VALUES('operator:codex','Publicare autorizată calendar rf-2026.6','calendar-release-start','{"revision":20,"paused":false,"maintenance":false}','{"revision":21,"paused":true,"maintenance":true}');
COMMIT;
SQL
 test "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/domenii)" = 503
 for attempt in $(seq 1 150); do
  pending=$(sql -c "select (select count(*) from app.collection_requests where outcome='running')+(select count(*) from app.collection_tasks where status='running')+(select count(*) from app.document_jobs where status='running')")
  [[ "$pending" == 0 ]] && break
  sleep 10
 done
 test "$pending" = 0
 # Keep workers alive but gated so the deploy retains the existing active profiles.
 sql -c "select json_build_object('rawBoundary',(select coalesce(max(id),0)::text from raw.raw_documents),'lastRequest',(select coalesce(max(id),0)::text from app.collection_requests),'previousCheckpoint',(select id from app.monitoring_refreshes order by version desc limit 1),'revision',21)" >"$root/boundary.json"
 test "$(df -Pk "$root" | awk 'NR==2 {print $4}')" -ge 20971520
 docker exec cinecastiga-postgres-1 pg_dump -U seap -d seap -Fc >"$root/database.dump.partial"
 mv "$root/database.dump.partial" "$root/database.dump"
 docker exec -i cinecastiga-postgres-1 pg_restore --list <"$root/database.dump" >"$root/database.list"
 sha256sum "$root/database.dump" >"$root/database.sha256"
 date -u '+backup_complete=%FT%TZ'
 touch "$root/prepared"
elif [[ "$phase" == publish ]]; then
 test -f "$root/prepared"
 test ! -e "$root/report.json"
 exec >>"$root/publish.log" 2>&1
 trap 'echo "Publication stopped; maintenance retained."; touch "$root/failed"' ERR
 sha256sum -c "$root/database.sha256"
 docker compose --profile collection stop collection documents
 date -u '+processing_started=%FT%TZ'
 docker compose --profile processing run --rm --no-deps -T --user 0:0 \
  --name cinecastiga-calendar-release-20260930 \
  -e CALENDAR_RELEASE_APPLY=20260930 \
  -v /srv/seap/src/scripts/operations/calendar-release-20260930.mjs:/app/apps/ingestion/dist/scripts/calendar-release-20260930.mjs:ro \
  -v "$root:/reports" processor node apps/ingestion/dist/scripts/calendar-release-20260930.mjs </dev/null
 date -u '+processing_complete=%FT%TZ'
 touch "$root/validated"
else
 test -f "$root/validated"
 test ! -e "$root/reopened"
 docker compose restart web
 docker compose --profile collection up -d --no-deps documents collection
 for attempt in $(seq 1 40); do
  [[ "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/api/health || true)" == 200 ]] && break
  sleep 3
 done
 test "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/api/health)" = 200
 docker compose --profile processing run --rm --no-deps -T --user 0:0 \
  -e CALENDAR_RELEASE_APPLY=20260930 \
  -v /srv/seap/src/scripts/operations/calendar-release-20260930.mjs:/app/apps/ingestion/dist/scripts/calendar-release-20260930.mjs:ro \
  -v "$root:/reports" processor node apps/ingestion/dist/scripts/calendar-release-20260930.mjs reopen </dev/null
 touch "$root/reopened"
fi
