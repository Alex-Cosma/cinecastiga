CREATE TABLE "core"."scrape_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"window_start" timestamp with time zone,
	"window_end" timestamp with time zone,
	"status" text NOT NULL,
	"reported_total" integer,
	"fetched_count" integer DEFAULT 0 NOT NULL,
	"inserted_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"pages_fetched" integer DEFAULT 0 NOT NULL,
	"deviation" integer,
	"error" text
);
--> statement-breakpoint
CREATE INDEX "scrape_runs_source_started_idx" ON "core"."scrape_runs" USING btree ("source","started_at");