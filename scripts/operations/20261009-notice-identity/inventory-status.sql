-- Read only. List evidence is NOT a certificate of full details/contracts/DA coverage.
BEGIN READ ONLY;
SET LOCAL statement_timeout='20s';
WITH pages AS (
 SELECT stream,params->>'from' as unit_day,status,(result->>'total')::int total,
 jsonb_array_length(result->'ids') records,
 (result->'inventory'->>'matched')::int matched,
 jsonb_array_length(result->'inventory'->'missing') missing,
 jsonb_array_length(result->'inventory'->'unverified') unverified
 FROM app.collection_tasks WHERE params->>'inventoryOnly'='true' AND result->>'supersededBy' IS NULL
), days AS (
 SELECT stream,unit_day,bool_and(status='complete') AND sum(records)=max(total) reconciled,
 max(total) source_total,sum(records) archived,sum(matched) matched,sum(missing) missing,sum(unverified) unverified
 FROM pages GROUP BY stream,unit_day
)
SELECT stream,left(unit_day,4) as inventory_year,count(*) as days,count(*) FILTER(WHERE reconciled) reconciled_days,
 sum(source_total) known_source_notices,sum(archived) archived,sum(matched) matched_at_collection,
 sum(missing) missing_at_collection,sum(unverified) unverified_at_collection
FROM days GROUP BY stream,left(unit_day,4) ORDER BY inventory_year,stream;
SELECT stream,status,count(*) pages FROM app.collection_tasks WHERE params->>'inventoryOnly'='true' GROUP BY 1,2 ORDER BY 1,2;
SELECT id,stream,params,error FROM app.collection_tasks WHERE params->>'inventoryOnly'='true' AND status='failed' ORDER BY id;
WITH gaps AS (
 SELECT DISTINCT j->>'key' identity,j->>'noticeNo' notice_no
 FROM app.collection_tasks t CROSS JOIN LATERAL jsonb_array_elements(t.result->'inventory'->'missing') j
 WHERE t.params->>'inventoryOnly'='true' AND t.stream='tenders' AND t.result->>'supersededBy' IS NULL
)
SELECT count(*) missing_scoped_identities,count(*) FILTER(WHERE EXISTS(
 SELECT 1 FROM core.notices n WHERE n.c_notice_id=split_part(g.identity,':',2)::bigint
 AND n.notice_namespace<>split_part(g.identity,':',1))) other_namespace_stored FROM gaps g;
COMMIT;
