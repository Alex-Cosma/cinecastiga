WITH chosen AS MATERIALIZED (SELECT c.* FROM core.contracts c JOIN raw.raw_documents r ON r.id=c.raw_id WHERE c.currency IN ('EUR','USD') ORDER BY c.contract_date DESC LIMIT 20)
SELECT c.ca_notice_contract_id,c.currency stored_currency,c.contract_value::text stored_value,item->>'contractValue' source_contract_value,item->>'defaultCurrencyContractValue' source_default_value,item->'currency' source_currency,item->>'currencyRate' currency_rate,r.content_hash,
EXISTS(SELECT 1 FROM marts.contract_transactions ct WHERE ct.contract_id=c.id) included
FROM chosen c JOIN raw.raw_documents r ON r.id=c.raw_id CROSS JOIN LATERAL jsonb_array_elements(r.payload->'items') item WHERE item->>'caNoticeContractId'=c.ca_notice_contract_id::text
