-- Read-only local triage; no SEAP traffic and no raw payload sweep.
-- Legacy run windows were written with a fixed +03:00 offset. Adding three
-- hours here recovers their requested calendar date, not notice publication dates.
begin read only;
set local statement_timeout='5s';
with days as (
 select d::date as requested_day from generate_series('2018-01-01'::date,'2025-12-31'::date,interval '1 day') d
), streams as (
 select unnest(array['elicitatie:tenders','elicitatie:awards']) source
)
select s.source,d.requested_day from streams s cross join days d
where not exists(select 1 from core.scrape_runs r where r.source=s.source and r.status='completed' and (r.window_start+interval '3 hours')::date=d.requested_day)
order by s.source,d.requested_day;
select id,source,status,started_at,finished_at,window_start,window_end,reported_total,fetched_count,inserted_count,skipped_count,pages_fetched
from core.scrape_runs where id=4496;
commit;
