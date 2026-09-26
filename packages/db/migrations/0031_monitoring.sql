CREATE TABLE "app"."monitoring_refreshes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" bigserial NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"source_coverage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"methodology" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"validation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	CONSTRAINT "monitoring_refreshes_kind_check" CHECK ("app"."monitoring_refreshes"."kind" in ('coordinated', 'baseline', 'manual')),
	CONSTRAINT "monitoring_refreshes_status_check" CHECK ("app"."monitoring_refreshes"."status" in ('running', 'ready', 'failed')),
	CONSTRAINT "monitoring_refreshes_completion_check" CHECK (("app"."monitoring_refreshes"."status" = 'running' and "app"."monitoring_refreshes"."completed_at" is null) or ("app"."monitoring_refreshes"."status" <> 'running' and "app"."monitoring_refreshes"."completed_at" is not null)),
	CONSTRAINT "monitoring_refreshes_ready_check" CHECK ("app"."monitoring_refreshes"."status" <> 'ready' or ("app"."monitoring_refreshes"."kind" <> 'manual' and "app"."monitoring_refreshes"."error" is null))
);
--> statement-breakpoint
CREATE TABLE "app"."monitoring_case_links" (
	"run_id" uuid NOT NULL,
	"investigation_id" uuid NOT NULL,
	"clip_id" uuid NOT NULL,
	"before_capture_id" uuid NOT NULL,
	"after_capture_id" uuid NOT NULL,
	"task_id" uuid,
	CONSTRAINT "monitoring_case_links_run_id_investigation_id_pk" PRIMARY KEY("run_id","investigation_id")
);
--> statement-breakpoint
CREATE TABLE "app"."monitoring_deltas" (
	"run_id" uuid NOT NULL,
	"row_no" bigint NOT NULL,
	"source_key" text NOT NULL,
	"type" text NOT NULL,
	"classification" text NOT NULL,
	"before_record" jsonb,
	"after_record" jsonb,
	"changed_fields" jsonb NOT NULL,
	"amount_difference_exact" numeric,
	"relevant" boolean NOT NULL,
	CONSTRAINT "monitoring_deltas_run_id_row_no_pk" PRIMARY KEY("run_id","row_no"),
	CONSTRAINT "monitoring_deltas_type_check" CHECK ("app"."monitoring_deltas"."type" in ('added','removed','changed')),
	CONSTRAINT "monitoring_deltas_classification_check" CHECK ("app"."monitoring_deltas"."classification" in ('new_dated_record','historical_first_observed','date_unknown','left_selection','source_changed'))
);
--> statement-breakpoint
CREATE TABLE "app"."monitoring_reviews" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."monitoring_run_rows" (
	"run_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"row_no" bigint NOT NULL,
	"record" jsonb NOT NULL,
	"value_exact" numeric,
	CONSTRAINT "monitoring_run_rows_run_id_source_key_pk" PRIMARY KEY("run_id","source_key")
);
--> statement-breakpoint
CREATE TABLE "app"."monitoring_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"watch_id" uuid NOT NULL,
	"checkpoint_id" uuid NOT NULL,
	"previous_run_id" uuid,
	"kind" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_count" bigint NOT NULL,
	"total_exact" numeric,
	"known_value_exact" numeric NOT NULL,
	"unknown_values" bigint DEFAULT 0 NOT NULL,
	"previous_total_exact" numeric,
	"total_difference_exact" numeric,
	"counts" jsonb NOT NULL,
	"relevant_counts" jsonb NOT NULL,
	"preferences" jsonb NOT NULL,
	"has_alert" boolean DEFAULT false NOT NULL,
	"result_changed" boolean DEFAULT false NOT NULL,
	"methodology_changed" boolean DEFAULT false NOT NULL,
	"result" jsonb NOT NULL,
	"methodology" jsonb NOT NULL,
	"checkpoint" jsonb NOT NULL,
	"notes" jsonb NOT NULL,
	CONSTRAINT "monitoring_runs_kind_check" CHECK ("app"."monitoring_runs"."kind" in ('baseline','update','unchanged')),
	CONSTRAINT "monitoring_runs_count_check" CHECK ("app"."monitoring_runs"."row_count" between 0 and 200000 and "app"."monitoring_runs"."unknown_values" between 0 and "app"."monitoring_runs"."row_count")
);
--> statement-breakpoint
CREATE TABLE "app"."monitoring_watches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"title" text NOT NULL,
	"spec" jsonb NOT NULL,
	"options" jsonb NOT NULL,
	"grounding" jsonb NOT NULL,
	"scope_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preferences" jsonb NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"recipe_id" uuid,
	"recipe_version" bigint,
	"pinned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_run_id" uuid,
	"last_success_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monitoring_watches_title_check" CHECK (length("app"."monitoring_watches"."title") between 1 and 200),
	CONSTRAINT "monitoring_watches_recipe_check" CHECK (("app"."monitoring_watches"."recipe_id" is null and "app"."monitoring_watches"."recipe_version" is null) or ("app"."monitoring_watches"."recipe_id" is not null and "app"."monitoring_watches"."recipe_version">0))
);
--> statement-breakpoint
ALTER TABLE "app"."monitoring_case_links" ADD CONSTRAINT "monitoring_case_links_run_id_monitoring_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "app"."monitoring_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."monitoring_case_links" ADD CONSTRAINT "monitoring_case_links_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "app"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."monitoring_case_links" ADD CONSTRAINT "monitoring_case_links_clip_id_clips_id_fk" FOREIGN KEY ("clip_id") REFERENCES "app"."clips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."monitoring_deltas" ADD CONSTRAINT "monitoring_deltas_run_id_monitoring_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "app"."monitoring_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."monitoring_reviews" ADD CONSTRAINT "monitoring_reviews_run_id_monitoring_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "app"."monitoring_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."monitoring_run_rows" ADD CONSTRAINT "monitoring_run_rows_run_id_monitoring_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "app"."monitoring_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."monitoring_runs" ADD CONSTRAINT "monitoring_runs_watch_id_monitoring_watches_id_fk" FOREIGN KEY ("watch_id") REFERENCES "app"."monitoring_watches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."monitoring_runs" ADD CONSTRAINT "monitoring_runs_checkpoint_id_monitoring_refreshes_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "app"."monitoring_refreshes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."monitoring_watches" ADD CONSTRAINT "monitoring_watches_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "monitoring_refreshes_version_idx" ON "app"."monitoring_refreshes" USING btree ("version");--> statement-breakpoint
CREATE INDEX "monitoring_refreshes_status_version_idx" ON "app"."monitoring_refreshes" USING btree ("status","version");--> statement-breakpoint
CREATE UNIQUE INDEX "monitoring_deltas_source_uq" ON "app"."monitoring_deltas" USING btree ("run_id","source_key");--> statement-breakpoint
CREATE UNIQUE INDEX "monitoring_run_rows_cursor_uq" ON "app"."monitoring_run_rows" USING btree ("run_id","row_no");--> statement-breakpoint
CREATE UNIQUE INDEX "monitoring_runs_watch_checkpoint_uq" ON "app"."monitoring_runs" USING btree ("watch_id","checkpoint_id");--> statement-breakpoint
CREATE INDEX "monitoring_runs_watch_checked_idx" ON "app"."monitoring_runs" USING btree ("watch_id","checked_at","id");--> statement-breakpoint
CREATE INDEX "monitoring_watches_owner_created_idx" ON "app"."monitoring_watches" USING btree ("owner_user_id","created_at","id");