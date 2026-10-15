#!/usr/bin/env bash
# Dated recovery; never run from cron. Requires a verified rehearsal and deployed SHA.
set -Eeuo pipefail
umask 077
sha=${1:?pinned deployed SHA required}
[[ "$sha" =~ ^[a-f0-9]{40}$ ]]
cd /srv/seap/src
exec 9>.git/deploy.lock
flock -n 9
[[ "$(git rev-parse HEAD)" == "$sha" ]]
root=/srv/seap/repairs/recovery-20261007
scripts=/srv/seap/src/scripts/operations/20261007-recovery
test ! -e "$root/run-id"
test -s "$root/copy-validation.json"
exec >>"$root/recovery.log" 2>&1
date -u '+started=%FT%TZ'
# The successful 05:00 backup includes the frozen source boundary before writes.
sha256sum -c /srv/seap/backups/processing/a089c12c-592d-4700-8749-77f24dcd17ee/database.sha256
cd infra/prod
run() { docker compose --profile processing run --rm --no-deps -T processor node apps/ingestion/dist/scripts/processing.js "$@" </dev/null; }
failed() { trap - ERR INT TERM; if [[ -s "$root/run-id" ]]; then run fail "$(cat "$root/run-id")" || true; fi; echo 'Recovery failed; maintenance retained.'; exit 1; }
trap failed ERR INT TERM
# All work was inspected/drained; maintenance prevents new jobs.
docker compose --profile collection stop collection documents
docker compose --profile processing run --rm --no-deps -T -v "$root:/reports" -v "$scripts:/incident:ro" processor node /incident/apply.mjs </dev/null
run_id=$(cat "$root/run-id")
run refresh "$run_id"
run stage "$run_id" restart
docker compose restart web
docker compose --profile collection up -d --no-deps documents collection
for attempt in $(seq 1 40); do
 if [[ "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/api/health || true)" == 200 ]]; then break; fi
 sleep 3
done
test "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/api/health)" = 200
run stage "$run_id" reopen
run finish "$run_id"
date -u '+completed=%FT%TZ'
