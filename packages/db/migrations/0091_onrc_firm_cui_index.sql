-- The entity page reads ONRC's names for a CUI (a renamed firm, 1 November 2026): an index
-- on reference.onrc_firm(cui), which the ONRC import also creates. reference.onrc_firm is
-- created by the ONRC import, not by a migration: on a database without it there is nothing to index.
DO $$
BEGIN
  IF to_regclass('reference.onrc_firm') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS onrc_firm_cui_idx ON reference.onrc_firm (cui);
  END IF;
END $$;
