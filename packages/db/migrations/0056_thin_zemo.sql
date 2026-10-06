DROP INDEX "app"."collection_one_pending_retry";--> statement-breakpoint
ALTER TABLE "app"."collection_proxies" ADD COLUMN "consecutive_failures" integer DEFAULT 0 NOT NULL;