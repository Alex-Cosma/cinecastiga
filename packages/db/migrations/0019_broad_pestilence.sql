CREATE TABLE "marts"."ted_awards" (
	"ted_lot_result_id" bigint PRIMARY KEY NOT NULL,
	"ted_notice_id" bigint,
	"publication_number" text,
	"buyer_entity_id" bigint,
	"buyer_name" text,
	"buyer_county" text,
	"winner_names" text[],
	"winner_entity_ids" bigint[],
	"winner_countries" text[],
	"is_foreign" boolean DEFAULT false NOT NULL,
	"cpv_code" text,
	"cpv_name" text,
	"contract_nature" text,
	"title" text,
	"awarded_value" numeric,
	"currency" text,
	"award_date" text,
	"publication_date" text,
	"procedure_type" text,
	"tenders_received" integer,
	"is_single_bidder" boolean,
	"eu_funded" boolean,
	"label" text NOT NULL,
	"matched_contract_id" bigint,
	"match_score" numeric
);
--> statement-breakpoint
CREATE TABLE "marts"."ted_stats" (
	"metric" text NOT NULL,
	"dimension" text NOT NULL,
	"n" integer NOT NULL,
	"total_ron" numeric,
	CONSTRAINT "ted_stats_metric_dimension_pk" PRIMARY KEY("metric","dimension")
);
--> statement-breakpoint
CREATE INDEX "ted_awards_label_idx" ON "marts"."ted_awards" USING btree ("label");--> statement-breakpoint
CREATE INDEX "ted_awards_foreign_idx" ON "marts"."ted_awards" USING btree ("is_foreign");--> statement-breakpoint
CREATE INDEX "ted_awards_buyer_idx" ON "marts"."ted_awards" USING btree ("buyer_entity_id");--> statement-breakpoint
CREATE INDEX "ted_awards_cpv_idx" ON "marts"."ted_awards" USING btree ("cpv_code");--> statement-breakpoint
CREATE INDEX "ted_awards_value_idx" ON "marts"."ted_awards" USING btree ("awarded_value");--> statement-breakpoint
CREATE INDEX "ted_awards_single_bidder_idx" ON "marts"."ted_awards" USING btree ("is_single_bidder");