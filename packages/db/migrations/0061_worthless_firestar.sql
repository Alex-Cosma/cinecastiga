ALTER TABLE "app"."collection_batches" ADD COLUMN "seed_end_day" text;--> statement-breakpoint
ALTER TABLE "app"."collection_batches" ADD COLUMN "follow_latest" boolean DEFAULT false NOT NULL;