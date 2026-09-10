-- Application role for the web container: read everything, write only the
-- auth + investigations tables. Run once after the restore, as the owner:
--   docker compose exec -T postgres psql -U seap -d seap -v pw="$SEAP_WEB_PASSWORD" < roles.sql
-- (SEAP_WEB_PASSWORD must match .env). Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seap_web') THEN
    CREATE ROLE seap_web LOGIN;
  END IF;
END $$;
ALTER ROLE seap_web PASSWORD :'pw';

GRANT USAGE ON SCHEMA core, marts, reference, raw, auth, app TO seap_web;
GRANT SELECT ON ALL TABLES IN SCHEMA core, marts, reference, raw TO seap_web;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth, app TO seap_web;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA auth, app TO seap_web;

-- Tables created by future rebuilds (owner seap) stay readable.
ALTER DEFAULT PRIVILEGES FOR ROLE seap IN SCHEMA core, marts, reference, raw GRANT SELECT ON TABLES TO seap_web;
ALTER DEFAULT PRIVILEGES FOR ROLE seap IN SCHEMA auth, app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO seap_web;

-- Guard rails: no query from the web may run long or hold a transaction idle.
ALTER ROLE seap_web SET statement_timeout = '30s';
ALTER ROLE seap_web SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE seap_web SET search_path = public;
