#!/usr/bin/env bash
# Historical incident operation, not a general start command. Run only once, after deploy.
set -Eeuo pipefail
cd /srv/seap/src
exec 9>.git/deploy.lock
flock -n 9 || { echo 'Deployment or processing is active'; exit 1; }
test "$(TZ=Europe/Bucharest date +%F)" = 2026-10-08
sha256sum -c /srv/seap/backups/processing/6a186851-6a54-4d94-af23-9607f76f8132/database.sha256
cd infra/prod
# The collector was stopped during the failed publication; ordinary deploy does
# not build inactive profiles. Explicitly build THIS release before activation.
docker compose --profile collection build collection
docker exec -i cinecastiga-postgres-1 psql -X -U seap -d seap -v ON_ERROR_STOP=1 < ../../scripts/operations/20261008-recovery/resume-archive.sql
docker compose stop documents
docker compose --profile collection up -d --no-deps collection
# No normalization, marts, risk or search commands here.
