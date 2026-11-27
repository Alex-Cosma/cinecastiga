-- Owner, 27 November 2026 (contract-reporting-8): frameworks recorded as contracts. A publication without a SEAP
-- contract type is a contract unless its title says „acord-cadru”, and many frameworks say nothing. SEAP tells them
-- apart itself: the total it writes on an award notice adds up the notice's call-offs and leaves the frameworks out.
--
-- marts.contract_notice_frameworks: the publications the last processing run reads as frameworks for that reason
-- ('notice_total'), or because their title begins „Acordul-cadru”, a spelling the title rule misses ('title').
-- Rewritten at the start of every run's marts stage (packages/db/src/contract-reporting.ts buildNoticeFrameworks);
-- the totals, their validation and the site read it through contractKind, so one run has one answer. Derived: the
-- source rows are never changed, and the publications stay listed, as frameworks. Empty until the first run after
-- this migration, which is a full one.
CREATE TABLE "marts"."contract_notice_frameworks" (
	"contract_id" bigint PRIMARY KEY NOT NULL,
	"rule" text NOT NULL,
	"value_ron" numeric,
	"calloff_sum" numeric,
	"notice_total" numeric,
	CONSTRAINT "contract_notice_frameworks_rule" CHECK ("marts"."contract_notice_frameworks"."rule" in ('notice_total','title'))
);
