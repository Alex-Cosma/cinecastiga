WITH docs AS MATERIALIZED (SELECT r.id,r.payload FROM raw.raw_documents r WHERE r.endpoint_version='award-contracts:v1' AND r.id IN (SELECT raw_id FROM core.contracts WHERE currency IN ('EUR','USD'))), source_items AS MATERIALIZED (
SELECT r.id raw_id,item FROM docs r CROSS JOIN LATERAL jsonb_array_elements(r.payload->'items') item), compared AS (
SELECT c.id,c.ca_notice_id,c.contract_date,c.title,c.currency,c.contract_value,
(s.item->>'contractValue')::numeric original_value,(s.item->>'defaultCurrencyContractValue')::numeric converted_value,(s.item->>'currencyRate')::numeric rate
FROM core.contracts c JOIN source_items s ON s.raw_id=c.raw_id AND s.item->>'caNoticeContractId'=c.ca_notice_contract_id::text WHERE c.currency IN ('EUR','USD'))
SELECT currency,count(*) source_verified,count(*) FILTER(WHERE converted_value IS NOT NULL AND converted_value<>original_value AND contract_value=converted_value) converted_with_original_label,
sum(converted_value) FILTER(WHERE converted_value IS NOT NULL AND converted_value<>original_value AND contract_value=converted_value)::text converted_sum_not_deduplicated,
count(*) FILTER(WHERE converted_value IS NOT NULL AND abs(converted_value-round(original_value*rate,2))>0.01) rate_disagrees,
count(*) FILTER(WHERE converted_value IS NOT NULL AND converted_value<>original_value AND contract_value=converted_value AND contract_value>0 AND contract_value<=1000000000 AND contract_date IS NOT NULL AND EXISTS(SELECT 1 FROM core.contract_winners w WHERE w.contract_id=compared.id) AND NOT(coalesce(title,'')~*'acord[- ]cadru' AND coalesce(title,'')!~*'subsecvent' AND EXISTS(SELECT 1 FROM core.contracts c2 WHERE c2.ca_notice_id=compared.ca_notice_id AND c2.title~*'subsecvent'))) eligible_except_currency
FROM compared GROUP BY currency
