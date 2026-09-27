#!/usr/bin/env bash
set -euo pipefail
umask 077
exec 9>/srv/seap/backups/ted-clone-repair-20260927.lock
flock -n 9 || exit 1
cd /srv/seap/src/infra/prod
report_dir=/srv/seap/backups/ted-repair-20260927
mkdir -p "$report_dir"
test ! -f "$report_dir/clone-validated"
trap 'date -u "+clone_failed=%Y-%m-%dT%H:%M:%SZ"; touch "$report_dir/clone-failed"' ERR
run_clone() {
 docker compose -f docker-compose.yml -f /srv/seap/backups/ted-repair.compose.yml --profile collection run --rm --no-deps -T --name cinecastiga-ted-clone-repair -e TED_REPAIR_DATABASE=seap_benchmark_20260927 -v /srv/seap/backups/ted-repair-command.mjs:/app/apps/ingestion/dist/scripts/ted-repair-command.mjs:ro collection node apps/ingestion/dist/scripts/ted-repair-command.mjs "$@"
}
date -u '+clone_replay_start=%Y-%m-%dT%H:%M:%SZ'
run_clone replay-ted --apply --limit 100000 --concurrency 4
run_clone replay-ted --apply --limit 100000 --concurrency 4
remaining=$(docker exec cinecastiga-postgres-1 psql -X -U seap -d seap_benchmark_20260927 -Atc "select count(*) from core.ted_notices where normalization_version is distinct from 2")
test "$remaining" = 0
date -u '+clone_replay_complete=%Y-%m-%dT%H:%M:%SZ'
docker exec -i cinecastiga-postgres-1 psql -v ON_ERROR_STOP=1 -X -U seap -d seap_benchmark_20260927 < /srv/seap/backups/all-signatures.sql > "$report_dir/clone-all-signatures.csv"
cmp /srv/seap/backups/local-all-signatures.csv "$report_dir/clone-all-signatures.csv"
date -u '+all_notice_lot_signatures_match=%Y-%m-%dT%H:%M:%SZ'
run_clone monitoring-refresh --run
docker exec cinecastiga-postgres-1 psql -X -U seap -d seap_benchmark_20260927 -Atc "select jsonb_build_object('notices',(select count(*) from core.ted_notices),'pending',(select count(*) from core.ted_notices where normalization_version is distinct from 2),'links',(select count(*) from core.award_links),'competition',(select count(*) from marts.contract_competition),'checkpoint',(select row_to_json(r) from (select version,status,completed_at,validation from app.monitoring_refreshes order by version desc limit 1) r))" > "$report_dir/clone-validation.json"
python3 - "$report_dir/clone-validation.json" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]))
assert r['notices']==161633 and r['pending']==0 and r['links']>0 and r['competition']>0
assert r['checkpoint']['status']=='ready'
assert all(c['passed'] for c in r['checkpoint']['validation']['checks'])
PY
date -u '+clone_validated=%Y-%m-%dT%H:%M:%SZ'
touch "$report_dir/clone-validated"
