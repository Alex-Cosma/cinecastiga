-- Run ONLY after applying/validating row corrections in the isolated rehearsal.
-- This file assumes the verified manifest + plan tables produced by rehearse.py.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(710012026);
LOCK TABLE core.entities,core.entity_sicap_ids,core.entity_redirects,core.direct_acquisitions,reference.authority_uat IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE identity_repair.alias_plan AS
WITH corrected AS (
 SELECT p.old_id,min(p.new_id) canonical_id,count(*) rows,array_agg(DISTINCT p.group_id) groups
 FROM identity_repair.plan p JOIN identity_repair.applied a ON a.da_id=p.da_id
 GROUP BY p.old_id HAVING count(DISTINCT p.new_id)=1 AND bool_and(p.raw_id IS NULL)
)
SELECT c.*,old.name_display old_name,target.name_display canonical_name,
 jsonb_build_object('id',old.id::text,'cui',NULL,'foreign',NULL,
  'sicap',coalesce((SELECT jsonb_agg(s.namespace||':'||s.sicap_id::text ORDER BY s.namespace,s.sicap_id) FROM core.entity_sicap_ids s WHERE s.entity_id=old.id),'[]'::jsonb),
  'fallback',md5(concat_ws('|',old.name_normalized,old.country_code,old.county))) previous_identity,
 jsonb_build_object('id',target.id::text,'cui',target.cui_canonical,'foreign',NULL,
  'sicap',coalesce((SELECT jsonb_agg(s.namespace||':'||s.sicap_id::text ORDER BY s.namespace,s.sicap_id) FROM core.entity_sicap_ids s WHERE s.entity_id=target.id),'[]'::jsonb),
  'fallback',md5(concat_ws('|',target.name_normalized,target.country_code,target.county))) canonical_identity,
 s.sicap_id fabricated_sicap_id
FROM corrected c JOIN core.entities old ON old.id=c.old_id JOIN core.entities target ON target.id=c.canonical_id
JOIN core.entity_sicap_ids s ON s.entity_id=old.id AND s.namespace='authority' AND s.sicap_id::text=target.cui_canonical
WHERE NOT old.cui_valid AND old.cui_canonical IS NULL AND old.foreign_id_norm IS NULL AND NOT old.is_foreign AND target.cui_valid
 AND (SELECT count(*) FROM core.entity_sicap_ids k WHERE k.entity_id=old.id)=1
 AND NOT EXISTS(SELECT 1 FROM identity_repair.dimension dim WHERE dim.sicap_id=s.sicap_id)
 AND NOT EXISTS(SELECT 1 FROM core.direct_acquisitions d WHERE d.authority_entity_id=old.id OR d.supplier_entity_id=old.id)
 AND NOT EXISTS(SELECT 1 FROM core.notices n WHERE n.authority_entity_id=old.id)
 AND NOT EXISTS(SELECT 1 FROM core.awards n WHERE n.authority_entity_id=old.id)
 AND NOT EXISTS(SELECT 1 FROM core.contract_winners n WHERE n.entity_id=old.id)
 AND NOT EXISTS(SELECT 1 FROM core.ted_notices n WHERE n.buyer_entity_id=old.id)
 AND NOT EXISTS(SELECT 1 FROM core.ted_lot_winners n WHERE n.entity_id=old.id)
 AND NOT EXISTS(SELECT 1 FROM core.entity_redirects r WHERE r.old_id IN (old.id,target.id) OR r.canonical_id=old.id);
ALTER TABLE identity_repair.alias_plan ADD PRIMARY KEY(old_id);
DO $$ BEGIN
IF EXISTS(SELECT 1 FROM identity_repair.alias_plan p JOIN reference.authority_uat old ON old.entity_id=p.old_id JOIN reference.authority_uat target ON target.entity_id=p.canonical_id WHERE old.uat_siruta IS DISTINCT FROM target.uat_siruta OR old.population IS DISTINCT FROM target.population) THEN RAISE EXCEPTION 'Conflicting population mapping; review before aliasing'; END IF;
END $$;
CREATE TABLE identity_repair.previous_uat AS SELECT u.* FROM reference.authority_uat u JOIN identity_repair.alias_plan p ON p.old_id=u.entity_id;
CREATE TABLE identity_repair.previous_sicap AS SELECT s.* FROM core.entity_sicap_ids s JOIN identity_repair.alias_plan p ON p.old_id=s.entity_id;
INSERT INTO core.entity_redirects(old_id,canonical_id,reason,evidence)
SELECT old_id,canonical_id,'legacy-authority-cui-as-sicap',jsonb_build_object(
 'version',1,'sourceManifest',(SELECT document FROM identity_repair.manifest),
 'sourceGroups',to_jsonb(groups),'correctedRows',rows,
 'previousIdentity',previous_identity,'canonicalIdentity',canonical_identity)
FROM identity_repair.alias_plan;
INSERT INTO reference.authority_uat(entity_id,uat_siruta,population)
SELECT p.canonical_id,u.uat_siruta,u.population FROM identity_repair.previous_uat u JOIN identity_repair.alias_plan p ON p.old_id=u.entity_id
ON CONFLICT (entity_id) DO NOTHING;
DELETE FROM reference.authority_uat u USING identity_repair.alias_plan p WHERE u.entity_id=p.old_id;
DELETE FROM core.entity_sicap_ids s USING identity_repair.alias_plan p WHERE s.entity_id=p.old_id AND s.namespace='authority' AND s.sicap_id=p.fabricated_sicap_id;
COMMIT;
SELECT count(*) verified_aliases FROM identity_repair.alias_plan;
