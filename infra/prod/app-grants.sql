-- Applied on every migration deployment; matches the initial role setup.
-- Roles already exist; this never changes credentials.
GRANT USAGE ON SCHEMA core, marts, reference, raw, auth, app TO seap_web;
GRANT SELECT ON ALL TABLES IN SCHEMA core, marts, reference, raw TO seap_web;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth, app TO seap_web;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA auth, app TO seap_web;
ALTER DEFAULT PRIVILEGES FOR ROLE seap IN SCHEMA core, marts, reference, raw GRANT SELECT ON TABLES TO seap_web;
ALTER DEFAULT PRIVILEGES FOR ROLE seap IN SCHEMA auth, app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO seap_web;
ALTER DEFAULT PRIVILEGES FOR ROLE seap IN SCHEMA auth, app GRANT USAGE, SELECT ON SEQUENCES TO seap_web;
