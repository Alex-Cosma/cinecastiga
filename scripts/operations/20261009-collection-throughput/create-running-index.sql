-- One-time, authorized production prebuild. Run with psql ON_ERROR_STOP=1,
-- outside a transaction. Do not repeat blindly after an interrupted build:
-- inspect pg_index.indisvalid / indisready first. Migration0063 records it.
SET lock_timeout='5s';
SET statement_timeout='5min';
CREATE INDEX CONCURRENTLY collection_requests_running
ON app.collection_requests USING btree (id) WHERE outcome='running';
SELECT i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid)
FROM pg_index i WHERE i.indexrelid='app.collection_requests_running'::regclass;
