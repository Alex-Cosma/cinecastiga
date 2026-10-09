-- Read-only production inventory. Counts are not source-completeness claims.
BEGIN READ ONLY;
SET LOCAL statement_timeout='45s';
SET LOCAL TIME ZONE 'Europe/Bucharest';
SELECT jsonb_build_object('section','control','rows',jsonb_agg(to_jsonb(x))) FROM (
 SELECT now() checked_at,revision,paused,maintenance,blocked_reason FROM app.collection_control
) x;
SELECT jsonb_build_object('section','batch','rows',jsonb_agg(to_jsonb(x))) FROM (
 SELECT id,end_day,seed_end_day,follow_latest,status FROM app.collection_batches
) x;
SELECT jsonb_build_object('section','tasks','rows',jsonb_agg(to_jsonb(x))) FROM (
 SELECT stream,kind,status,count(*) n FROM app.collection_tasks GROUP BY 1,2,3 ORDER BY 1,2,3
) x;
SELECT jsonb_build_object('section','failed_tasks','rows',jsonb_agg(to_jsonb(x))) FROM (
 SELECT id,stream,kind,params,left(error,400) error FROM app.collection_tasks WHERE status='failed' ORDER BY id
) x;
SELECT jsonb_build_object('section','raw_inventory','rows',jsonb_agg(to_jsonb(x))) FROM (
 SELECT source,endpoint_version,count(*) n,min(fetched_at) oldest_fetch,max(fetched_at) newest_fetch
 FROM raw.raw_documents GROUP BY 1,2 ORDER BY 1,2
) x;
SELECT jsonb_build_object('section','legacy_daily','rows',jsonb_agg(to_jsonb(x))) FROM (
 WITH days AS (SELECT d::date AS requested_day FROM generate_series('2018-01-01'::date,'2025-12-31'::date,interval '1 day') d),
 sources AS (SELECT unnest(ARRAY['elicitatie:tenders','elicitatie:awards']) source),
 runs AS (SELECT source,(window_start+interval '3 hours') AT TIME ZONE 'UTC' requested_date,status,reported_total,fetched_count,deviation FROM core.scrape_runs)
 SELECT s.source,extract(year FROM d.requested_day)::int AS year,count(*) days,
 count(*) FILTER(WHERE r.completed) completed_days,
 count(*) FILTER(WHERE r.reconciled) reconciled_days,
 sum(r.reported_total) recorded_total,
 array_agg(d.requested_day ORDER BY d.requested_day) FILTER(WHERE NOT coalesce(r.completed,false)) missing_days
 FROM days d CROSS JOIN sources s LEFT JOIN LATERAL (
  SELECT bool_or(status='completed') completed,
  bool_or(status='completed' AND reported_total=fetched_count AND deviation=0) reconciled,
  max(reported_total) FILTER(WHERE status='completed' AND reported_total=fetched_count AND deviation=0) reported_total
  FROM runs WHERE source=s.source AND requested_date::date=d.requested_day
 ) r ON true GROUP BY 1,2 ORDER BY 1,2
) x;
SELECT jsonb_build_object('section','legacy_da_runs','rows',jsonb_agg(to_jsonb(x))) FROM (
 SELECT id,status,window_start,window_end,fetched_count,pages_fetched,left(error,220) error
 FROM core.scrape_runs WHERE source='elicitatie:das' ORDER BY id
) x;
SELECT jsonb_build_object('section','core_years','rows',jsonb_agg(to_jsonb(x))) FROM (
 SELECT 'da' dataset,extract(year FROM finalization_date)::int AS year,count(*) n
 FROM core.direct_acquisitions GROUP BY 2
 UNION ALL SELECT 'contracts',extract(year FROM contract_date)::int,count(*) FROM core.contracts GROUP BY 2
 UNION ALL SELECT 'ted',extract(year FROM publication_date)::int,count(*) FROM core.ted_notices GROUP BY 2
) x;
SELECT jsonb_build_object('section','core_notices','rows',jsonb_agg(to_jsonb(x))) FROM (
 SELECT 'tenders' dataset,count(*) n,count(*) FILTER(WHERE raw_id IS NULL) without_raw_reference FROM core.notices
 UNION ALL SELECT 'awards',count(*),count(*) FILTER(WHERE raw_id IS NULL) FROM core.awards
) x;
SELECT jsonb_build_object('section','document_inventory','rows',jsonb_agg(to_jsonb(x))) FROM (
 SELECT table_name FROM information_schema.tables WHERE table_schema='app' AND table_name IN ('procurement_documents','document_blobs','document_jobs')
) x;
COMMIT;
