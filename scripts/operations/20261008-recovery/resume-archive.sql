-- DATED INCIDENT ONLY. Host must verify backup checksum and build current collector first.
-- Owner authorized archive collection today, public maintenance until tonight.
BEGIN;
DO $$
DECLARE c app.collection_control%ROWTYPE; r app.processing_runs%ROWTYPE;
BEGIN
 SELECT * INTO c FROM app.collection_control WHERE id=1 FOR UPDATE;
 SELECT * INTO r FROM app.processing_runs ORDER BY started_at DESC LIMIT 1;
 IF (clock_timestamp() AT TIME ZONE 'Europe/Bucharest')::date <> DATE '2026-10-08'
  OR c.id IS NULL OR r.id IS NULL OR c.revision<>95 OR NOT c.paused OR NOT c.maintenance OR c.collection_during_maintenance
  OR c.blocked_reason IS NOT NULL OR NOT c.processing_enabled OR c.processing_time<>'05:00'
  OR r.id<>'6a186851-6a54-4d94-af23-9607f76f8132'::uuid OR r.status<>'failed'
  OR r.raw_boundary<>18004783 OR r.stages->'backup-verified'->>'completedAt' IS NULL
  OR EXISTS(SELECT 1 FROM app.processing_runs WHERE status='running')
  OR EXISTS(SELECT 1 FROM app.collection_requests WHERE outcome='running')
  OR EXISTS(SELECT 1 FROM app.collection_tasks WHERE status='running')
  OR EXISTS(SELECT 1 FROM app.document_jobs WHERE status='running') THEN
  RAISE EXCEPTION 'Recovery preconditions changed; inspect before any mutation';
 END IF;
 IF (SELECT status FROM app.monitoring_refreshes ORDER BY version DESC LIMIT 1)<>'failed' THEN
  RAISE EXCEPTION 'Unexpected publication state';
 END IF;
 UPDATE app.collection_control SET paused=false,maintenance=true,collection_during_maintenance=true,
  revision=revision+1,updated_at=clock_timestamp() WHERE id=1;
 INSERT INTO app.collection_audit(actor_id,actor_name,action,before,after)
 VALUES('ops:20261008-recovery','Intervenție autorizată','resume-archive-during-maintenance',
  jsonb_build_object('revision',c.revision,'paused',true,'maintenance',true),
  jsonb_build_object('revision',c.revision+1,'paused',false,'maintenance',true,
   'collectionDuringMaintenance',true,'failedRun',r.id,'processingToday',false,
   'backup','processing/6a186851-6a54-4d94-af23-9607f76f8132/database.dump',
   'reason','Owner prioritized raw collection today; verified publication retries at next scheduled 05:00'));
END $$;
COMMIT;
