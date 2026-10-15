-- Dated, explicitly authorized historical LIST inventory. No PDF/form/contract sweep.
-- Verify the deployed collector supports inventoryOnly before applying.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.collection_control WHERE id=1 AND NOT paused AND maintenance AND blocked_reason IS NULL FOR UPDATE)
 THEN RAISE EXCEPTION 'Inspect changed collection control'; END IF;
 IF EXISTS(SELECT 1 FROM app.processing_runs WHERE status='running') THEN RAISE EXCEPTION 'Processing active'; END IF;
END $$;
INSERT INTO app.collection_tasks(batch_id,key,partition,stream,kind,params,priority)
 SELECT 'recovery-2026-09-25',f||':list::'||d::date||':'||d::date||':inventory:0',
 f||':list::'||d::date||':'||d::date||':inventory',f,'list',
 jsonb_build_object('from',d::date::text,'to',d::date::text,'page',0,'inventoryOnly',true),20
 FROM generate_series('2018-01-01'::date,'2025-12-31'::date,interval '1 day') days(d) CROSS JOIN unnest(array['tenders','awards']) f ORDER BY d DESC,f
 ON CONFLICT(batch_id,key) DO NOTHING;
UPDATE app.collection_batches SET status='collecting' WHERE id='recovery-2026-09-25';
INSERT INTO app.collection_audit(actor_id,actor_name,action,before,after)
VALUES('system:notice-identity-20261009','Sistem','notice-historical-inventory','{}',
 '{"mode":"list-only","ratesUnchanged":true,"scope":"2018-01-01 through 2025-12-31, both notice families"}'::jsonb);
COMMIT;
