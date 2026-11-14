-- Owner, 14 November 2026: up to 50 SEAP requests in flight and 50 background lanes (packages/db/src/collection-limits.ts),
-- with PostgreSQL at 150 connections. Ceilings only: the operator still sets the values in administration.
ALTER TABLE "app"."collection_proxy_control" DROP CONSTRAINT "proxy_concurrency_bounds";--> statement-breakpoint
ALTER TABLE "app"."collection_proxy_control" ADD CONSTRAINT "proxy_concurrency_bounds" CHECK ("app"."collection_proxy_control"."max_in_flight" between 1 and 50);--> statement-breakpoint
ALTER TABLE "app"."collection_control" DROP CONSTRAINT "collection_background_lanes";--> statement-breakpoint
ALTER TABLE "app"."collection_control" ADD CONSTRAINT "collection_background_lanes" CHECK ("app"."collection_control"."background_lanes" between 0 and 50);
