CREATE TABLE "marts"."contract_transactions" (
	"contract_id" bigint NOT NULL,
	"supplier_id" bigint NOT NULL,
	"contract_no" text,
	"ca_notice_id" bigint,
	"notice_no" text,
	"authority_id" bigint,
	"authority_name" text,
	"supplier_name" text,
	"county" text,
	"cpv_code" text,
	"cpv_name" text,
	"procedure_type" text,
	"acquisition_type" text,
	"closing_value" numeric,
	"contract_value_full" numeric,
	"n_winners" integer DEFAULT 1 NOT NULL,
	"finalization_date" text,
	"tenders_received" integer,
	"is_single_bidder" boolean,
	"also_in_ted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "contract_transactions_contract_id_supplier_id_pk" PRIMARY KEY("contract_id","supplier_id")
);
--> statement-breakpoint
CREATE INDEX "ctx_authority_idx" ON "marts"."contract_transactions" USING btree ("authority_id","finalization_date");--> statement-breakpoint
CREATE INDEX "ctx_supplier_idx" ON "marts"."contract_transactions" USING btree ("supplier_id","finalization_date");--> statement-breakpoint
CREATE INDEX "ctx_single_idx" ON "marts"."contract_transactions" USING btree ("is_single_bidder");