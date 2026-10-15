DROP INDEX "app"."processing_runs_day";--> statement-breakpoint
ALTER TABLE "app"."processing_runs" ADD COLUMN "trigger" text DEFAULT 'scheduled' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "processing_runs_day" ON "app"."processing_runs" USING btree ("scheduled_day") WHERE "app"."processing_runs"."trigger" = 'scheduled';--> statement-breakpoint
ALTER TABLE "app"."processing_runs" ADD CONSTRAINT "processing_trigger" CHECK ("app"."processing_runs"."trigger" in ('scheduled','manual'));