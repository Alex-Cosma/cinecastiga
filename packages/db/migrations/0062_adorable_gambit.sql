-- Older quarantine rows predate an already-validated publication. Preserve
-- their history; only failures since the latest ready publication are pending.
ALTER TABLE "core"."quarantine" ADD COLUMN "retry_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."quarantine" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
UPDATE core.quarantine SET retry_required=true
WHERE created_at > coalesce((SELECT max(completed_at) FROM app.monitoring_refreshes WHERE status='ready'),'-infinity'::timestamptz);--> statement-breakpoint
ALTER TABLE core.quarantine ALTER COLUMN retry_required SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "app"."collection_control" ADD COLUMN "collection_during_maintenance" boolean DEFAULT false NOT NULL;
