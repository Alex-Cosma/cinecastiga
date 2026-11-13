-- Fills reference.onrc_firm.registered_on on a register imported before the day was kept (migration 0109), without
-- replacing the snapshot: only the new column, which nothing published reads until the next coordinated run.
-- Why not the monitored import: a manual import marks the checkpoint failed, and Comparații, Legături, the watches and
-- saving captures stop until the next coordinated run publishes.
-- Input: /tmp/onrc-reg-days.csv.gz inside the PostgreSQL container (j_number, registered_on; from the public ONRC file
-- of 4 November 2026, read exactly as the import reads it). A registration number never changes its day, so the days
-- of a later snapshot are right for an earlier one; a day after the table's snapshot is left out.
-- The file is made by prepare-onrc-registered-on-20261113.py. Applied on production on 13 November 2026 with the
-- owner's approval ("Doar ziua, acum"): 4,043,625 of 4,197,473 registrations of the 8 July 2026 snapshot got a day;
-- the second pass (backfill-onrc-registered-on-renumbered-20261113.sql) filled the rest. A preserved procedure, not
-- an onboarding command: a new ONRC import keeps the day by itself.
-- Run as the owner role, under the deploy lock, never during a processing run:
--   flock -w 120 /srv/seap/src/.git/deploy.lock docker exec cinecastiga-postgres-1 psql -X -U seap -d seap -v ON_ERROR_STOP=1 -f /tmp/backfill-registered-on.sql
\set ON_ERROR_STOP on
\timing on
begin;
set local lock_timeout = '10s';
set local statement_timeout = '20min';
create temp table reg_day (j_number text primary key, registered_on date not null) on commit drop;
\copy reg_day from program 'gunzip -c /tmp/onrc-reg-days.csv.gz' csv header
analyze reg_day;
do $$
declare snapshots int; filled bigint; running int;
begin
  select count(distinct snapshot_date), count(registered_on) into snapshots, filled from reference.onrc_firm;
  if snapshots <> 1 then raise exception 'expected one ONRC snapshot in reference.onrc_firm, found %', snapshots; end if;
  if filled <> 0 then raise exception 'registered_on is already filled on % rows: nothing to do', filled; end if;
  select count(*) into running from app.processing_runs where status = 'running';
  if running <> 0 then raise exception 'a processing run is running: its shadow copy would miss the days'; end if;
  if (select count(*) from reg_day) < 4000000 then raise exception 'the file of days is incomplete'; end if;
end $$;
update reference.onrc_firm f set registered_on = r.registered_on
from reg_day r
where r.j_number = f.j_number and r.registered_on <= f.snapshot_date;
select snapshot_date, count(*) registrations, count(registered_on) with_day, min(registered_on) first_day, max(registered_on) last_day
from reference.onrc_firm group by 1;
select version, kind, status from app.monitoring_refreshes order by version desc limit 1;
commit;
