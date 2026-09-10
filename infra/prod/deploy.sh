#!/usr/bin/env bash
# Runs ON THE SERVER as user `seap`. Invoked by GitHub Actions over SSH through a
# forced command in ~/.ssh/authorized_keys (see README.md), so the CI key can do
# nothing but this. Fast-forwards the checkout to origin/main and rebuilds the web
# container; Postgres, Meilisearch and Caddy are untouched.
set -euo pipefail
cd /srv/seap/src
git fetch --quiet origin main
git reset --hard --quiet origin/main
cd infra/prod
docker compose build --pull web
docker compose up -d web
docker image prune -f >/dev/null
echo "deployed $(git rev-parse --short HEAD) at $(date -u +%FT%TZ)"
