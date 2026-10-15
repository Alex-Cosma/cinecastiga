CREATE TABLE "app"."document_collection_control" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"download_concurrency" integer DEFAULT 10 NOT NULL,
	"processing_concurrency" integer DEFAULT 4 NOT NULL,
	"started_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"scanned_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "document_collection_singleton" CHECK ("app"."document_collection_control"."id"=1),
	CONSTRAINT "document_collection_concurrency" CHECK ("app"."document_collection_control"."download_concurrency" between 1 and 10 and "app"."document_collection_control"."processing_concurrency" between 1 and 4)
);
--> statement-breakpoint
ALTER TABLE "app"."document_jobs" DROP CONSTRAINT "document_job_slot";--> statement-breakpoint
ALTER TABLE "app"."document_jobs" ADD COLUMN "automatic" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."document_jobs" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."document_jobs" ADD COLUMN "retry_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."document_notices" ADD COLUMN "automatic" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."document_notices" ADD COLUMN "source_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."document_jobs" ADD CONSTRAINT "document_job_slot" CHECK ("app"."document_jobs"."slot" between 0 and 13 and ("app"."document_jobs"."batch_id" is not null or "app"."document_jobs"."automatic" or "app"."document_jobs"."slot"=0));
--> statement-breakpoint
INSERT INTO app.document_collection_control(id) VALUES(1) ON CONFLICT DO NOTHING;
