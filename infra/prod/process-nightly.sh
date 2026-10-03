#!/usr/bin/env bash
# Invoked once/minute by seap's crontab. PostgreSQL decides the Romanian local
# schedule and records one attempt/day. No source HTTP requests in this runner.
set -Eeuo pipefail
umask 077
cd "${SEAP_DEPLOY_CHECKOUT:-/srv/seap/src}"
exec 9>.git/deploy.lock
flock -n 9 || exit 0
cd infra/prod
# These commands never consume input; do not let Compose eat a caller's SSH
# script and silently skip the commands following this runner.
run() { docker compose --profile processing run --rm --no-deps -T processor node apps/ingestion/dist/scripts/processing.js "$@" </dev/null; }
run_id=$(run claim)
[[ -n "$run_id" ]] || exit 0
[[ "$run_id" =~ ^[a-f0-9-]{36}$ ]] || exit 1
failed() { trap - ERR INT TERM; run fail "$run_id" || true; echo "Publication failed; maintenance retained: $run_id"; exit 1; }
trap failed ERR INT TERM
root="${SEAP_PROCESSING_BACKUPS:-/srv/seap/backups/processing}"
mkdir -p "$root/$run_id"
exec >>"$root/$run_id/run.log" 2>&1
# Keep backup/drain stages observable too. The heartbeat child closes the deploy
# lock descriptor, and exits if its parent disappears; it cannot prolong a lock.
(
 exec 9>&-
 while kill -0 "$$" 2>/dev/null; do
  docker exec cinecastiga-postgres-1 psql -X -U seap -d seap -c "update app.processing_runs set heartbeat_at=clock_timestamp() where id='$run_id'::uuid and status='running'" >/dev/null 2>&1 || true
  sleep 10
 done
) &
heartbeat_pid=$!
trap 'kill "$heartbeat_pid" 2>/dev/null || true' EXIT
date -u '+started=%FT%TZ'
test "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/domenii)" = 503
collection_active=false
for container in $(docker compose --profile collection ps --status running -q collection); do
 if [[ "$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.oneoff" }}' "$container")" == False ]]; then collection_active=true; fi
done
# Maintenance blocks new work. Let already-running work finish BEFORE SIGTERM:
# the document worker deliberately aborts its current OCR/download on SIGTERM.
# Its own deadline is 20 minutes; this bound leaves room for final persistence.
for attempt in $(seq 1 150); do
 pending=$(docker exec cinecastiga-postgres-1 psql -X -v ON_ERROR_STOP=1 -U seap -d seap -Atc "select (select count(*) from app.collection_requests where outcome='running')+(select count(*) from app.collection_tasks where status='running')+(select count(*) from app.document_jobs where status='running')")
 [[ "$pending" =~ ^[0-9]+$ ]]
 [[ "$pending" == 0 ]] && break
 sleep 10
done
test "$pending" = 0
docker compose --profile collection stop collection documents
run freeze "$run_id"
run stage "$run_id" backup
test "$(df -Pk "$root" | awk 'NR==2 {print $4}')" -ge 20971520
# Fresh, private full backup. An incomplete .partial file is never a restore point.
docker exec cinecastiga-postgres-1 pg_dump -U seap -d seap -Fc > "$root/$run_id/database.dump.partial"
mv "$root/$run_id/database.dump.partial" "$root/$run_id/database.dump"
docker exec -i cinecastiga-postgres-1 pg_restore --list < "$root/$run_id/database.dump" > "$root/$run_id/database.list"
sha256sum "$root/$run_id/database.dump" > "$root/$run_id/database.sha256"
run stage "$run_id" backup-verified
run refresh "$run_id"
run stage "$run_id" restart
# Clear Next server caches before reopening; source workers restart while paused.
docker compose restart web
docker compose up -d --no-deps documents
if [[ "$collection_active" == true ]]; then docker compose --profile collection up -d --no-deps collection; fi
for attempt in $(seq 1 40); do
 if [[ "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/api/health || true)" == 200 ]]; then break; fi
 sleep 3
done
test "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/api/health)" = 200
run stage "$run_id" reopen
run finish "$run_id"
date -u '+completed=%FT%TZ'
# Keep fourteen successful scheduled restore points. Failed runs and the dated
# TED/benchmark backups outside this directory are never removed.
python3 ./retain-processing-backups.py "$root" || echo 'Backup retention needs operator attention.'
