#!/usr/bin/env bash
# Blue/green processing (owner, 9 November 2026): prepares the shadow schemas core_next, marts_next and reference_next
# for one build, while the site keeps reading core, marts and reference.
#   1. drops yesterday's *_prev (the rollback window ends when a new build starts) and any *_next a failed build left;
#   2. recreates the whole structure (tables, sequences, defaults, functions, triggers, materialized view, comments,
#      grants, default privileges) from a schema-only dump with the schema names rewritten, owned by the build role;
#   3. copies the data of every table a run does not rebuild before reading it (shadow-derived.txt lists the rest);
#   4. builds indexes and constraints, sets every sequence where the live one stands, analyzes.
# Runs on the host, as seap, inside the processing lock. Prints the duration of each step.
# Usage: shadow-prepare.sh <postgres container> <database> <work dir> [build role]
set -euo pipefail
pg=$1; db=$2; work=$3; role=${4:-seap_build}
here=$(cd "$(dirname "$0")" && pwd)
[[ $role =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "invalid build role" >&2; exit 2; }
mkdir -p "$work"
psql() { docker exec -i -e PGOPTIONS="-c maintenance_work_mem=1GB -c statement_timeout=0" "$pg" psql -X -q -v ON_ERROR_STOP=1 -U seap -d "$db" "$@"; }
t0=$(date +%s); step() { echo "shadow-prepare [$(( $(date +%s) - t0 ))s] $*"; }
# Schema names in DDL only (never in data); objects owned by the build role.
rewrite() { perl -pe 's/\b(core|marts|reference)\./$1_next./g; s/(SCHEMA\s+)(core|marts|reference)\b/$1$2_next/g; s/\bOWNER TO seap;/OWNER TO '"$role"';/g'; }

psql -At -c "select 1 from pg_roles where rolname = '$role'" | grep -q 1 || { echo "build role $role missing (infra/prod/build-role.sql)" >&2; exit 1; }

step "drop yesterday's and leftover shadow schemas"
psql -c "drop schema if exists core_prev, marts_prev, reference_prev, core_next, marts_next, reference_next cascade"

step "structure"
docker exec "$pg" pg_dump -U seap -d "$db" --schema-only --section=pre-data -n core -n marts -n reference > "$work/pre.sql"
docker exec "$pg" pg_dump -U seap -d "$db" --schema-only --section=post-data -n core -n marts -n reference > "$work/post.sql"
rewrite < "$work/pre.sql" > "$work/pre-next.sql"
rewrite < "$work/post.sql" > "$work/post-next.sql"
# After the rewrite no live name may remain (core_next. never matches \bcore\.).
if grep -nE '\b(core|marts|reference)\.' "$work/pre-next.sql" "$work/post-next.sql" > "$work/survivors.txt"; then
  echo "a live schema name survived the rewrite:" >&2; head -5 "$work/survivors.txt" >&2; exit 1
fi
psql < "$work/pre-next.sql" > /dev/null
# Tables the build creates (DROP + CREATE) stay readable by the web after the swap.
psql -c "alter default privileges for role $role in schema core_next, marts_next, reference_next grant select on tables to seap_web"

step "data"
derived=$(grep -vE '^\s*(#|$)' "$here/shadow-derived.txt" | sed "s/.*/'&'/" | paste -sd, -)
psql -At -c "select format('insert into %I.%I (%s) select %s from %I.%I;', c.table_schema || '_next', c.table_name, cols, cols, c.table_schema, c.table_name)
  from (select table_schema, table_name, string_agg(quote_ident(column_name), ', ' order by ordinal_position) filter (where is_generated <> 'ALWAYS') cols
        from information_schema.columns where table_schema in ('core', 'marts', 'reference') group by 1, 2) c
  join pg_class k on k.relname = c.table_name and k.relnamespace = c.table_schema::regnamespace and k.relkind = 'r'
  where not (c.table_schema = 'marts' and (c.table_name in ($derived) or c.table_name like 'agg\_%'))
  order by pg_total_relation_size(k.oid) desc" > "$work/copy.sql"
echo "shadow-prepare   $(wc -l < "$work/copy.sql" | tr -d ' ') tables to copy"
# Four lanes, round robin by size; any lane failing fails the step.
pids=()
for lane in 0 1 2 3; do
  awk -v l=$lane 'NR % 4 == l' "$work/copy.sql" > "$work/copy-$lane.sql"
  ( s=$(date +%s); psql < "$work/copy-$lane.sql" > /dev/null; echo "shadow-prepare   lane $lane $(( $(date +%s) - s ))s" ) & pids+=($!)
done
for pid in "${pids[@]}"; do wait "$pid"; done

step "indexes and constraints"
psql < "$work/post-next.sql" > /dev/null

step "sequences"
psql -At -c "select format('select setval(%L, %s, %s);', s.schemaname || '_next.' || s.sequencename,
  coalesce(s.last_value, s.start_value), (s.last_value is not null)::text) from pg_sequences s where s.schemaname in ('core', 'marts', 'reference')" | psql > /dev/null

step "analyze"
psql -At -c "select format('analyze %I.%I;', n.nspname, c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('core_next', 'marts_next', 'reference_next') and c.relkind = 'r'" | psql > /dev/null

step "check"
psql -At -c "select n.nspname || ' ' || count(*) || ' tables ' || pg_size_pretty(sum(pg_total_relation_size(c.oid))::bigint)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('core_next', 'marts_next', 'reference_next') and c.relkind in ('r', 'm') group by n.nspname order by 1"
psql -At -c "select case when (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('core', 'marts', 'reference') and c.relkind in ('r', 'm'))
  = (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('core_next', 'marts_next', 'reference_next') and c.relkind in ('r', 'm'))
  then 'same tables' else 'TABLE COUNT DIFFERS' end" | tee "$work/check.txt"
grep -q 'same tables' "$work/check.txt"
step "done"
