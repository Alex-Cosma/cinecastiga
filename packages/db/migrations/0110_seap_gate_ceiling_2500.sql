-- Owner, 14 November 2026: at most 2,500 requests a minute in total (packages/db/src/collection-limits.ts), the pause
-- per IP at 20-30 seconds, then 1,000 proxies. Ceiling only: the operator still sets the value in administration.
ALTER TABLE "app"."collection_proxy_control" DROP CONSTRAINT "proxy_rate_bounds";--> statement-breakpoint
ALTER TABLE "app"."collection_proxy_control" ADD CONSTRAINT "proxy_rate_bounds" CHECK ("app"."collection_proxy_control"."requests_per_minute" between 1 and 2500);
