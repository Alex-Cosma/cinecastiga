-- Version of everything the current contract identity snapshot hashes read
-- (readContractIdentityMembers: core.contracts, core.awards,
-- core.contract_winners, core.entities, and nothing else). A daily processing
-- run computed the hash of every approved member up to nine times, ~2 minutes
-- each in production (23 October 2026), although nothing they read changed in
-- between. With this row the run reuses one computation while the version is
-- unchanged (SnapshotHashCache in packages/db/src/contract-identity.ts); the
-- publication validation still recomputes every hash.
--
-- Each transaction that writes a source relation (INSERT, UPDATE, DELETE,
-- TRUNCATE, including statements that change no row) stamps the row once with
-- a new sequence value and its transaction id. Sequence values are never
-- reused, even after a rollback, so two reads of the same version saw the same
-- committed source rows. Statement-level triggers: no per-row work on the
-- 1.3M-row contracts table; later statements of the same transaction match no
-- row (changed_by is already theirs) and write nothing. Concurrent writers of
-- these tables wait for each other's commit on this row; in production the
-- only writer is the sequential processing run.
--
-- Idempotent: every statement can run again. CREATE TRIGGER takes a SHARE ROW
-- EXCLUSIVE lock for an instant (no table rewrite or scan); writers wait, reads
-- continue. seap_web keeps SELECT through the marts default privileges
-- (infra/prod/app-grants.sql); only the owner role writes core tables.
CREATE SEQUENCE IF NOT EXISTS "marts"."contract_identity_source_version_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marts"."contract_identity_source_state" (
	"id" smallint PRIMARY KEY NOT NULL,
	"instance" uuid DEFAULT gen_random_uuid() NOT NULL,
	"version" bigint NOT NULL,
	"changed_by" "xid8",
	CONSTRAINT "contract_identity_source_state_single" CHECK ("marts"."contract_identity_source_state"."id" = 1)
);
--> statement-breakpoint
INSERT INTO marts.contract_identity_source_state(id, version)
VALUES (1, nextval('marts.contract_identity_source_version_seq'))
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION marts.contract_identity_source_changed() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  UPDATE marts.contract_identity_source_state
     SET version = nextval('marts.contract_identity_source_version_seq'),
         changed_by = pg_current_xact_id()
   WHERE id = 1 AND changed_by IS DISTINCT FROM pg_current_xact_id();
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER contract_identity_source_changed
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON core.contracts
FOR EACH STATEMENT EXECUTE FUNCTION marts.contract_identity_source_changed();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER contract_identity_source_changed
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON core.awards
FOR EACH STATEMENT EXECUTE FUNCTION marts.contract_identity_source_changed();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER contract_identity_source_changed
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON core.contract_winners
FOR EACH STATEMENT EXECUTE FUNCTION marts.contract_identity_source_changed();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER contract_identity_source_changed
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON core.entities
FOR EACH STATEMENT EXECUTE FUNCTION marts.contract_identity_source_changed();
