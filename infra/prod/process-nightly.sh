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
# Blue/green (owner, 9 November 2026): the shadow build's processor, as the build role, every connection rewritten
# to core_next / marts_next / reference_next (docker-compose.yml, processor-build).
run_build() { docker compose --profile processing run --rm --no-deps -T processor-build node apps/ingestion/dist/scripts/processing.js "$@" </dev/null; }
pg() { docker exec cinecastiga-postgres-1 psql -X -v ON_ERROR_STOP=1 -U seap -d seap -Atc "$1"; }
case "${1:-}" in
 "") run_id=$(run claim);;
 --reference-repair-now) run_id=$(run claim-repair reference-import-v1);;
 # Operator-authorized retry of the latest failed publication (full scope).
 --recover-failed) [[ "${2:-}" =~ ^[a-f0-9-]{36}$ ]] || exit 2; run_id=$(run claim-recovery "$2");;
 # Operator-authorized full publication right after a new signals methodology (refused otherwise).
 --methodology-now) run_id=$(run claim-methodology);;
 # Operator only, with the owner's consent: yesterday's publication back (blue/green), until the next build. Refused
 # after a deploy that changed the schemas' structure is not checked here: read docs/handover/05-operations.md first.
 --rollback) run rollback; docker compose restart web; echo "rolled back $(date -u +%FT%TZ)"; exit 0;;
 *) echo 'Unsupported processing invocation' >&2; exit 2;;
esac
[[ -n "$run_id" ]] || exit 0
[[ "$run_id" =~ ^[a-f0-9-]{36}$ ]] || exit 1
mode=in-place
failed() {
 trap - ERR INT TERM
 run fail "$run_id" || true
 if [[ "$mode" == shadow ]]; then
  # Nothing live changed: the site keeps the previous publication; collection resumes unless paused or blocked.
  if [[ "${collection_active:-false}" == true ]] && [[ "$(pg "select not paused and blocked_reason is null from app.collection_control where id=1" || true)" == t ]]; then
   docker compose --profile collection up -d --no-deps collection || true
  fi
  echo "Shadow build failed; the site keeps the previous publication: $run_id"
  exit 1
 fi
 # Only resume the archive collector after the DB gate verified backup, no
 # remaining work, and unchanged operator control. Documents/public site stay shut.
 if [[ "${collection_active:-false}" == true ]] && [[ "$(docker exec cinecastiga-postgres-1 psql -X -U seap -d seap -Atc "select maintenance and collection_during_maintenance and not paused and blocked_reason is null from app.collection_control where id=1" || true)" == t ]]; then
  docker compose --profile collection up -d --no-deps collection || true
 fi
 echo "Publication failed; maintenance retained: $run_id"
 exit 1
}
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
# Readers keep the site during drain and backup (owner decision, 23 October 2026);
# it closes at backup-verified, asserted below before any data changes. A run
# claimed on an already closed site (recovery, after a failure) stays closed.
echo "public_status_at_claim=$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/domenii || true)"
collection_active=false
for container in $(docker compose --profile collection ps --status running -q collection); do
 if [[ "$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.oneoff" }}' "$container")" == False ]]; then collection_active=true; fi
