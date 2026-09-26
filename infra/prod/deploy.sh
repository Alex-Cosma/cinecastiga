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
# An already activated collector follows future releases; an inactive profile
# stays inactive until its recovery inventory and pilot have been inspected.
collection_active=false
for collection_container in $(docker compose --profile collection ps --status running -q collection); do
  # Compose ps may include a bounded `run` container. That is not activation
  # of the permanent service, even while its pilot holds the collector lock.
  if [[ "$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.oneoff" }}' "$collection_container")" == "False" ]]; then
    collection_active=true
  fi
done
if [[ "$collection_active" == true ]]; then
  docker compose --profile collection build --pull collection
fi
docker compose --profile maintenance run --rm --no-deps migrate
# set -e prevents this restart when migration/history/grant checks fail.
docker compose --profile documents up -d --no-deps web documents
if [[ "$collection_active" == true ]]; then
  docker compose --profile collection up -d --no-deps collection
fi
docker image prune -f >/dev/null
echo "deployed $(git rev-parse --short HEAD) at $(date -u +%FT%TZ)"
