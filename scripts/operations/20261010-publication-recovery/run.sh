#!/usr/bin/env bash
# Explicit dated recovery, NEVER cron/onboarding. Reopening uses ordinary gates.
set -Eeuo pipefail
umask 077
sha=${1:?validated deployed SHA required}
[[ "$sha" =~ ^[a-f0-9]{40}$ ]]
cd /srv/seap/src
exec 9>.git/deploy.lock
flock -n 9
[[ "$(git rev-parse HEAD)" == "$sha" ]]
root=/srv/seap/repairs/publication-20261010
scripts=/srv/seap/src/scripts/operations/20261010-publication-recovery
test ! -e "$root/run-id"
test -s "$root/copy-proof.json"
exec >>"$root/run.log" 2>&1
date -u '+started=%FT%TZ'
cd infra/prod
run() { docker compose --profile processing run --rm --no-deps -T processor node apps/ingestion/dist/scripts/processing.js "$@" </dev/null; }
failed() { trap - ERR INT TERM; if [[ -s "$root/run-id" ]]; then run fail "$(cat "$root/run-id")" || true; fi; echo 'Recovery failed; maintenance retained.'; exit 1; }
trap failed ERR INT TERM
test "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/domenii)" = 503
docker compose --profile processing run --rm --no-deps -T processor node apps/ingestion/dist/scripts/preflight-publication-versions.js </dev/null > "$root/live-preflight.json"
docker compose --profile collection stop collection documents
docker compose --profile processing run --rm --no-deps -T -v "$root:/reports" -v "$scripts:/incident:ro" processor node /incident/claim.mjs </dev/null
run_id=$(cat "$root/run-id")
run freeze "$run_id"
run stage "$run_id" backup
backup="/srv/seap/backups/processing/$run_id"
mkdir -p "$backup"
# The host recovery log is separate; retain the conventional per-run log pointer.
ln -s "$root/run.log" "$backup/run.log"
test "$(df -Pk /srv/seap/backups | awk 'NR==2 {print $4}')" -ge 20971520
(
 exec 9>&-
 while kill -0 "$$" 2>/dev/null; do
  docker exec cinecastiga-postgres-1 psql -X -U seap -d seap -c "update app.processing_runs set heartbeat_at=clock_timestamp() where id='$run_id'::uuid and status='running'" >/dev/null 2>&1 || true
  sleep 10
 done
) &
heartbeat_pid=$!
trap 'kill "$heartbeat_pid" 2>/dev/null || true' EXIT
docker exec cinecastiga-postgres-1 pg_dump -U seap -d seap -Fc > "$backup/database.dump.partial"
mv "$backup/database.dump.partial" "$backup/database.dump"
docker exec -i cinecastiga-postgres-1 pg_restore --list < "$backup/database.dump" > "$backup/database.list"
sha256sum "$backup/database.dump" > "$backup/database.sha256"
sha256sum -c "$backup/database.sha256"
run stage "$run_id" backup-verified
run refresh "$run_id"
run stage "$run_id" restart
docker compose restart web
docker compose --profile documents up -d --no-deps documents
# The source collector remains stopped on its unrelated pagination block.
for attempt in $(seq 1 40); do
 if [[ "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/api/health || true)" == 200 ]]; then break; fi
 sleep 3
done
test "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/api/health)" = 200
run stage "$run_id" reopen
run finish "$run_id"
date -u '+completed=%FT%TZ'