done
mode=$(pg "select mode from app.processing_runs where id='$run_id'::uuid")
# `false`, not a failed [[ ]]: errexit and the ERR trap catch it in every bash version.
case "$mode" in shadow|in-place) ;; *) echo "unknown processing mode: $mode"; false;; esac
echo "mode=$mode"
# Fresh, private full backup: custom format, zstd level 1 (restore needs pg_restore
# 16+). The SHA-256 comes from the same stream tee writes, so the file is not read
# again; pipefail fails the backup if pg_dump, tee or sha256sum fails. An
# incomplete .partial file is never a restore point. The drawers' stored search
# text is derived and rebuilt after every run (below): its rows stay out (~3.7 GB,
# and a restore would rebuild its trigram index); restored, it is not ready.
backup() {
 run stage "$run_id" backup
 test "$(df -Pk "$root" | awk 'NR==2 {print $4}')" -ge 20971520
 dump="$root/$run_id/database.dump"
 docker exec cinecastiga-postgres-1 pg_dump -U seap -d seap -Fc --compress=zstd:1 --exclude-table-data=marts.source_search | tee "$dump.partial" | sha256sum > "$root/$run_id/database.sha256.partial"
 read -r digest _ < "$root/$run_id/database.sha256.partial"
 [[ "$digest" =~ ^[0-9a-f]{64}$ ]]
 mv "$dump.partial" "$dump"
 docker exec -i cinecastiga-postgres-1 pg_restore --list < "$dump" > "$root/$run_id/database.list"
 # Same `<hash>  <path>` line as `sha256sum <file>`, so `sha256sum -c` still works.
 printf '%s  %s\n' "$digest" "$dump" > "$root/$run_id/database.sha256"
 rm -f "$root/$run_id/database.sha256.partial"
 run stage "$run_id" backup-verified
}
# After a publication: the stored search text of the source drawers (S6), from the marts just published, then the
# retention of restore points. It holds the deploy lock, so it is bounded: 40 min (local full data 8.5-8.9 min; the
# build's own lock and statement limits end its database work first), then SIGTERM and a minute later SIGKILL; a
# timeout is a failure like any other. Until it ends the drawers search by names first; a failure changes nothing
# published, and the next run builds it. Keep the two latest successful restore points plus the latest successful
# full (weekly) one; a failed run's dump goes once a later run succeeds. The dated TED/benchmark backups outside this
# directory are never removed.
after_publication() {
 timeout --kill-after=60s 40m docker compose --profile processing run --rm --no-deps -T processor node apps/ingestion/dist/scripts/source-search.js </dev/null || echo 'Source search build failed; the drawers keep the names-first search.'
 date -u '+search_text_completed=%FT%TZ'
 python3 ./retain-processing-backups.py "$root" || echo 'Backup retention needs operator attention.'
}
if [[ "$mode" == shadow ]]; then
 # The site stays open the whole night: the build writes only the shadow schemas and publishes by a schema swap.
 # Collection pauses (it would write raw rows past the boundary and core.scrape_runs, copied at the start); the
 # document worker keeps working (app and its files only). Drain the collector, then stop it.
 for attempt in $(seq 1 150); do
  pending=$(pg "select (select count(*) from app.collection_requests where outcome='running')+(select count(*) from app.collection_tasks where status='running')")
  [[ "$pending" =~ ^[0-9]+$ ]]
  [[ "$pending" == 0 ]] && break
  sleep 10
 done
 test "$pending" = 0
 docker compose --profile collection stop collection
 run freeze "$run_id"
 backup
 run stage "$run_id" shadow-prepare
 # The shadow copy (~20 GB copied, the derived marts rebuilt, ~60 GB in all) next to the live data and yesterday's.
 test "$(df -Pk "$root" | awk 'NR==2 {print $4}')" -ge "${SHADOW_MIN_FREE_KB:-104857600}"
 ./shadow-prepare.sh cinecastiga-postgres-1 seap "$root/$run_id/shadow" "${SEAP_BUILD_ROLE:-seap_build}"
 run_build refresh "$run_id"
 run swap "$run_id"
 date -u '+swapped=%FT%TZ'
 # Clear the web's in-process caches; Caddy holds requests while it starts (Caddyfile, lb_try_duration).
 docker compose restart web
 if [[ "$collection_active" == true ]]; then docker compose --profile collection up -d --no-deps collection; fi
 for attempt in $(seq 1 40); do
  if [[ "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/api/health || true)" == 200 ]]; then break; fi
  sleep 3
 done
 test "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/api/health)" = 200
 date -u '+completed=%FT%TZ'
 after_publication
 exit 0
fi
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
backup
# The proxy now answers 503; confirm it before the first data change, then let
# requests admitted just before finish (the web role's statement timeout is 30 s).
for attempt in $(seq 1 10); do
 if [[ "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/domenii || true)" == 503 ]]; then break; fi
 sleep 3
done
test "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/domenii || true)" = 503
sleep 30
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
# Outside the 503 window, with the site open (S6).
after_publication
