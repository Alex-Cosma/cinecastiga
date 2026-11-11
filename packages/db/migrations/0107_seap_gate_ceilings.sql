-- Owner, 11 November 2026: 500 proxies; at most 1,000 requests a minute in total, up to 30 at once
-- (packages/db/src/collection-limits.ts). Ceilings only: the operator still sets the values in administration.
ALTER TABLE "app"."collection_proxy_control" DROP CONSTRAINT "proxy_concurrency_bounds";--> statement-breakpoint
ALTER TABLE "app"."collection_proxy_control" ADD CONSTRAINT "proxy_concurrency_bounds" CHECK ("app"."collection_proxy_control"."max_in_flight" between 1 and 30);--> statement-breakpoint
ALTER TABLE "app"."collection_proxy_control" DROP CONSTRAINT "proxy_rate_bounds";--> statement-breakpoint
ALTER TABLE "app"."collection_proxy_control" ADD CONSTRAINT "proxy_rate_bounds" CHECK ("app"."collection_proxy_control"."requests_per_minute" between 1 and 1000);--> statement-breakpoint
ALTER TABLE "app"."collection_control" DROP CONSTRAINT "collection_background_lanes";--> statement-breakpoint
ALTER TABLE "app"."collection_control" ADD CONSTRAINT "collection_background_lanes" CHECK ("app"."collection_control"."background_lanes" between 0 and 30);
