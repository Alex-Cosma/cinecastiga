BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '60s';
SELECT jsonb_pretty(jsonb_agg(jsonb_build_object(
 'sicapId',d.sicap_da_id::text,'code',d.da_code,
 'authority',a.name_display,'authorityCui',a.cui_canonical,
 'supplier',s.name_display,'supplierCui',s.cui_canonical,
 'state',d.state,'amount',d.closing_value::text,'cpv',d.cpv_code,
 'publishedAt',d.publication_date,'finalizedAt',d.finalization_date,
 'archivedPayloadAvailable',r.id IS NOT NULL,'title',r.payload->>'directAcquisitionName'
) ORDER BY d.finalization_date)) FROM core.direct_acquisitions d
JOIN core.entities a ON a.id=d.authority_entity_id JOIN core.entities s ON s.id=d.supplier_entity_id
LEFT JOIN raw.raw_documents r ON r.id=d.raw_id
WHERE d.sicap_da_id IN (120247609,121041537);
COMMIT;
