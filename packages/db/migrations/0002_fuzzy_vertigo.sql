-- Extensions required by core-layer entity resolution (fuzzy name matching).
-- Must precede the gin_trgm_ops index on core.entities.name_normalized.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE TABLE "core"."awards" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"raw_id" bigint NOT NULL,
	"ca_notice_id" bigint,
	"notice_no" text,
	"sys_notice_type_id" integer,
	"sys_notice_version_id" integer,
	"authority_entity_id" bigint,
	"cpv_code" text,
	"cpv_valid" boolean,
	"cpv_raw" text,
	"estimated_value_ron" numeric,
	"ron_contract_value" numeric,
	"lowest_offer_value" numeric,
	"highest_offer_value" numeric,
	"state" text,
	"state_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "core"."contract_winners" (
	"contract_id" bigint NOT NULL,
	"entity_id" bigint NOT NULL,
	CONSTRAINT "contract_winners_contract_id_entity_id_pk" PRIMARY KEY("contract_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "core"."contracts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"raw_id" bigint NOT NULL,
	"ca_notice_contract_id" bigint,
	"ca_notice_id" bigint,
	"contract_no" text,
	"contract_date" timestamp with time zone,
	"contract_value" numeric,
	"currency" text,
	"cpv_code" text,
	"title" text,
	"lots_caption" text
);
--> statement-breakpoint
CREATE TABLE "core"."cpv_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"name_ro" text NOT NULL,
	"name_en" text,
	"revision" text NOT NULL,
	"division" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."da_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"da_id" bigint NOT NULL,
	"cpv_code" text,
	"catalog_item_name" text,
	"quantity" numeric,
	"unit_raw" text,
	"unit_canonical" text,
	"unit_factor" numeric,
	"unit_price" numeric,
	"closing_price" numeric
);
--> statement-breakpoint
CREATE TABLE "core"."direct_acquisitions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"raw_id" bigint NOT NULL,
	"da_code" text,
	"sicap_da_id" bigint,
	"authority_entity_id" bigint,
	"supplier_entity_id" bigint,
	"cpv_code" text,
	"cpv_valid" boolean,
	"cpv_raw" text,
	"estimated_value_ron" numeric,
	"closing_value" numeric,
	"publication_date" timestamp with time zone,
	"finalization_date" timestamp with time zone,
	"state" text
);
--> statement-breakpoint
CREATE TABLE "core"."entities" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"cui_canonical" text,
	"cui_valid" boolean DEFAULT false NOT NULL,
	"name_display" text NOT NULL,
	"name_normalized" text NOT NULL,
	"legal_form" text,
	"county" text,
	"nuts_code" text,
	"cui_raw_variants" text[],
	"first_seen" timestamp with time zone,
	"last_seen" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "core"."entity_name_suggestions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity_a" bigint NOT NULL,
	"entity_b" bigint NOT NULL,
	"score" real NOT NULL,
	"evidence" jsonb,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."entity_sicap_ids" (
	"entity_id" bigint NOT NULL,
	"namespace" text NOT NULL,
	"sicap_id" integer NOT NULL,
	CONSTRAINT "entity_sicap_ids_namespace_sicap_id_pk" PRIMARY KEY("namespace","sicap_id")
);
--> statement-breakpoint
CREATE TABLE "core"."normalize_watermarks" (
	"transform" text PRIMARY KEY NOT NULL,
	"last_raw_id" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."notices" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"raw_id" bigint NOT NULL,
	"notice_no" text,
	"sys_notice_type_id" integer,
	"sys_notice_version_id" integer,
	"authority_entity_id" bigint,
	"cpv_code" text,
	"cpv_valid" boolean,
	"cpv_raw" text,
	"estimated_value_ron" numeric,
	"state" text,
	"state_date" timestamp with time zone,
	"is_online" boolean,
	"procedure_type" text,
	"has_lots" boolean
);
--> statement-breakpoint
CREATE TABLE "core"."quarantine" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"raw_id" bigint NOT NULL,
	"endpoint_version" text NOT NULL,
	"zod_error" text NOT NULL,
	"payload_excerpt" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."sicap_cpv_ids" (
	"sicap_id" integer PRIMARY KEY NOT NULL,
	"code" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."unit_map" (
	"raw_pattern" text PRIMARY KEY NOT NULL,
	"canonical_unit" text NOT NULL,
	"factor" numeric NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."awards" ADD CONSTRAINT "awards_authority_entity_id_entities_id_fk" FOREIGN KEY ("authority_entity_id") REFERENCES "core"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."awards" ADD CONSTRAINT "awards_cpv_code_cpv_codes_code_fk" FOREIGN KEY ("cpv_code") REFERENCES "core"."cpv_codes"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."contract_winners" ADD CONSTRAINT "contract_winners_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "core"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."contract_winners" ADD CONSTRAINT "contract_winners_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "core"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."contracts" ADD CONSTRAINT "contracts_cpv_code_cpv_codes_code_fk" FOREIGN KEY ("cpv_code") REFERENCES "core"."cpv_codes"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."da_items" ADD CONSTRAINT "da_items_da_id_direct_acquisitions_id_fk" FOREIGN KEY ("da_id") REFERENCES "core"."direct_acquisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."da_items" ADD CONSTRAINT "da_items_cpv_code_cpv_codes_code_fk" FOREIGN KEY ("cpv_code") REFERENCES "core"."cpv_codes"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."direct_acquisitions" ADD CONSTRAINT "direct_acquisitions_authority_entity_id_entities_id_fk" FOREIGN KEY ("authority_entity_id") REFERENCES "core"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."direct_acquisitions" ADD CONSTRAINT "direct_acquisitions_supplier_entity_id_entities_id_fk" FOREIGN KEY ("supplier_entity_id") REFERENCES "core"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."direct_acquisitions" ADD CONSTRAINT "direct_acquisitions_cpv_code_cpv_codes_code_fk" FOREIGN KEY ("cpv_code") REFERENCES "core"."cpv_codes"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."entity_name_suggestions" ADD CONSTRAINT "entity_name_suggestions_entity_a_entities_id_fk" FOREIGN KEY ("entity_a") REFERENCES "core"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."entity_name_suggestions" ADD CONSTRAINT "entity_name_suggestions_entity_b_entities_id_fk" FOREIGN KEY ("entity_b") REFERENCES "core"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."entity_sicap_ids" ADD CONSTRAINT "entity_sicap_ids_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "core"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."notices" ADD CONSTRAINT "notices_authority_entity_id_entities_id_fk" FOREIGN KEY ("authority_entity_id") REFERENCES "core"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."notices" ADD CONSTRAINT "notices_cpv_code_cpv_codes_code_fk" FOREIGN KEY ("cpv_code") REFERENCES "core"."cpv_codes"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."sicap_cpv_ids" ADD CONSTRAINT "sicap_cpv_ids_code_cpv_codes_code_fk" FOREIGN KEY ("code") REFERENCES "core"."cpv_codes"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "awards_raw_id_uq" ON "core"."awards" USING btree ("raw_id");--> statement-breakpoint
CREATE INDEX "awards_ca_notice_idx" ON "core"."awards" USING btree ("ca_notice_id");--> statement-breakpoint
CREATE INDEX "awards_authority_idx" ON "core"."awards" USING btree ("authority_entity_id");--> statement-breakpoint
CREATE INDEX "awards_cpv_idx" ON "core"."awards" USING btree ("cpv_code");--> statement-breakpoint
CREATE INDEX "contract_winners_entity_idx" ON "core"."contract_winners" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "contracts_ca_notice_idx" ON "core"."contracts" USING btree ("ca_notice_id");--> statement-breakpoint
CREATE INDEX "contracts_ca_notice_contract_idx" ON "core"."contracts" USING btree ("ca_notice_contract_id");--> statement-breakpoint
CREATE INDEX "cpv_codes_division_idx" ON "core"."cpv_codes" USING btree ("division");--> statement-breakpoint
CREATE INDEX "da_items_da_idx" ON "core"."da_items" USING btree ("da_id");--> statement-breakpoint
CREATE UNIQUE INDEX "direct_acquisitions_raw_id_uq" ON "core"."direct_acquisitions" USING btree ("raw_id");--> statement-breakpoint
CREATE INDEX "direct_acquisitions_authority_idx" ON "core"."direct_acquisitions" USING btree ("authority_entity_id");--> statement-breakpoint
CREATE INDEX "direct_acquisitions_supplier_idx" ON "core"."direct_acquisitions" USING btree ("supplier_entity_id");--> statement-breakpoint
CREATE INDEX "direct_acquisitions_cpv_idx" ON "core"."direct_acquisitions" USING btree ("cpv_code");--> statement-breakpoint
CREATE INDEX "direct_acquisitions_finalization_idx" ON "core"."direct_acquisitions" USING btree ("finalization_date");--> statement-breakpoint
CREATE UNIQUE INDEX "entities_cui_canonical_uq" ON "core"."entities" USING btree ("cui_canonical") WHERE "core"."entities"."cui_valid" = true;--> statement-breakpoint
CREATE INDEX "entities_name_norm_trgm_idx" ON "core"."entities" USING gin ("name_normalized" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "entity_name_suggestions_pair_uq" ON "core"."entity_name_suggestions" USING btree ("entity_a","entity_b");--> statement-breakpoint
CREATE INDEX "entity_name_suggestions_status_idx" ON "core"."entity_name_suggestions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "entity_sicap_ids_entity_idx" ON "core"."entity_sicap_ids" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notices_raw_id_uq" ON "core"."notices" USING btree ("raw_id");--> statement-breakpoint
CREATE INDEX "notices_authority_idx" ON "core"."notices" USING btree ("authority_entity_id");--> statement-breakpoint
CREATE INDEX "notices_cpv_idx" ON "core"."notices" USING btree ("cpv_code");--> statement-breakpoint
CREATE INDEX "notices_state_date_idx" ON "core"."notices" USING btree ("state_date");--> statement-breakpoint
CREATE INDEX "quarantine_endpoint_idx" ON "core"."quarantine" USING btree ("endpoint_version");