-- Covering county/CPV indexes of the transaction marts (perf work 1745f5a).
-- Ask by county or CPV answers from them index-only; without them the same
-- questions scan 20M rows (8–17 s). They were created by hand on production and
-- on the local copy and survived only because the builds TRUNCATE: no migration
-- created them, so a database built from migrations lacked them. Names,
-- columns, operator classes and INCLUDE lists are exactly those read with
-- pg_get_indexdef on production and locally on 24 October 2026; the same text
-- is TRANSACTION_MART_INDEXES (packages/db/src/transaction-mart-indexes.ts),
-- which the builds also use to recreate a missing one after loading.
--
-- The migrator applies all pending migrations in one transaction, so
-- CREATE INDEX CONCURRENTLY is not possible, and each statement holds a SHARE
-- lock on its table until that transaction commits: reads continue, writers
-- (the nightly marts and transactions stages, which TRUNCATE) wait.
--
-- Where they exist (production, restored copies): nothing is built. IF NOT
-- EXISTS compares only the name, so an index of the same name is kept as it is;
-- the integration test compares definitions. The lock is still requested: while
-- a nightly stage holds the table, the deploy migrator's lock_timeout (10 s)
-- fails the deployment without changes.
--
-- Where they are missing: a database built from migrations has empty tables
-- here, so this is instant. On loaded tables each statement sorts the whole
-- table. Measured on narrow copies of the local data (scratchpad
-- par-marts/A1-indexes.md), with production's maintenance_work_mem (2 GB):
-- 0.6–1.1 s per DA index on a 10% sample (2.0M rows), 0.3–0.5 s per contracts
-- index on all 1.1M rows. Extrapolated to 20M DA rows, plus one read of the full
-- 4.9 GB heap per index: roughly 10–30 s per DA index, up to ~2 min for all
-- eight, well under the migrator's 15 min statement_timeout; about 3.5 GB of
-- new indexes on da_transactions and 0.2 GB on contract_transactions.
CREATE INDEX IF NOT EXISTS da_tx_county_date_idx ON marts.da_transactions USING btree (county, finalization_date text_pattern_ops) INCLUDE (closing_value);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS da_tx_county_ent_idx ON marts.da_transactions USING btree (county) INCLUDE (authority_id, supplier_id, closing_value, finalization_date);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS da_tx_cpv_idx ON marts.da_transactions USING btree (cpv_code text_pattern_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS da_tx_cpv_val_idx ON marts.da_transactions USING btree (cpv_code text_pattern_ops) INCLUDE (closing_value, finalization_date);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ctx_county_idx ON marts.contract_transactions USING btree (county) INCLUDE (closing_value, finalization_date);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ctx_county_ent_idx ON marts.contract_transactions USING btree (county) INCLUDE (authority_id, supplier_id, closing_value, finalization_date);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ctx_cpv_idx ON marts.contract_transactions USING btree (cpv_code text_pattern_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ctx_cpv_val_idx ON marts.contract_transactions USING btree (cpv_code text_pattern_ops) INCLUDE (closing_value, finalization_date);
