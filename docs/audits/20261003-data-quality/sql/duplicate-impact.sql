WITH winners AS (SELECT contract_id,array_agg(entity_id ORDER BY entity_id) ids FROM core.contract_winners GROUP BY 1), inc AS (SELECT contract_id,sum(closing_value) value FROM marts.contract_transactions GROUP BY 1), g AS (
SELECT aw.authority_entity_id,c.contract_no,c.contract_date,c.contract_value,c.currency,c.title,c.lots_caption,w.ids,count(*) n,count(distinct c.ca_notice_id) notices,array_agg(c.ca_notice_contract_id ORDER BY c.ca_notice_contract_id) external_ids,count(i.contract_id) included,sum(i.value) included_value
FROM core.contracts c JOIN core.awards aw USING(ca_notice_id) JOIN winners w ON w.contract_id=c.id LEFT JOIN inc i ON i.contract_id=c.id
WHERE c.contract_value>0 AND c.contract_no IS NOT NULL
GROUP BY 1,2,3,4,5,6,7,8 HAVING count(*)>1)
SELECT 'strict_summary' test,jsonb_build_object('groups',count(*),'rows',sum(n),'cross_notice_groups',count(*) FILTER(WHERE notices>1),'included_multiple_groups',count(*) FILTER(WHERE included>1),'extra_included_records',sum(greatest(included-1,0)),'candidate_excess_ron',sum(greatest(included-1,0)*contract_value)::text) data FROM g
UNION ALL SELECT 'latest_included',jsonb_agg(x) FROM (SELECT * FROM g WHERE included>1 ORDER BY contract_date DESC,contract_value DESC LIMIT 10) x
UNION ALL SELECT 'largest_included',jsonb_agg(x) FROM (SELECT * FROM g WHERE included>1 ORDER BY (included-1)*contract_value DESC LIMIT 5) x
