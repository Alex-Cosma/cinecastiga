SELECT r.id,r.external_id,r.payload->>'estimatedValueExport' original,a.estimated_value_ron::text stored
FROM raw.raw_documents r JOIN core.awards a ON a.raw_id=r.id
WHERE r.endpoint_version='award-list:v1' AND r.payload->>'estimatedValueExport' ~ '^[0-9]+\.[0-9]{1,2} RON$'
ORDER BY r.id DESC LIMIT 20
