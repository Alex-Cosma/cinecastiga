CREATE TABLE "core"."award_links" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ted_lot_result_id" bigint NOT NULL,
	"contract_id" bigint NOT NULL,
	"ted_notice_id" bigint,
	"ca_notice_id" bigint,
	"match_score" real NOT NULL,
	"match_method" text NOT NULL,
	"value_diff_pct" numeric,
	"date_diff_days" integer,
	"evidence" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."award_links" ADD CONSTRAINT "award_links_ted_lot_result_id_ted_lot_results_id_fk" FOREIGN KEY ("ted_lot_result_id") REFERENCES "core"."ted_lot_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."award_links" ADD CONSTRAINT "award_links_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "core"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "award_links_pair_uq" ON "core"."award_links" USING btree ("ted_lot_result_id","contract_id");--> statement-breakpoint
CREATE INDEX "award_links_ted_lot_idx" ON "core"."award_links" USING btree ("ted_lot_result_id");--> statement-breakpoint
CREATE INDEX "award_links_contract_idx" ON "core"."award_links" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "award_links_score_idx" ON "core"."award_links" USING btree ("match_score");