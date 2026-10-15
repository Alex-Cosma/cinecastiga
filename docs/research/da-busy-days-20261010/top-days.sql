SET statement_timeout='120s';
SET max_parallel_workers_per_gather=1;
COPY (select (finalization_date at time zone 'Europe/Bucharest')::date as day,count(*) as records from core.direct_acquisitions where finalization_date is not null and finalization_date < '2026-10-10 00:00:00+03' group by 1 order by 2 desc,1 desc limit 10) TO STDOUT WITH CSV HEADER;
