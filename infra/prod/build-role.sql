-- The blue/green build's role (owner, 9 November 2026). The nightly build writes only the shadow schemas
-- (core_next, marts_next, reference_next, which it owns while it builds them) and the processing bookkeeping in app.
-- It has NO privilege on the live core, marts and reference: a SQL name that escapes the rewrite to the shadow schemas
-- fails with "permission denied" instead of reading or changing what the site serves. The swap hands everything it
-- built to seap (REASSIGN OWNED), so it never owns a live object either.
-- Run once, as the owner, with the password from .env (SEAP_BUILD_PASSWORD):
--   docker compose exec -T postgres psql -U seap -d seap -v pw="$SEAP_BUILD_PASSWORD" < build-role.sql
-- Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seap_build') THEN
    CREATE ROLE seap_build LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
ALTER ROLE seap_build PASSWORD :'pw';

GRANT CONNECT, TEMPORARY ON DATABASE seap TO seap_build;
-- Creates the shadow schemas' objects only through the prepared DDL (run as seap); may create its own tables inside them.
REVOKE ALL ON SCHEMA core, marts, reference FROM seap_build;
GRANT USAGE ON SCHEMA raw, app, public TO seap_build;
GRANT SELECT ON ALL TABLES IN SCHEMA raw TO seap_build;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO seap_build;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO seap_build;
ALTER DEFAULT PRIVILEGES FOR ROLE seap IN SCHEMA raw GRANT SELECT ON TABLES TO seap_build;
ALTER DEFAULT PRIVILEGES FOR ROLE seap IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO seap_build;
ALTER DEFAULT PRIVILEGES FOR ROLE seap IN SCHEMA app GRANT USAGE, SELECT ON SEQUENCES TO seap_build;
DO $$
BEGIN
  -- The archive audit the authority-fragment repair reads (absent on a fresh restore).
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'identity_repair') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA identity_repair TO seap_build';
    EXECUTE 'GRANT SELECT ON ALL TABLES IN SCHEMA identity_repair TO seap_build';
  END IF;
END $$;
-- reconcile and the stage scripts raise the temporary-file cap, a superuser parameter.
GRANT SET ON PARAMETER temp_file_limit TO seap_build;
