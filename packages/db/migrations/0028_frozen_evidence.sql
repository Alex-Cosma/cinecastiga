CREATE TABLE "app"."evidence_capture_rows" (
	"capture_id" uuid NOT NULL,
	"row_no" bigint NOT NULL,
	"record" jsonb NOT NULL,
	"value_exact" numeric,
	CONSTRAINT "evidence_capture_rows_capture_id_row_no_pk" PRIMARY KEY("capture_id","row_no")
);
--> statement-breakpoint
CREATE TABLE "app"."evidence_captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"clip_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_by" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"request" jsonb NOT NULL,
	"summary" jsonb,
	"result" jsonb,
	"coverage" jsonb,
	"methodology" jsonb,
	"row_count" bigint,
	"total_exact" numeric,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "evidence_captures_version_check" CHECK ("app"."evidence_captures"."version" > 0),
	CONSTRAINT "evidence_captures_status_check" CHECK ("app"."evidence_captures"."status" in ('queued','running','complete','failed'))
);
--> statement-breakpoint
ALTER TABLE "app"."evidence_capture_rows" ADD CONSTRAINT "evidence_capture_rows_capture_id_evidence_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "app"."evidence_captures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."evidence_captures" ADD CONSTRAINT "evidence_captures_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "app"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."evidence_captures" ADD CONSTRAINT "evidence_captures_clip_id_clips_id_fk" FOREIGN KEY ("clip_id") REFERENCES "app"."clips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_captures_clip_version_uq" ON "app"."evidence_captures" USING btree ("clip_id","version");--> statement-breakpoint
CREATE INDEX "evidence_captures_status_idx" ON "app"."evidence_captures" USING btree ("status");