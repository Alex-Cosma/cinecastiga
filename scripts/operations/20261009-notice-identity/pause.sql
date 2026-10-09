-- One-time rollout pause. Preserve maintenance, limits and proxy configuration.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.collection_control WHERE revision=101 AND NOT paused AND maintenance AND blocked_reason IS NULL FOR UPDATE)
 THEN RAISE EXCEPTION 'Control changed; inspect before rollout'; END IF;
 IF EXISTS(SELECT 1 FROM app.collection_requests WHERE outcome='running') OR EXISTS(SELECT 1 FROM app.collection_tasks WHERE status='running')
 OR EXISTS(SELECT 1 FROM app.processing_runs WHERE status='running') THEN RAISE EXCEPTION 'Work is active; drain first'; END IF;
END $$;
INSERT INTO app.collection_audit(actor_id,actor_name,action,before,after)
SELECT 'system:notice-identity-20261009','Sistem','notice-identity-pause',to_jsonb(c),'{"paused":true,"purpose":"scoped notice identity migration"}'::jsonb FROM app.collection_control c;
UPDATE app.collection_control SET paused=true,revision=revision+1,updated_at=now() WHERE id=1;
COMMIT;
