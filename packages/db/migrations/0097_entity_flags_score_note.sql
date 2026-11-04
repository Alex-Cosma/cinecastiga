-- The buyer or supplier regime behind a profile's risk score (rf-2026.20, owner decisions of
-- 3 November 2026): 'association' (an association buying with public money, e.g. an OUAI, whose
-- procurement regime is not verified), 'private_buyer' (a company the DA ceilings do not bind: only
-- prices just under the ceiling and December count) or 'inhouse' (a firm owned by its institution:
-- no score). Null for everyone else. The page shows it only as a hover note. Nullable without a
-- default, so PostgreSQL adds the column without rewriting the ~172k rows.
ALTER TABLE "marts"."entity_flags" ADD COLUMN IF NOT EXISTS "score_note" text;
