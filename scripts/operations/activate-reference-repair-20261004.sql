-- Owner-authorized immediate maintenance, 4 October 2026.
-- Registers one operation only; does not alter references or enter maintenance.
-- Run only after successful deploy and verification of the pinned bundle.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT id FROM app.collection_control WHERE id=1 FOR UPDATE;
DO $$
BEGIN
 IF (clock_timestamp() AT TIME ZONE 'Europe/Bucharest')::date <> DATE '2026-10-04' THEN
   RAISE EXCEPTION 'This authorization is for 4 October 2026 only';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='app' AND table_name='processing_runs' AND column_name='trigger') THEN
   RAISE EXCEPTION 'Manual publication migration is required';
 END IF;
 IF EXISTS(SELECT 1 FROM app.collection_control WHERE maintenance)
    OR EXISTS(SELECT 1 FROM app.processing_runs WHERE status='running') THEN
   RAISE EXCEPTION 'Existing maintenance must be resolved first';
 END IF;
 IF EXISTS(SELECT 1 FROM app.data_repairs WHERE id='reference-import-v1') THEN
   RAISE EXCEPTION 'Repair already registered; inspect its state instead of reactivating';
 END IF;
 IF (SELECT count(*) FROM app.data_repairs WHERE id IN ('contract-money-v1','contract-publication-identity-v1') AND status='completed')<>2 THEN
   RAISE EXCEPTION 'Previous historical repairs are not completed';
 END IF;
END $$;
INSERT INTO app.data_repairs(id,scheduled_day,report)
VALUES('reference-import-v1','2026-10-04',jsonb_build_object(
 'configuration',jsonb_build_object('directory','/repairs/reference-import-v1',
 'manifestSha256','5ef5a9610204f12c9103268518a78f56aef06b25afa41185919f41f507268f2e')));
COMMIT;
