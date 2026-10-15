CREATE TABLE "app"."document_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"max_requests" integer NOT NULL,
	"requests_started" integer DEFAULT 0 NOT NULL,
	"max_files" integer NOT NULL,
	"concurrency" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "document_batch_limits" CHECK ("app"."document_batches"."max_requests" between 1 and 300 and "app"."document_batches"."requests_started" between 0 and "app"."document_batches"."max_requests" and "app"."document_batches"."max_files" between 1 and 50 and "app"."document_batches"."concurrency" between 1 and 10),
	CONSTRAINT "document_batch_status" CHECK ("app"."document_batches"."status" in ('running','complete','stopped'))
);
--> statement-breakpoint
DROP INDEX "app"."document_jobs_one_running";--> statement-breakpoint
ALTER TABLE "app"."document_jobs" ADD COLUMN "batch_id" text;--> statement-breakpoint
ALTER TABLE "app"."document_jobs" ADD COLUMN "slot" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."document_jobs" ADD CONSTRAINT "document_jobs_batch_id_document_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "app"."document_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_jobs_running_slot" ON "app"."document_jobs" USING btree ("slot") WHERE "app"."document_jobs"."status" = 'running';--> statement-breakpoint
ALTER TABLE "app"."document_jobs" ADD CONSTRAINT "document_job_slot" CHECK ("app"."document_jobs"."slot" between 0 and 13 and ("app"."document_jobs"."batch_id" is not null or "app"."document_jobs"."slot"=0));