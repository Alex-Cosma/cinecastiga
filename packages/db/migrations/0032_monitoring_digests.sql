CREATE TABLE "app"."monitoring_digest_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"recipient_email" text NOT NULL,
	"period" date NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"run_ids" jsonb NOT NULL,
	"update_count" integer NOT NULL,
	"message_id" text,
	"error" text,
	"started_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monitoring_digest_status_check" CHECK ("app"."monitoring_digest_deliveries"."status" in ('queued','sending','sent','failed','uncertain','cancelled')),
	CONSTRAINT "monitoring_digest_count_check" CHECK ("app"."monitoring_digest_deliveries"."update_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "app"."monitoring_digest_deliveries" ADD CONSTRAINT "monitoring_digest_deliveries_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "monitoring_digest_owner_period_uq" ON "app"."monitoring_digest_deliveries" USING btree ("owner_user_id","period");--> statement-breakpoint
CREATE INDEX "monitoring_digest_status_updated_idx" ON "app"."monitoring_digest_deliveries" USING btree ("status","updated_at");