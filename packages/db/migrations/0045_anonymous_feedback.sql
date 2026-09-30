CREATE TABLE "app"."feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"message" text NOT NULL,
	"source_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_category_check" CHECK ("app"."feedback"."category" in ('data','bug','idea','other')),
	CONSTRAINT "feedback_message_check" CHECK (length("app"."feedback"."message") between 20 and 3000),
	CONSTRAINT "feedback_path_check" CHECK ("app"."feedback"."source_path" is null or (length("app"."feedback"."source_path") <= 400 and "app"."feedback"."source_path" like '/%'))
);
--> statement-breakpoint
CREATE TABLE "app"."feedback_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "feedback_created_idx" ON "app"."feedback" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "feedback_limits_expiry_idx" ON "app"."feedback_limits" USING btree ("expires_at");