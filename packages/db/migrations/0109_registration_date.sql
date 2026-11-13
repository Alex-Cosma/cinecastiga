-- The day a firm was registered at the trade register (owner, 13 November 2026: the signal "Contracte în prima lună
-- de la înființare" needs the day, not only the year).
--   reference.onrc_firm.registered_on   DATA_INMATRICULARE of each registration, kept by the ONRC import from now on
--   entity_profile.registered_on        the oldest one of the supplier's CUI (a seat move registers the firm again)
-- reference.onrc_firm is created by the ONRC import, not by a migration: on a database without it there is nothing
-- to alter. Nullable, no default: catalog-only changes. The register's column stays null until the next ONRC import
-- (an operator command) and the profile's until the marts build after it; the signal and the pages that show the
-- date have nothing to say until then.
DO $$
BEGIN
  IF to_regclass('reference.onrc_firm') IS NOT NULL THEN
    ALTER TABLE reference.onrc_firm ADD COLUMN IF NOT EXISTS registered_on date;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "marts"."entity_profile" ADD COLUMN IF NOT EXISTS "registered_on" date;
