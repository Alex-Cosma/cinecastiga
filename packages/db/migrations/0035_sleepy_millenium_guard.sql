CREATE TABLE "app"."collection_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"end_day" text NOT NULL,
	"status" text DEFAULT 'collecting' NOT NULL,
	"next_stream" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_batch_status" CHECK ("app"."collection_batches"."status" in ('collecting','collected','incomplete'))
);
--> statement-breakpoint
CREATE TABLE "app"."collection_tasks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"key" text NOT NULL,
	"partition" text NOT NULL,
	"stream" text NOT NULL,
	"kind" text NOT NULL,
	"params" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 10 NOT NULL,
	"result" jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_task_status" CHECK ("app"."collection_tasks"."status" in ('pending','running','complete','split','deferred','failed'))
);
--> statement-breakpoint
ALTER TABLE "app"."collection_tasks" ADD CONSTRAINT "collection_tasks_batch_id_collection_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "app"."collection_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "collection_task_key" ON "app"."collection_tasks" USING btree ("batch_id","key");--> statement-breakpoint
CREATE INDEX "collection_task_queue" ON "app"."collection_tasks" USING btree ("batch_id","status","stream","priority","id");--> statement-breakpoint
CREATE INDEX "collection_task_partition" ON "app"."collection_tasks" USING btree ("batch_id","partition");