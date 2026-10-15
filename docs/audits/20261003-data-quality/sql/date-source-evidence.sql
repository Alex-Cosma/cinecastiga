SELECT c.ca_notice_contract_id,c.contract_no,c.contract_date::text normalized_date,c.contract_value::text,
r.endpoint_version,r.content_hash,
item->>'contractDate' source_date,item->>'contractNo' source_number,item->>'contractTitle' source_title,
aw.notice_no,aw.state_date::text notice_date
FROM core.contracts c JOIN core.awards aw USING(ca_notice_id) JOIN raw.raw_documents r ON r.id=c.raw_id
CROSS JOIN LATERAL jsonb_array_elements(r.payload->'items') item
WHERE c.ca_notice_contract_id IN (1161898,1160333,101404335,100758611)
AND item->>'caNoticeContractId'=c.ca_notice_contract_id::text
