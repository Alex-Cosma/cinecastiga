CREATE TABLE "app"."collection_audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."collection_control" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"min_seconds" integer DEFAULT 50 NOT NULL,
	"max_seconds" integer DEFAULT 70 NOT NULL,
	"daily_limit" integer,
	"processing_time" text DEFAULT '05:00' NOT NULL,
	"paused" boolean DEFAULT true NOT NULL,
	"paused_streams" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"blocked_reason" text,
	"blocked_until" timestamp with time zone,
	"next_allowed_at" timestamp with time zone,
	"last_file_at" timestamp with time zone,
	"maintenance" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_singleton" CHECK ("app"."collection_control"."id"=1),
	CONSTRAINT "collection_delay_bounds" CHECK ("app"."collection_control"."min_seconds" between 1 and 3600 and "app"."collection_control"."max_seconds" between "app"."collection_control"."min_seconds" and 3600),
	CONSTRAINT "collection_daily_limit" CHECK ("app"."collection_control"."daily_limit" is null or "app"."collection_control"."daily_limit">0),
	CONSTRAINT "collection_processing_time" CHECK ("app"."collection_control"."processing_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
--> statement-breakpoint
CREATE TABLE "app"."collection_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"stream" text NOT NULL,
	"worker" text NOT NULL,
	"method" text NOT NULL,
	"endpoint" text NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" integer,
	"outcome" text DEFAULT 'running' NOT NULL,
	"error" text,
	"records" integer,
	"bytes" bigint,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "collection_request_outcome" CHECK ("app"."collection_requests"."outcome" in ('running','success','failed','interrupted'))
);
--> statement-breakpoint
CREATE TABLE "app"."collection_workers" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"state" text NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "collection_requests_started" ON "app"."collection_requests" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "collection_requests_stream_started" ON "app"."collection_requests" USING btree ("stream","started_at");--> statement-breakpoint
INSERT INTO app.collection_control (id) VALUES (1) ON CONFLICT DO NOTHING;
