-- Second pass of the registration-day backfill (see backfill-registered-on.sql): the registrations whose number was
-- re-issued in the new format after the table's snapshot (J22/205/1999 became J1999000205223: the same firm, year and
-- sequence, the same day). The first pass matched by the number and left these without a day. Here a registration
-- still without a day takes the day of the same company code, register letter, year and sequence in the newer file.
-- Only rows without a day are written; a key with two different days in the file, or a day whose year is not the
-- number's, is left alone.
-- Applied on production on 13 November 2026 right after the first pass: 153,845 registrations; 3 stayed without a day.
-- Input: /tmp/onrc-reg-keys.csv.gz inside the PostgreSQL container (cui, kind, y, seq, registered_on), made by
-- prepare-onrc-registered-on-20261113.py.
--   flock -w 120 /srv/seap/src/.git/deploy.lock docker exec cinecastiga-postgres-1 psql -X -U seap -d seap -v ON_ERROR_STOP=1 -f /tmp/backfill-registered-on-renumbered.sql
\set ON_ERROR_STOP on
\timing on
begin;
set local lock_timeout = '10s';
set local statement_timeout = '20min';
create temp table reg_key (cui text not null, kind text not null, y int not null, seq bigint not null, registered_on date not null) on commit drop;
\copy reg_key from program 'gunzip -c /tmp/onrc-reg-keys.csv.gz' csv header
create temp table reg_one on commit drop as
  select cui, kind, y, seq, min(registered_on) registered_on
  from reg_key group by 1, 2, 3, 4
  having count(distinct registered_on) = 1 and extract(year from min(registered_on)) = y;
create index on reg_one (cui, y, seq, kind);
analyze reg_one;
do $$
declare snapshots int; missing bigint; running int;
begin
  select count(distinct snapshot_date), count(*) filter (where registered_on is null) into snapshots, missing from reference.onrc_firm;
  if snapshots <> 1 then raise exception 'expected one ONRC snapshot in reference.onrc_firm, found %', snapshots; end if;
  if missing = 0 then raise exception 'every registration already has a day: nothing to do'; end if;
  select count(*) into running from app.processing_runs where status = 'running';
  if running <> 0 then raise exception 'a processing run is running: its shadow copy would miss the days'; end if;
  if (select count(*) from reg_one) < 3500000 then raise exception 'the file of days is incomplete'; end if;
end $$;
update reference.onrc_firm f set registered_on = k.registered_on
from reg_one k
where f.registered_on is null and f.cui = k.cui and left(f.j_number, 1) = k.kind
  and k.y = case when f.j_number ~ '^[JFC][0-9]{13}$' then substr(f.j_number, 2, 4)::int
                 when f.j_number ~ '^[JFC][0-9]{1,2}/[0-9]+/[0-9]{4}$' then split_part(f.j_number, '/', 3)::int end
  and k.seq = case when f.j_number ~ '^[JFC][0-9]{13}$' then substr(f.j_number, 6, 6)::bigint
                   when f.j_number ~ '^[JFC][0-9]{1,2}/[0-9]+/[0-9]{4}$' then split_part(f.j_number, '/', 2)::bigint end
  and k.registered_on <= f.snapshot_date;
select snapshot_date, count(*) registrations, count(registered_on) with_day, count(*) filter (where registered_on is null and cui is not null) without_day_with_cui
from reference.onrc_firm group by 1;
select version, kind, status from app.monitoring_refreshes order by version desc limit 1;
commit;
