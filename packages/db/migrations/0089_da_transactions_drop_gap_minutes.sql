-- "Finalizare rapidă" is retired (rf-2026.18, owner decision of 1 November 2026), and with
-- it the entity table's "Interval" column: the minutes between publication and
-- finalization. Dropping a column only changes the catalog (no rewrite of the ~20M
-- rows); it takes a brief ACCESS EXCLUSIVE lock inside the deploy transaction.
ALTER TABLE "marts"."da_transactions" DROP COLUMN "gap_minutes";
