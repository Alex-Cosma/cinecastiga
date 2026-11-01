-- The ONRC person key folds the name's punctuation and spacing (owner decision of
-- 1 November 2026, personKeySql in packages/db/src/onrc-identity.ts): "NASTASĂ MARIA
-- MONICA" and "NASTASĂ MARIA-MONICA" with the same birth date and locality are one
-- person. Only the keys whose name part changes are rewritten. The name part gets
-- an index: an individual practice's holder is looked up by name on its page.
-- reference.company_reps is created by the ONRC import, not by a migration: on a
-- database without it there is nothing to rewrite.
DO $$
BEGIN
  IF to_regclass('reference.company_reps') IS NOT NULL THEN
    UPDATE reference.company_reps
      SET person_key = btrim(regexp_replace(lower(unaccent(person_name)), '[^a-z]+', ' ', 'g')) || '|' ||
        coalesce(birth_date::text, '') || '|' || lower(unaccent(coalesce(birth_locality, '')))
      WHERE person_key IS DISTINCT FROM btrim(regexp_replace(lower(unaccent(person_name)), '[^a-z]+', ' ', 'g')) || '|' ||
        coalesce(birth_date::text, '') || '|' || lower(unaccent(coalesce(birth_locality, '')));
    CREATE INDEX IF NOT EXISTS company_reps_person_name_key_idx ON reference.company_reps (split_part(person_key, '|', 1));
  END IF;
END $$;
