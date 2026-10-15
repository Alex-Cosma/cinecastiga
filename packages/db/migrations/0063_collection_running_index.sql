-- Production prebuilds this index CONCURRENTLY before the transactional migrator.
-- Fresh installations create it here; preserve the normal migration history.
CREATE INDEX IF NOT EXISTS "collection_requests_running" ON "app"."collection_requests" USING btree ("id") WHERE "app"."collection_requests"."outcome" = 'running';
