WITH repeated AS MATERIALIZED (SELECT notice_no FROM core.awards WHERE notice_no IS NOT NULL GROUP BY notice_no HAVING count(*)>1),
 selected AS MATERIALIZED (
 SELECT c.*,a.notice_no,a.authority_entity_id,
  ARRAY(SELECT w.entity_id FROM core.contract_winners w WHERE w.contract_id=c.id ORDER BY w.entity_id) winners,
  EXISTS(SELECT 1 FROM marts.contract_transactions t WHERE t.contract_id=c.id) included
 FROM repeated r JOIN core.awards a USING(notice_no) JOIN core.contracts c USING(ca_notice_id)
 WHERE c.contract_value>0 AND c.contract_no IS NOT NULL
 ), groups AS (
 SELECT notice_no,authority_entity_id,contract_no,contract_date,contract_value,currency,title,lots_caption,winners,
  count(*) FILTER(WHERE included) included,
  jsonb_agg(jsonb_build_object('id',ca_notice_contract_id::text,'status',coalesce(amount_status,'legacy'),'valueRon',value_ron::text)) members
 FROM selected GROUP BY 1,2,3,4,5,6,7,8,9
 HAVING count(*)=2 AND count(DISTINCT ca_notice_id)=2 AND bool_or(amount_status IS NOT NULL AND value_ron IS NULL)
 )
SELECT jsonb_build_object('groups',count(*),'previously_double_included',count(*) FILTER(WHERE included=2),
 'previous_candidate_excess_ron',sum(contract_value) FILTER(WHERE included=2)::text,
 'examples',jsonb_agg(jsonb_build_object('notice',notice_no,'number',contract_no,'members',members))) FROM groups;
