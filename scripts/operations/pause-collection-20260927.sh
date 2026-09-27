#!/bin/bash
set -euo pipefail
umask 077
exec 9>/srv/seap/backups/recalculation-20260927.lock
flock -n 9 || exit 1
TARGET=$(date -u -d '2026-09-27 05:00:00' +%s)
DELAY=$((TARGET-$(date -u +%s)))
if [ "$DELAY" -gt 0 ]; then sleep "$DELAY"; fi
date -u '+collection_pause=%Y-%m-%dT%H:%M:%SZ'
docker exec -i cinecastiga-postgres-1 psql -v ON_ERROR_STOP=1 -X -U seap -d seap <<'SQL'
begin;
insert into app.collection_audit(actor_id,actor_name,action,before,after) select 'operator:codex','Operațiune autorizată de administrator','recalculation-pause',jsonb_build_object('paused',paused,'maintenance',maintenance),jsonb_build_object('paused',true,'maintenance',maintenance,'reason','One-off September 27 08:00 Bucharest timed recalculation on isolated production clone; legacy TED validation preflight blocks live publication') from app.collection_control where id=1;
update app.collection_control set paused=true,revision=revision+1,updated_at=now() where id=1;
commit;
SQL
cd /srv/seap/src/infra/prod
docker compose --profile collection stop collection documents
date -u '+workers_drained=%Y-%m-%dT%H:%M:%SZ'
docker exec cinecastiga-postgres-1 psql -v ON_ERROR_STOP=1 -X -U seap -d seap -Atc "select count(*) from app.collection_requests where outcome='running'; select max(id),count(*) from raw.raw_documents;" > /srv/seap/backups/recalculation-20260927-boundary.txt
date -u '+backup_start=%Y-%m-%dT%H:%M:%SZ'
docker exec cinecastiga-postgres-1 pg_dump -U seap -d seap -Fc > /srv/seap/backups/pre-recalculation-20260927.dump.partial
mv /srv/seap/backups/pre-recalculation-20260927.dump.partial /srv/seap/backups/pre-recalculation-20260927.dump
docker exec -i cinecastiga-postgres-1 pg_restore --list < /srv/seap/backups/pre-recalculation-20260927.dump > /srv/seap/backups/pre-recalculation-20260927.list
date -u '+backup_complete=%Y-%m-%dT%H:%M:%SZ'
touch /srv/seap/backups/recalculation-20260927-backup-ready
