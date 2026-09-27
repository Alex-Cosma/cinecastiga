#!/bin/bash
set -euo pipefail
umask 077
exec 9>/srv/seap/backups/benchmark-20260927.lock
flock -n 9 || exit 1
while [ ! -f /srv/seap/backups/recalculation-20260927-backup-ready ]; do sleep 10; done
date -u '+clone_start=%Y-%m-%dT%H:%M:%SZ'
docker exec cinecastiga-postgres-1 createdb -U seap seap_benchmark_20260927
docker exec -i cinecastiga-postgres-1 pg_restore --exit-on-error --no-owner --no-privileges -U seap -d seap_benchmark_20260927 < /srv/seap/backups/pre-recalculation-20260927.dump
date -u '+clone_complete=%Y-%m-%dT%H:%M:%SZ'
mkdir -p /srv/seap/backups/benchmark-20260927
chmod 700 /srv/seap/backups/benchmark-20260927
cd /srv/seap/src/infra/prod
docker compose --profile collection run --rm --no-deps -T --user 0:0 --name cinecastiga-benchmark-20260927 -e BENCHMARK_DATABASE=seap_benchmark_20260927 -v /srv/seap/backups/benchmark-production-refresh.mjs:/app/apps/ingestion/dist/scripts/benchmark-once.mjs:ro -v /srv/seap/backups/benchmark-20260927:/reports collection node apps/ingestion/dist/scripts/benchmark-once.mjs
date -u '+benchmark_complete=%Y-%m-%dT%H:%M:%SZ'
