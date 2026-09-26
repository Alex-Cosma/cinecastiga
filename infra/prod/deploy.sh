#!/usr/bin/env bash
# Runs ON THE SERVER as user `seap`. Invoked by GitHub Actions over SSH through a
# forced command in ~/.ssh/authorized_keys (see README.md), so the CI key can do
# nothing but this. Fast-forwards the checkout to origin/main and builds release images, applies pending migrations, then restarts the web
# containers; the database service, Meilisearch and Caddy are not restarted.
set -euo pipefail
cd "${SEAP_DEPLOY_CHECKOUT:-/srv/seap/src}"
# Also serialize manual invocations, not only the GitHub Actions deploy job.
exec 9>.git/deploy.lock
flock -n 9 || { echo "Another deployment is running." >&2; exit 1; }
git fetch --quiet origin main
git reset --hard --quiet origin/main
cd infra/prod
# Build first. Keep the current web container serving during the migration.
docker compose --profile maintenance --profile documents build --pull web migrate documents
docker compose --profile maintenance run --rm --no-deps migrate
# set -e prevents this restart when migration/history/grant checks fail.
docker compose --profile documents up -d --no-deps web documents
docker image prune -f >/dev/null
echo "deployed $(git rev-parse --short HEAD) at $(date -u +%FT%TZ)"
