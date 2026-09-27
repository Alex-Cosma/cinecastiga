#!/usr/bin/env bash
# Isolated rehearsal after the live repair and deployment. Never publishes search
# or pauses/resumes the live collector. Safe to leave running over SSH disconnects.
set -Eeuo pipefail
umask 077
cd /srv/seap/src
exec 9>.git/daily-rehearsal-20260927.lock
flock -n 9 || exit 1
report=/srv/seap/backups/daily-rehearsal-20260927
test -f /srv/seap/backups/ted-repair-20260927/live-ready
test ! -e "$report/daily-validation.json"
mkdir -p "$report"
exec >>"$report/run.log" 2>&1
date -u '+rehearsal_started=%FT%TZ'
git rev-parse HEAD
cd infra/prod
docker compose --profile processing run --rm --no-deps -T \
 --name cinecastiga-daily-rehearsal-20260927 \
 -v /srv/seap/src/scripts/operations/validate-daily-processing-20260927.mjs:/app/apps/ingestion/dist/scripts/validate-daily-processing-20260927.mjs:ro \
 -v "$report:/report" processor node --input-type=module -e '
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = "/seap_benchmark_20260927";
  process.env.DATABASE_URL = url.toString();
  await import("./apps/ingestion/dist/scripts/validate-daily-processing-20260927.mjs");
 '
python3 - "$report/daily-validation.json" <<'PY'
import json, sys
r = json.load(open(sys.argv[1]))
assert r['status'] == 'ready' and r['sourceRequests'] == 0 and not r['searchChanged']
assert r['before'] == r['after']
checks = r['checkpoint']['validation']['checks']
assert len(checks) == 10 and all(c['passed'] for c in checks)
assert r['checkpoint']['validation']['refreshScope'] == 'daily'
PY
date -u '+rehearsal_completed=%FT%TZ'
touch "$report/ready"
