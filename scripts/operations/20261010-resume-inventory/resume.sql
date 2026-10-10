-- One-shot resumption after the fresh 180/180 source proof; preserve public live mode.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.collection_control WHERE id=1 AND revision=113 AND paused AND NOT maintenance AND blocked_reason IS NULL FOR UPDATE)
 THEN RAISE EXCEPTION 'Inspect changed operator state'; END IF;
 IF EXISTS(SELECT 1 FROM app.processing_runs WHERE status='running') OR EXISTS(SELECT 1 FROM app.collection_tasks WHERE status='running')
 THEN RAISE EXCEPTION 'Work is active'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.collection_tasks WHERE key='awards:list::2024-11-28:2024-11-28:inventory:single:180:0' AND status='complete' AND (result->>'total')::int=180 AND jsonb_array_length(result->'ids')=180 AND (SELECT count(DISTINCT x) FROM jsonb_array_elements_text(result->'ids') x)=180)
 THEN RAISE EXCEPTION '180 distinct archived source identities are required'; END IF;
 IF (SELECT count(*) FROM app.collection_tasks WHERE id IN (537029,542533) AND status='split' AND result->>'supersededBy'='awards:list::2024-11-28:2024-11-28:inventory:single:180:0')<>2
 THEN RAISE EXCEPTION 'Original pagination evidence changed'; END IF;
 IF EXISTS(SELECT 1 FROM app.collection_audit WHERE actor_id='ops:inventory-resume-20261010') THEN RAISE EXCEPTION 'Already resumed'; END IF;
END $$;
INSERT INTO app.collection_audit(actor_id,actor_name,action,before,after)
 VALUES('ops:inventory-resume-20261010','Reluare colectare','unblock','{"revision":113,"paused":true}',
 '{"revision":114,"paused":false,"verifiedDay":"2024-11-28","distinct":180,"sourceTotal":180,"ratesUnchanged":true,"publicMaintenance":false}');
UPDATE app.collection_batches SET status='collecting' WHERE id='recovery-2026-09-25';
UPDATE app.collection_control SET paused=false,revision=114,updated_at=clock_timestamp() WHERE id=1;
COMMIT;
