-- Applied on every migration deployment; matches the initial role setup.
-- Roles already exist; this never changes credentials.
GRANT USAGE ON SCHEMA core, marts, reference, raw, auth, app TO seap_web;
GRANT SELECT ON ALL TABLES IN SCHEMA core, marts, reference, raw TO seap_web;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth, app TO seap_web;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA auth, app TO seap_web;
ALTER DEFAULT PRIVILEGES FOR ROLE seap IN SCHEMA core, marts, reference, raw GRANT SELECT ON TABLES TO seap_web;
ALTER DEFAULT PRIVILEGES FOR ROLE seap IN SCHEMA auth, app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO seap_web;
ALTER DEFAULT PRIVILEGES FOR ROLE seap IN SCHEMA auth, app GRANT USAGE, SELECT ON SEQUENCES TO seap_web;
-- Launch audit, 12 November 2026. The nightly run's journal is written only by the processing role: with write access a
-- compromised web or documents worker could add fake "ready" runs, and the retention script, which trusts them, would
-- delete every real dump. The web reads it (admin, freshness) and never writes it.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON app.processing_runs FROM seap_web;
-- The web (one shared pool of 14 plus Ask, facets, intent, the gate: 33, apps/web/instrumentation.ts) and the documents
-- worker (30) share this role; the cap keeps the collector and the nightly run their connections in a traffic spike.
ALTER ROLE seap_web CONNECTION LIMIT 64;
