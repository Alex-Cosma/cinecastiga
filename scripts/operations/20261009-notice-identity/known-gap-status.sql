BEGIN READ ONLY;
SET LOCAL statement_timeout='20s';
WITH original AS (
 SELECT (j->>'id')::bigint id FROM app.collection_audit a
 CROSS JOIN LATERAL jsonb_array_elements(a.before->'tasks') j
 WHERE action='notice-identity-known-gap-recovery'
)
SELECT 'original_76' scope,t.status,count(*) FROM original JOIN app.collection_tasks t USING(id) GROUP BY t.status;
WITH ids AS (
 SELECT DISTINCT j.value::text::bigint id FROM app.collection_tasks t CROSS JOIN LATERAL jsonb_array_elements(t.result->'ids') j
 WHERE t.kind='list' AND t.stream='awards' AND t.params->>'from'='2022-04-21' AND NOT coalesce((t.params->>'inventoryOnly')::boolean,false)
), graph AS (
 SELECT t.kind,ids.id,bool_and(t.status='complete') complete,max((t.result->>'total')::int) source_contracts
 FROM ids JOIN app.collection_tasks t ON t.stream='awards' AND t.kind IN ('contracts','detail') AND (t.params->>'noticeId')::bigint=ids.id
 GROUP BY t.kind,ids.id
)
SELECT '2022-04-21' scope,kind,count(*) notices,count(*) FILTER(WHERE complete) complete,
 sum(source_contracts) FILTER(WHERE kind='contracts' AND complete) source_contract_memberships FROM graph GROUP BY kind;
SELECT kind,status,count(*) FROM app.collection_tasks WHERE status IN ('pending','running','failed') GROUP BY 1,2 ORDER BY 1,2;
SELECT revision,paused,maintenance,blocked_reason FROM app.collection_control;
COMMIT;
