-- Ask's risk scatter (apps/web/lib/ask/compile.ts, case "scatter") bins every
-- profile by log(greatest(coalesce(total_ron, 0), 1)). On numeric that costs
-- ~0.8 s per pass over 72k supplier profiles, two passes per answer (1.6 s of
-- 1.7 s, local copy, 24 October 2026); the stored column reads in ~12 ms.
-- PostgreSQL computes it on every insert of the weekly flag-marts build
-- (explicit column list, unaffected), with the expression the engine used, so
-- the bins cannot change. Adding it rewrites the table (~172k rows, ~21 MB;
-- 2.7 s on a copy of the local table, machine under load) under ACCESS
-- EXCLUSIVE inside the deploy transaction; the risk pages wait that long.
ALTER TABLE "marts"."entity_flags" ADD COLUMN "log_total_ron" numeric GENERATED ALWAYS AS (log(greatest(coalesce(total_ron, 0), 1))) STORED;
