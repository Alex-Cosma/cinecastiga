CREATE TABLE "app"."collection_retries" (
	"task_id" bigint PRIMARY KEY NOT NULL,
	"first_request_id" bigint NOT NULL,
	"last_request_id" bigint NOT NULL,
	"timeouts" integer NOT NULL,
	"status" text NOT NULL,
	"retry_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_retry_timeouts" CHECK ("app"."collection_retries"."timeouts" between 1 and 3),
	CONSTRAINT "collection_retry_status" CHECK ("app"."collection_retries"."status" in ('pending','resolved','stopped')),
	CONSTRAINT "collection_retry_due" CHECK ("app"."collection_retries"."status"<>'pending' or "app"."collection_retries"."retry_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "app"."collection_retries" ADD CONSTRAINT "collection_retries_task_id_collection_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "app"."collection_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "collection_one_pending_retry" ON "app"."collection_retries" USING btree ("status") WHERE "app"."collection_retries"."status"='pending';