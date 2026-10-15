-- Targeted public responses only. Run with psql -X -qAt on the LOCAL source DB.
BEGIN READ ONLY;
SET LOCAL statement_timeout='60s';
SET LOCAL work_mem='8MB';
SET LOCAL max_parallel_workers_per_gather=0;
SELECT jsonb_build_object('id',r.id::text,'archive_source','local-production-copy-20261002',
 'endpoint_version',r.endpoint_version,'content_hash',r.content_hash,'payload',r.payload)
FROM raw.raw_documents r
WHERE r.external_id IN (
 SELECT 'award:'||a.ca_notice_id::text FROM core.awards a WHERE a.notice_no IN (
  SELECT notice_no FROM core.awards WHERE notice_no IS NOT NULL GROUP BY notice_no HAVING count(*)>1))
 AND r.endpoint_version IN ('award-list:v1','award-contracts:v1')
ORDER BY r.id;
COMMIT;
