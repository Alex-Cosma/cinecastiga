CREATE TABLE "marts"."contract_competition" (
	"contract_id" bigint PRIMARY KEY NOT NULL,
	"ca_notice_id" bigint,
	"ted_lot_result_id" bigint,
	"match_score" numeric,
	"tenders_received" integer,
	"is_single_bidder" boolean
);
--> statement-breakpoint
CREATE INDEX "contract_competition_single_idx" ON "marts"."contract_competition" USING btree ("is_single_bidder");