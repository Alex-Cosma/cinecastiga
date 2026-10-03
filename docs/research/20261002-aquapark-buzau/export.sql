-- Public records only. Run with PGOPTIONS default_transaction_read_only=on.
WITH selected AS (
 SELECT jsonb_build_object(
  'kind','direct','sicapId',d.sicap_da_id::text,'code',d.da_code,
  'amount',d.closing_value::text,'cpv',d.cpv_code,'state',d.state,
  'authority',a.name_display,'authorityCui',a.cui_canonical,
  'supplier',s.name_display,'supplierCui',s.cui_canonical,
  'publishedAt',d.publication_date,'finalizedAt',d.finalization_date,
  'rawId',d.raw_id::text,'payload',r.payload,'fetchedAt',r.fetched_at
 ) record
 FROM core.direct_acquisitions d JOIN core.entities a ON a.id=d.authority_entity_id
 JOIN core.entities s ON s.id=d.supplier_entity_id LEFT JOIN raw.raw_documents r ON r.id=d.raw_id
 WHERE d.sicap_da_id=122972715
 UNION ALL
 SELECT jsonb_build_object(
  'kind','contract','sicapId',c.ca_notice_contract_id::text,'awardNoticeId',c.ca_notice_id::text,
  'code',c.contract_no,'noticeCode',a.notice_no,'title',c.title,'amount',c.contract_value::text,
  'currency',c.currency,'contractDate',c.contract_date,'noticeDate',a.state_date,
  'authority',e.name_display,'authorityCui',e.cui_canonical,
  'suppliers',(SELECT jsonb_agg(jsonb_build_object('name',s.name_display,'cui',s.cui_canonical) ORDER BY s.cui_canonical)
   FROM core.contract_winners w JOIN core.entities s ON s.id=w.entity_id WHERE w.contract_id=c.id),
  'rawId',c.raw_id::text,'archivedPayloadAvailable',r.id IS NOT NULL,
  'awardArchivedPayloadAvailable',ar.id IS NOT NULL
 ) FROM core.contracts c JOIN core.awards a USING(ca_notice_id)
 JOIN core.entities e ON e.id=a.authority_entity_id
 LEFT JOIN raw.raw_documents r ON r.id=c.raw_id LEFT JOIN raw.raw_documents ar ON ar.id=a.raw_id
 WHERE c.ca_notice_contract_id=106187822
)
SELECT jsonb_pretty(jsonb_agg(record ORDER BY record->>'kind')) FROM selected;
