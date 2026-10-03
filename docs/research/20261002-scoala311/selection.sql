-- Public procurement records only. Run against the local production snapshot.
-- No source requests, private tables, DDL or writes. Values remain decimal strings.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '60s';
SELECT jsonb_pretty(jsonb_agg(jsonb_build_object(
  'sicapId',d.sicap_da_id::text,'code',d.da_code,
  'authority',a.name_display,'authorityCui',a.cui_canonical,
  'supplier',s.name_display,'supplierCui',s.cui_canonical,
  'state',d.state,'amount',d.closing_value::text,
  'publishedAt',d.publication_date,'finalizedAt',d.finalization_date,
  'cpv',d.cpv_code,'rawId',r.id::text,'endpoint',r.endpoint_version,
  'fetchedAt',r.fetched_at,'sourceContentHash',r.content_hash,'payload',r.payload
) ORDER BY d.finalization_date))
FROM core.direct_acquisitions d
JOIN core.entities a ON a.id=d.authority_entity_id
JOIN core.entities s ON s.id=d.supplier_entity_id
JOIN raw.raw_documents r ON r.id=d.raw_id
WHERE d.sicap_da_id IN (122898476,122898493,122898622,122898591,122898545,122898527,122898513,122981545);
COMMIT;
