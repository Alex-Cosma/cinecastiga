ALTER TABLE "marts"."entity_profile" ADD COLUMN "country_code" text;--> statement-breakpoint
ALTER TABLE "marts"."entity_profile" ADD COLUMN "is_foreign" boolean DEFAULT false NOT NULL;