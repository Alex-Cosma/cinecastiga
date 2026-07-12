CREATE SCHEMA IF NOT EXISTS "core";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "raw";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "marts";
--> statement-breakpoint
CREATE TABLE "core"."ingestion_watermarks" (
	"source" text PRIMARY KEY NOT NULL,
	"cursor" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw"."raw_documents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"endpoint_version" text NOT NULL,
	"content_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "raw_documents_source_ext_hash_uq" ON "raw"."raw_documents" USING btree ("source","external_id","content_hash");--> statement-breakpoint
CREATE INDEX "raw_documents_source_fetched_idx" ON "raw"."raw_documents" USING btree ("source","fetched_at");