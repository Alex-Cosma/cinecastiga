CREATE TABLE "app"."data_repairs" (
	"id" text PRIMARY KEY NOT NULL,
	"scheduled_day" date NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"processing_run_id" uuid,
	"report" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "data_repair_status" CHECK ("app"."data_repairs"."status" in ('scheduled','applied','completed','failed'))
);
