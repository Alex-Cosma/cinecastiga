-- Blue/green processing (owner, 9 November 2026). A run either rebuilds in place behind maintenance ('in-place', as
-- until now) or builds into the shadow schemas core_next / marts_next / reference_next while the site stays open
-- ('shadow'). The validated shadow build waits for its swap with its checkpoint in pending_checkpoint; the swap
-- writes the ready app.monitoring_refreshes row in the same transaction as the schema rename. Constant default and a
-- nullable column: PostgreSQL adds both without rewriting the table.
ALTER TABLE "app"."processing_runs" ADD COLUMN IF NOT EXISTS "mode" text NOT NULL DEFAULT 'in-place';
ALTER TABLE "app"."processing_runs" ADD COLUMN IF NOT EXISTS "pending_checkpoint" jsonb;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'processing_mode') THEN
    ALTER TABLE "app"."processing_runs" ADD CONSTRAINT "processing_mode" CHECK ("mode" IN ('in-place', 'shadow'));
  END IF;
END $$;
