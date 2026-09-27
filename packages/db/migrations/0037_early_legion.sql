CREATE TABLE "app"."processing_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scheduled_day" date NOT NULL,
	"scope" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"stage" text DEFAULT 'drain' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stage_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"control_revision" integer NOT NULL,
	"before_control" jsonb NOT NULL,
	"stages" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw_boundary" text,
	"checkpoint_id" uuid,
	"search_verified" jsonb,
	"error" text,
	CONSTRAINT "processing_scope" CHECK ("app"."processing_runs"."scope" in ('daily','full')),
	CONSTRAINT "processing_status" CHECK ("app"."processing_runs"."status" in ('running','ready','failed')),
	CONSTRAINT "processing_completion" CHECK (("app"."processing_runs"."status"='running' and "app"."processing_runs"."completed_at" is null) or ("app"."processing_runs"."status"<>'running' and "app"."processing_runs"."completed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "app"."collection_control" ADD COLUMN "processing_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."collection_control" ADD COLUMN "processing_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."collection_control" ADD COLUMN "risk_weekday" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "processing_runs_day" ON "app"."processing_runs" USING btree ("scheduled_day");--> statement-breakpoint
CREATE INDEX "processing_runs_started" ON "app"."processing_runs" USING btree ("started_at");
--> statement-breakpoint
ALTER TABLE "app"."collection_control" ADD CONSTRAINT "collection_risk_weekday" CHECK ("app"."collection_control"."risk_weekday" between 0 and 6);
--> statement-breakpoint
ALTER TABLE "app"."collection_control" ADD CONSTRAINT "collection_processing_activation" CHECK (not "app"."collection_control"."processing_enabled" or "app"."collection_control"."processing_enabled_at" is not null);
