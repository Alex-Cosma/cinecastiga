WITH signatures AS (
SELECT aw.authority_entity_id,c.contract_no,c.contract_date,c.contract_value,c.currency,c.title,c.lots_caption,count(*) n,count(distinct c.ca_notice_id) notices,array_agg(c.ca_notice_contract_id ORDER BY c.ca_notice_contract_id) external_ids
FROM core.contracts c JOIN core.awards aw USING(ca_notice_id)
WHERE c.contract_value>0 AND c.contract_no IS NOT NULL
GROUP BY 1,2,3,4,5,6,7 HAVING count(*)>1)
SELECT 'candidate_summary' test,jsonb_build_object('groups',count(*),'rows',sum(n),'groups_across_notices',count(*) FILTER(WHERE notices>1)) data FROM signatures
UNION ALL SELECT 'examples',jsonb_agg(x) FROM (SELECT * FROM signatures ORDER BY contract_date DESC NULLS LAST,contract_value DESC LIMIT 15) x
