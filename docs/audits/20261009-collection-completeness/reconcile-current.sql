BEGIN READ ONLY;
SET LOCAL statement_timeout='45s';
WITH partitions AS (
 SELECT stream,kind,partition,count(*) pages,min((params->>'page')::int) first_page,max((params->>'page')::int) last_page,
 min((result->>'total')::bigint) min_total,max((result->>'total')::bigint) max_total,
 sum(jsonb_array_length(result->'ids')) ids
 FROM app.collection_tasks WHERE kind IN ('list','da','catalogue') AND status='complete' GROUP BY 1,2,3
)
SELECT jsonb_build_object('section','pagination','rows',jsonb_agg(to_jsonb(x))) FROM (
 SELECT stream,kind,count(*) partitions,sum(ids) listed_rows,
 count(*) FILTER(WHERE first_page<>0 OR last_page<>pages-1 OR min_total<>max_total OR ids<>max_total) bad_partitions
 FROM partitions GROUP BY 1,2 ORDER BY 1,2
) x;
WITH ids AS (
 SELECT DISTINCT stream,(jsonb_array_elements_text(result->'ids'))::bigint notice_id
 FROM app.collection_tasks WHERE kind='list' AND status='complete'
), roots AS (
 SELECT stream,(params->>'noticeId')::bigint notice_id,status FROM app.collection_tasks
 WHERE kind='detail' AND coalesce(params->>'part','root')='root'
), graphs AS (
 SELECT stream,(params->>'noticeId')::bigint notice_id,bool_and(status='complete') complete
 FROM app.collection_tasks WHERE kind='detail' GROUP BY 1,2
), contracts AS (
 SELECT (params->>'noticeId')::bigint notice_id,bool_and(status='complete') complete
 FROM app.collection_tasks WHERE kind='contracts' GROUP BY 1
)
SELECT jsonb_build_object('section','notice_children','rows',jsonb_agg(to_jsonb(x))) FROM (
 SELECT i.stream,count(*) unique_notices,count(*) FILTER(WHERE r.notice_id IS NULL) missing_roots,
 count(*) FILTER(WHERE r.status='complete') completed_roots,
 count(*) FILTER(WHERE g.complete) complete_known_graphs,
 count(*) FILTER(WHERE i.stream='awards' AND c.complete) complete_contract_inventories
 FROM ids i LEFT JOIN roots r USING(stream,notice_id) LEFT JOIN graphs g USING(stream,notice_id)
 LEFT JOIN contracts c USING(notice_id) GROUP BY 1
) x;
WITH daylist AS (
 SELECT stream,params->>'from' requested_day FROM app.collection_tasks
 WHERE kind='list' AND status='complete' GROUP BY 1,2
)
SELECT jsonb_build_object('section','current_list_days','rows',jsonb_agg(to_jsonb(x))) FROM (
 SELECT stream,count(*) days,min(requested_day) first_day,max(requested_day) last_day FROM daylist GROUP BY 1
) x;
WITH ranges AS (
 SELECT (params->>'authorityId')::bigint authority_id,
 range_agg(daterange((params->>'from')::date,(params->>'to')::date+1,'[)')) coverage
 FROM app.collection_tasks WHERE kind='da' AND status='complete' GROUP BY 1
)
SELECT jsonb_build_object('section','current_da_dates','rows',jsonb_agg(to_jsonb(x))) FROM (
 SELECT count(*) authorities,count(*) FILTER(WHERE NOT coverage @> daterange('2026-07-01'::date,'2026-10-09'::date,'[)')) incomplete_date_ranges FROM ranges
) x;
SELECT jsonb_build_object('section','attachments','rows',jsonb_agg(to_jsonb(x))) FROM (
 SELECT count(*) inventoried,count(*) FILTER(WHERE original_hash IS NOT NULL) downloaded,
 count(*) FILTER(WHERE processed_at IS NOT NULL) processed FROM app.procurement_documents
) x;
SELECT jsonb_build_object('section','legacy_detail_warnings','rows',jsonb_agg(to_jsonb(x))) FROM (
 SELECT source,count(*) completed_runs_with_warnings,left(error,140) warning FROM core.scrape_runs
 WHERE status='completed' AND source IN ('elicitatie:tenders','elicitatie:awards') AND error IS NOT NULL
 GROUP BY source,left(error,140) ORDER BY count(*) DESC LIMIT 15
) x;
COMMIT;
