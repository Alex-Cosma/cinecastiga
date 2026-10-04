-- Read-only verification of the explicitly authorized 4 October publication.
-- Run after the host runner has reopened the site, never as a repair command.
BEGIN READ ONLY;
SET LOCAL statement_timeout='60s';
SET LOCAL lock_timeout='5s';
DO $$
DECLARE r app.processing_runs%ROWTYPE;
BEGIN
 SELECT p.* INTO STRICT r FROM app.processing_runs p JOIN app.data_repairs d
   ON d.processing_run_id=p.id
   WHERE d.id='reference-import-v1' AND d.status='completed';
 IF r.id<>'96c15b43-6ad8-4d41-a94d-16b9c160e114'::uuid
    OR r.status<>'ready' OR r.trigger<>'manual' OR r.scope<>'full'
    OR r.search_verified IS NULL THEN RAISE EXCEPTION 'Unexpected publication state'; END IF;
 IF EXISTS(SELECT 1 FROM app.collection_control WHERE maintenance) THEN
   RAISE EXCEPTION 'Maintenance is still active';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.monitoring_refreshes
   WHERE id=r.checkpoint_id AND status='ready') THEN
   RAISE EXCEPTION 'Verified checkpoint is missing';
 END IF;
 IF (SELECT count(*) FROM reference.company_reps)<>3679178
    OR (SELECT count(birth_date) FROM reference.company_reps)<>3206578 THEN
   RAISE EXCEPTION 'ONRC totals do not match validated source';
 END IF;
 IF (SELECT count(*) FROM reference.company_financials)<>7186912
    OR (SELECT count(profit_net) FROM reference.company_financials)<>6692833 THEN
   RAISE EXCEPTION 'MF totals do not match validated source';
 END IF;
 IF (SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='reference' AND c.relname IN
   ('company_reps_cui_idx','company_reps_person_key_idx','company_reps_name_trgm_idx')
   AND i.indisvalid AND i.indisready)<>3 THEN
   RAISE EXCEPTION 'ONRC indexes are incomplete';
 END IF;
END $$;
SELECT id,status,applied_at,completed_at,
       report->'onrc'->'changed' AS onrc_recovered,
       report->'financials'->'changed' AS profits_recovered,
       jsonb_array_length(report->'financials'->'manifest') AS mf_source_groups,
       jsonb_array_length(report->'financials'->'skipped') AS mf_untouched_groups
FROM app.data_repairs WHERE id='reference-import-v1';
SELECT id,trigger,scope,status,stage,started_at,completed_at,
       completed_at-started_at AS elapsed,checkpoint_id,stages,search_verified
FROM app.processing_runs WHERE id='96c15b43-6ad8-4d41-a94d-16b9c160e114';
SELECT revision,paused,maintenance,blocked_reason,min_seconds,max_seconds,
       processing_enabled,processing_time,risk_weekday
FROM app.collection_control;
SELECT version,status,validation->'risk' AS risk,
       jsonb_array_length(validation->'checks') AS validation_checks,
       NOT EXISTS(SELECT 1 FROM jsonb_array_elements(validation->'checks') c
         WHERE (c->>'passed')::boolean IS DISTINCT FROM true) AS all_passed
FROM app.monitoring_refreshes
WHERE id=(SELECT checkpoint_id FROM app.processing_runs
          WHERE id='96c15b43-6ad8-4d41-a94d-16b9c160e114');
COMMIT;
