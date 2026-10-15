-- Diagnostic only: narrow to repeated notice numbers before examining contracts.
WITH repeated AS MATERIALIZED (
 SELECT notice_no FROM core.awards WHERE notice_no IS NOT NULL GROUP BY notice_no HAVING count(*)>1
), selected AS MATERIALIZED (
 SELECT c.id,c.ca_notice_id,c.ca_notice_contract_id,c.contract_no,c.contract_date,c.contract_value,c.currency,c.title,c.lots_caption,c.cpv_code,
 a.notice_no,a.authority_entity_id,a.cpv_code award_cpv,
 (SELECT array_agg(DISTINCT w.entity_id ORDER BY w.entity_id) FROM core.contract_winners w WHERE w.contract_id=c.id) winners,
 EXISTS(SELECT 1 FROM raw.raw_documents r WHERE r.id=c.raw_id AND r.endpoint_version='award-contracts:v1') raw_present,
 (SELECT sum(t.closing_value) FROM marts.contract_transactions t WHERE t.contract_id=c.id) included_ron
 FROM repeated r JOIN core.awards a USING(notice_no) JOIN core.contracts c USING(ca_notice_id)
 WHERE c.contract_value>0 AND c.contract_no IS NOT NULL
), groups AS (
 SELECT notice_no,authority_entity_id,contract_no,contract_date,contract_value,currency,title,lots_caption,winners,
 count(*) n,count(DISTINCT ca_notice_id) notices,count(*) FILTER(WHERE raw_present) with_raw,
 count(DISTINCT coalesce(cpv_code,award_cpv,'MISSING')) cpvs,
 count(*) FILTER(WHERE included_ron IS NOT NULL) included,
 array_agg(ca_notice_contract_id ORDER BY id) ids
 FROM selected GROUP BY 1,2,3,4,5,6,7,8,9 HAVING count(*)>1 AND count(DISTINCT ca_notice_id)>1
)
SELECT jsonb_build_object(
 'groups',count(*),'one_to_one',count(*) FILTER(WHERE n=2 AND notices=2),
 'within_publication_multiplicity',count(*) FILTER(WHERE n>notices),
 'cpv_conflicts',count(*) FILTER(WHERE cpvs>1),
 'both_archives_present',count(*) FILTER(WHERE with_raw=n),
 'missing_winners',count(*) FILTER(WHERE winners IS NULL OR array_position(winners,NULL) IS NOT NULL),
 'strict_ron_pairs',count(*) FILTER(WHERE n=2 AND notices=2 AND currency='RON' AND cpvs=1 AND contract_date IS NOT NULL AND winners IS NOT NULL),
 'foreign_or_unknown',count(*) FILTER(WHERE currency IS DISTINCT FROM 'RON'),
 'included_multiple',count(*) FILTER(WHERE included>1),
 'conflict_examples',coalesce((SELECT jsonb_agg(x) FROM (SELECT notice_no,contract_no,ids,cpvs,n,notices FROM groups WHERE cpvs>1 OR n>notices LIMIT 10)x),'[]'::jsonb)
) FROM groups;
