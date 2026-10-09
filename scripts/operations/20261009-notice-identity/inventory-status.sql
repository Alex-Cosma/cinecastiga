-- Read only. List evidence is NOT a certificate of full details/contracts/DA coverage.
BEGIN READ ONLY;
SET LOCAL statement_timeout='20s';
WITH pages AS (
 SELECT stream,params->>'from' day,status,(result->>'total')::int total,
 jsonb_array_length(result->'ids') records,
 (result->'inventory'->>'matched')::int matched,
 jsonb_array_length(result->'inventory'->'missing') missing,
 jsonb_array_length(result->'inventory'->'unverified') unverified
 FROM app.collection_tasks WHERE params->>'inventoryOnly'='true'
), days AS (
 SELECT stream,day,bool_and(status='complete') AND sum(records)=max(total) reconciled,
 max(total) source_total,sum(records) archived,sum(matched) matched,sum(missing) missing,sum(unverified) unverified
 FROM pages GROUP BY stream,day
)
SELECT stream,left(day,4) year,count(*) days,count(*) FILTER(WHERE reconciled) reconciled_days,
 sum(source_total) known_source_notices,sum(archived) archived,sum(matched) matched_at_collection,
 sum(missing) missing_at_collection,sum(unverified) unverified_at_collection
FROM days GROUP BY stream,left(day,4) ORDER BY year,stream;
SELECT stream,status,count(*) pages FROM app.collection_tasks WHERE params->>'inventoryOnly'='true' GROUP BY 1,2 ORDER BY 1,2;
SELECT id,stream,params,error FROM app.collection_tasks WHERE params->>'inventoryOnly'='true' AND status='failed' ORDER BY id;
COMMIT;
