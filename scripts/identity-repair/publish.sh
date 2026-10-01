#!/usr/bin/env bash
# Explicit one-off. Never invoked by cron or an ordinary deploy.
set -Eeuo pipefail
umask 077
phase=${1:?prepare, publish or reopen required}
sha=${2:?pinned deployed SHA required}
[[ "$phase" =~ ^(prepare|publish|reopen)$ && "$sha" =~ ^[a-f0-9]{40}$ ]]
root=/srv/seap/backups/identity-live-20261001
copy=/srv/seap/backups/identity-repair-20261001
cd /srv/seap/src
exec 9>.git/deploy.lock
flock -n 9
test "$(git rev-parse HEAD)" = "$sha"
test -z "$(git status --porcelain)"
scripts=/srv/seap/src/scripts/identity-repair
cd infra/prod
sql() { docker exec -i cinecastiga-postgres-1 psql -X -qAt -v ON_ERROR_STOP=1 -U seap -d seap "$@"; }
run() {
 docker compose --profile processing run --rm --no-deps -T --user 0:0 \
  -e IDENTITY_REPAIR_APPLY=20261001-approved-copy -e IDENTITY_EXPECTED_REVISION="${2:-}" \
  -v "$scripts/publication.mjs:/app/apps/ingestion/dist/scripts/publication.mjs:ro" \
  -v "$scripts/validate-repair.mjs:/app/apps/ingestion/dist/scripts/validate-repair.mjs:ro" \
  -v "$scripts/publication-control.mjs:/app/apps/ingestion/dist/scripts/publication-control.mjs:ro" \
  -v "$root:/reports" processor node apps/ingestion/dist/scripts/publication.mjs "$1" </dev/null
}
if [[ "$phase" == prepare ]]; then
 revision=${3:?inspected control revision required}
 [[ "$revision" =~ ^[0-9]+$ ]]
 test ! -e "$root"
 test -f "$copy/release-validation.json"
 test -f "$copy/refresh.ready"
 test -f "$copy/search-report.json"
 test "$(sql -c "select to_regclass('core.entity_redirects') is not null")" = t
 mkdir -m 700 "$root"
 cp "$copy/release-validation.json" "$root/validated-copy.json"
 cp "$copy/manifest.json" "$copy/rows.tsv" "$copy/groups.json" "$copy/dimension.json" "$root/"
 printf '%s\n' "$sha" > "$root/code-sha"
 exec >>"$root/prepare.log" 2>&1
 date -u '+prepare_started=%FT%TZ'
 run start "$revision"
 trap 'echo "Preparation stopped; retain maintenance and inspect the logs."' ERR
 test "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/domenii)" = 503
 quiet=0
 for attempt in $(seq 1 150); do
  pending=$(sql -c "select (select count(*) from app.collection_requests where outcome='running')+(select count(*) from app.collection_tasks where status='running')+(select count(*) from app.document_jobs where status='running')+(select count(*) from app.evidence_captures where status in ('queued','running'))")
  if [[ "$pending" == 0 ]]; then quiet=$((quiet+1)); else quiet=0; fi
  # Also leave already-admitted web requests time to enqueue their capture.
  [[ "$quiet" -ge 3 ]] && break
  sleep 10
 done
 test "$quiet" -ge 3
 if docker inspect --format '{{.State.Running}}' cinecastiga-collection-1 2>/dev/null | grep -qx true; then touch "$root/collection-was-running"; fi
 docker compose --profile collection stop collection documents
 run freeze
 test "$(df -Pk "$root" | awk 'NR==2 {print $4}')" -ge 31457280
 docker exec cinecastiga-postgres-1 pg_dump -U seap -d seap -Fc > "$root/database.dump.partial"
 mv "$root/database.dump.partial" "$root/database.dump"
 docker exec -i cinecastiga-postgres-1 pg_restore --list < "$root/database.dump" > "$root/database.list"
 sha256sum "$root/database.dump" > "$root/database.sha256"
 date -u '+backup_complete=%FT%TZ'
 touch "$root/prepared"
elif [[ "$phase" == publish ]]; then
 test -f "$root/prepared"
 test "$(cat "$root/code-sha")" = "$sha"
 test ! -e "$root/report.json"
 exec >>"$root/publish.log" 2>&1
 trap 'echo "Publication stopped; maintenance retained."; touch "$root/failed"' ERR
 sha256sum -c "$root/database.sha256"
 run invalidate
 repair() {
  IDENTITY_REPAIR_APPLY=20261001-approved-copy python3 "$scripts/rehearse.py" \
   --database seap --container cinecastiga-postgres-1 --bundle "$root" \
   --publication-boundary "$root/boundary.json" --phase "$1"
 }
 repair prepare
 repair audit
 repair apply
 repair verify
 repair aliases
 repair verify
 run publish
 touch "$root/validated"
 date -u '+publication_validated=%FT%TZ'
else
 test -f "$root/validated"
 test "$(cat "$root/code-sha")" = "$sha"
 test ! -e "$root/reopened"
 docker compose restart web
 docker compose up -d --no-deps documents
 if test -f "$root/collection-was-running"; then docker compose --profile collection up -d --no-deps collection; fi
 for attempt in $(seq 1 40); do
  [[ "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/api/health || true)" == 200 ]] && break
  sleep 3
 done
 test "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/api/health)" = 200
 run reopen
 touch "$root/reopened"
fi
