BEGIN READ ONLY;
SET LOCAL statement_timeout='30s';
-- Materialize small projections before expanding IDs: avoid repeatedly
-- detoasting the full contract/winner payload for every ID in the same page.
WITH pages AS MATERIALIZED (
 SELECT partition,(result->>'total')::int total,result->'ids' ids
 FROM app.collection_tasks WHERE kind='contracts' AND status='complete'
), inventories AS (
 SELECT partition,min(total) lo,max(total) hi,count(DISTINCT ids.id) distinct_ids
 FROM pages p LEFT JOIN LATERAL jsonb_array_elements_text(p.ids) ids(id) ON true
 GROUP BY partition
)
SELECT jsonb_build_object('section','current_contracts_reconciliation','rows',jsonb_agg(to_jsonb(x))) FROM (
 SELECT count(*) inventories,sum(distinct_ids) contract_notice_memberships,
 count(*) FILTER(WHERE lo<>hi OR distinct_ids<>hi) bad_inventories,
 count(*) FILTER(WHERE hi=0) empty_inventories FROM inventories
) x;
SELECT jsonb_build_object('section','failed_detail_types','rows',jsonb_agg(to_jsonb(x))) FROM (
 SELECT params->>'noticeType' notice_type,coalesce(params->>'part','root') part,left(error,140) error,count(*) n
 FROM app.collection_tasks WHERE status='failed' GROUP BY 1,2,3 ORDER BY 1,2
) x;
SELECT jsonb_build_object('section','normalization','rows',jsonb_agg(to_jsonb(x))) FROM (
 SELECT scheduled_day,scope,status,stage,started_at,completed_at FROM app.processing_runs ORDER BY started_at DESC LIMIT 2
) x;
COMMIT;
