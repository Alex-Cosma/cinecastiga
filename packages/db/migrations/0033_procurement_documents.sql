CREATE TABLE "app"."document_blobs" (
	"hash" text PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL,
	"mime" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_blob_size" CHECK (octet_length("app"."document_blobs"."bytes") <= 52428800)
);
--> statement-breakpoint
CREATE TABLE "app"."document_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notice_key" text NOT NULL,
	"document_id" uuid,
	"kind" text NOT NULL,
	"dedup_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"stage" text DEFAULT 'queued' NOT NULL,
	"pages_done" integer DEFAULT 0 NOT NULL,
	"pages_total" integer,
	"error" text,
	"requested_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "document_job_status" CHECK ("app"."document_jobs"."status" in ('queued','running','complete','failed')),
	CONSTRAINT "document_job_kind" CHECK ("app"."document_jobs"."kind" in ('list','file'))
);
--> statement-breakpoint
CREATE TABLE "app"."document_notices" (
	"key" text PRIMARY KEY NOT NULL,
	"notice_id" text NOT NULL,
	"notice_type" integer NOT NULL,
	"notice_no" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"checked_at" timestamp with time zone,
	"total" integer
);
--> statement-breakpoint
CREATE TABLE "app"."document_pages" (
	"document_id" uuid NOT NULL,
	"page" integer NOT NULL,
	"text" text NOT NULL,
	"method" text NOT NULL,
	CONSTRAINT "document_pages_document_id_page_pk" PRIMARY KEY("document_id","page"),
	CONSTRAINT "document_page_positive" CHECK ("app"."document_pages"."page">0)
);
--> statement-breakpoint
CREATE TABLE "app"."document_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"method" text NOT NULL,
	"endpoint" text NOT NULL,
	"status" integer,
	"bytes" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."procurement_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notice_key" text NOT NULL,
	"source_id" text NOT NULL,
	"code" text NOT NULL,
	"filename" text NOT NULL,
	"published_at" text,
	"original_hash" text,
	"pdf_hash" text,
	"downloaded_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"page_count" integer,
	"signature" text,
	"processor" text
);
--> statement-breakpoint
ALTER TABLE "app"."document_jobs" ADD CONSTRAINT "document_jobs_notice_key_document_notices_key_fk" FOREIGN KEY ("notice_key") REFERENCES "app"."document_notices"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."document_jobs" ADD CONSTRAINT "document_jobs_document_id_procurement_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "app"."procurement_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."document_pages" ADD CONSTRAINT "document_pages_document_id_procurement_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "app"."procurement_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."document_requests" ADD CONSTRAINT "document_requests_job_id_document_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "app"."document_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."procurement_documents" ADD CONSTRAINT "procurement_documents_notice_key_document_notices_key_fk" FOREIGN KEY ("notice_key") REFERENCES "app"."document_notices"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."procurement_documents" ADD CONSTRAINT "procurement_documents_original_hash_document_blobs_hash_fk" FOREIGN KEY ("original_hash") REFERENCES "app"."document_blobs"("hash") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."procurement_documents" ADD CONSTRAINT "procurement_documents_pdf_hash_document_blobs_hash_fk" FOREIGN KEY ("pdf_hash") REFERENCES "app"."document_blobs"("hash") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_jobs_active_key" ON "app"."document_jobs" USING btree ("dedup_key") WHERE "app"."document_jobs"."status" in ('queued','running');--> statement-breakpoint
CREATE UNIQUE INDEX "document_jobs_one_running" ON "app"."document_jobs" USING btree ("status") WHERE "app"."document_jobs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "document_jobs_queue" ON "app"."document_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "procurement_document_source_uq" ON "app"."procurement_documents" USING btree ("notice_key","source_id");