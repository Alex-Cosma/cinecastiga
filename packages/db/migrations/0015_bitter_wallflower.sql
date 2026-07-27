CREATE TABLE "core"."ted_lot_results" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ted_notice_id" bigint NOT NULL,
	"lot_id" text NOT NULL,
	"result_id" text,
	"cpv_code" text,
	"cpv_valid" boolean,
	"cpv_raw" text,
	"contract_nature" text,
	"title" text,
	"estimated_value_ron" numeric,
	"awarded_value" numeric,
	"currency" text,
	"tenders_received" integer,
	"is_single_bidder" boolean,
	"winner_selection_status" text,
	"contract_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "core"."ted_lot_winners" (
	"lot_result_id" bigint NOT NULL,
	"entity_id" bigint NOT NULL,
	CONSTRAINT "ted_lot_winners_lot_result_id_entity_id_pk" PRIMARY KEY("lot_result_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "core"."ted_notices" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"raw_id" bigint NOT NULL,
	"publication_number" text NOT NULL,
	"ojs_notice_id" text,
	"notice_type" text,
	"regulatory_domain" text,
	"contract_folder_id" text,
	"notice_uuid" text,
	"procedure_type" text,
	"buyer_entity_id" bigint,
	"buyer_legal_type" text,
	"buyer_activity" text,
	"cpv_code" text,
	"cpv_valid" boolean,
	"cpv_raw" text,
	"contract_nature" text,
	"title" text,
	"estimated_value_ron" numeric,
	"currency" text,
	"awarded_value_total" numeric,
	"eu_funded" boolean,
	"lot_count" integer,
	"publication_date" timestamp with time zone,
	"issue_date" timestamp with time zone,
	"award_date" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "core"."ted_lot_results" ADD CONSTRAINT "ted_lot_results_ted_notice_id_ted_notices_id_fk" FOREIGN KEY ("ted_notice_id") REFERENCES "core"."ted_notices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."ted_lot_results" ADD CONSTRAINT "ted_lot_results_cpv_code_cpv_codes_code_fk" FOREIGN KEY ("cpv_code") REFERENCES "core"."cpv_codes"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."ted_lot_winners" ADD CONSTRAINT "ted_lot_winners_lot_result_id_ted_lot_results_id_fk" FOREIGN KEY ("lot_result_id") REFERENCES "core"."ted_lot_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."ted_lot_winners" ADD CONSTRAINT "ted_lot_winners_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "core"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."ted_notices" ADD CONSTRAINT "ted_notices_buyer_entity_id_entities_id_fk" FOREIGN KEY ("buyer_entity_id") REFERENCES "core"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."ted_notices" ADD CONSTRAINT "ted_notices_cpv_code_cpv_codes_code_fk" FOREIGN KEY ("cpv_code") REFERENCES "core"."cpv_codes"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ted_lot_results_notice_lot_uq" ON "core"."ted_lot_results" USING btree ("ted_notice_id","lot_id");--> statement-breakpoint
CREATE INDEX "ted_lot_results_notice_idx" ON "core"."ted_lot_results" USING btree ("ted_notice_id");--> statement-breakpoint
CREATE INDEX "ted_lot_results_cpv_idx" ON "core"."ted_lot_results" USING btree ("cpv_code");--> statement-breakpoint
CREATE INDEX "ted_lot_results_single_bidder_idx" ON "core"."ted_lot_results" USING btree ("is_single_bidder");--> statement-breakpoint
CREATE INDEX "ted_lot_winners_entity_idx" ON "core"."ted_lot_winners" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ted_notices_publication_number_uq" ON "core"."ted_notices" USING btree ("publication_number");--> statement-breakpoint
CREATE INDEX "ted_notices_buyer_idx" ON "core"."ted_notices" USING btree ("buyer_entity_id");--> statement-breakpoint
CREATE INDEX "ted_notices_cpv_idx" ON "core"."ted_notices" USING btree ("cpv_code");--> statement-breakpoint
CREATE INDEX "ted_notices_publication_date_idx" ON "core"."ted_notices" USING btree ("publication_date");--> statement-breakpoint
CREATE INDEX "ted_notices_contract_folder_idx" ON "core"."ted_notices" USING btree ("contract_folder_id");