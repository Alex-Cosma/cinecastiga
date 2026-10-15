CREATE TABLE "app"."operational_alerts" (
	"key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"recipients" integer,
	"error" text,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "operational_alert_status" CHECK ("app"."operational_alerts"."status" in ('pending','sent','failed'))
);
--> statement-breakpoint
CREATE INDEX "operational_alerts_kind_open" ON "app"."operational_alerts" USING btree ("kind") WHERE "app"."operational_alerts"."resolved_at" is null;