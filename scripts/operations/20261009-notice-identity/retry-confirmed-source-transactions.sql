-- One additional manual retry after inspecting four SEAP transaction errors.
-- These were HTTP400 with an explicit SEAP internal DB error, not malformed queries.
-- No generic automatic HTTP400 retry policy is introduced.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM app.collection_audit WHERE action='notice-identity-source-transaction-retry')
 THEN RAISE EXCEPTION 'This one-time retry already ran'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.collection_control WHERE NOT paused AND maintenance AND blocked_reason IS NULL FOR UPDATE)
 OR EXISTS(SELECT 1 FROM app.processing_runs WHERE status='running') THEN RAISE EXCEPTION 'Inspect control/processing'; END IF;
 IF (SELECT count(*) FROM app.collection_tasks t WHERE id=ANY(ARRAY[86142,100727,267941,535971]::bigint[])
 AND status='failed' AND finished_at<clock_timestamp()-interval '5 minutes'
 AND (SELECT r.diagnostics->'response'->>'body' FROM app.collection_requests r
      WHERE r.diagnostics->'context'->>'taskId'=t.id::text ORDER BY r.id DESC LIMIT 1)
 LIKE '%Connection is already part of a local or a distributed transaction%')<>4
 THEN RAISE EXCEPTION 'Reviewed failures changed or five-minute cooldown has not elapsed'; END IF;
END $$;
INSERT INTO app.collection_audit(actor_id,actor_name,action,before,after)
SELECT 'system:notice-identity-20261009','Sistem','notice-identity-source-transaction-retry',
 jsonb_build_object('tasks',(SELECT jsonb_agg(to_jsonb(t)) FROM app.collection_tasks t WHERE id=ANY(ARRAY[86142,100727,267941,535971]::bigint[])),
 'retryBudgets',(SELECT jsonb_agg(to_jsonb(r)) FROM app.collection_retries r WHERE task_id=ANY(ARRAY[86142,100727,267941,535971]::bigint[]))),
 '{"manualAttempts":4,"sourceError":"EnlistTransaction","rateSettingsUnchanged":true}';
DELETE FROM app.collection_retries WHERE task_id=ANY(ARRAY[86142,100727,267941,535971]::bigint[]);
UPDATE app.collection_tasks SET status='pending',error=null,started_at=null,finished_at=null WHERE id=ANY(ARRAY[86142,100727,267941,535971]::bigint[]);
UPDATE app.collection_batches SET status='collecting' WHERE id='recovery-2026-09-25';
COMMIT;
