CREATE TABLE "marts"."da_transactions" (
	"sicap_da_id" bigint PRIMARY KEY NOT NULL,
	"da_code" text,
	"authority_id" bigint,
	"authority_name" text,
	"supplier_id" bigint,
	"supplier_name" text,
	"county" text,
	"cpv_code" text,
	"cpv_name" text,
	"acquisition_type" text,
	"estimated_value_ron" numeric,
	"closing_value" numeric,
	"publication_date" text,
	"finalization_date" text,
	"gap_minutes" integer,
	"da_flags" text[]
);
--> statement-breakpoint
CREATE INDEX "da_tx_authority_idx" ON "marts"."da_transactions" USING btree ("authority_id","finalization_date");--> statement-breakpoint
CREATE INDEX "da_tx_supplier_idx" ON "marts"."da_transactions" USING btree ("supplier_id","finalization_date");--> statement-breakpoint
CREATE INDEX "da_tx_authority_value_idx" ON "marts"."da_transactions" USING btree ("authority_id","closing_value");