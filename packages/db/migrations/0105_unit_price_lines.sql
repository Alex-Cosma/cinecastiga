-- Unit prices (owner, 10 and 11 November 2026): direct-award item lines placed in a product family and pack, with the
-- price per kilogram, litre, piece… (packages/db/src/unit-prices.ts), each buyer's price per year and each product's
-- spread across buyers. Rebuilt (TRUNCATE + insert) by every processing run after the title search; listed in
-- infra/prod/shadow-derived.txt so the shadow build creates them empty. seap_web reads them through the marts default
-- privileges (infra/prod/app-grants.sql). Idempotent.
-- A lead (owner, 11 November 2026): unit_price_buyers.lead = at least twice the median, in at least two awards, at least
-- 500 lei above the median, in a group of at least twenty buyers; unit_price_groups.leads, excess and max_ratio count
-- the lead rows only (excess_all: every buyer at twice the median or more).
CREATE TABLE IF NOT EXISTS "marts"."unit_price_lines" (
	"item_id" bigint PRIMARY KEY NOT NULL,
	"family" text NOT NULL,
	"pack" text DEFAULT '' NOT NULL,
	"status" text NOT NULL,
	"year" smallint NOT NULL,
	"finalization_date" date,
	"sicap_da_id" bigint NOT NULL,
	"authority_id" bigint NOT NULL,
	"supplier_id" bigint,
	"item_name" text,
	"unit_raw" text,
	"quantity" numeric,
	"unit_price" numeric,
	"measure" numeric,
	"measure_source" text,
	"price_per_unit" numeric
);--> statement-breakpoint
ALTER TABLE "marts"."unit_price_lines" ADD COLUMN IF NOT EXISTS "pack" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unit_price_lines_family_idx" ON "marts"."unit_price_lines" USING btree ("family","year","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unit_price_lines_da_idx" ON "marts"."unit_price_lines" USING btree ("sicap_da_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unit_price_lines_authority_idx" ON "marts"."unit_price_lines" USING btree ("authority_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marts"."unit_price_buyers" (
	"family" text NOT NULL,
	"pack" text NOT NULL,
	"year" smallint NOT NULL,
	"authority_id" bigint NOT NULL,
	"county" text,
	"lines" integer NOT NULL,
	"awards" integer NOT NULL,
	"quantity" numeric NOT NULL,
	"paid" numeric NOT NULL,
	"price" numeric NOT NULL,
	"median" numeric,
	"ratio" numeric,
	"excess" numeric,
	"lead" boolean DEFAULT false NOT NULL,
	"supplier_ids" bigint[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "unit_price_buyers_pkey" PRIMARY KEY("family","pack","year","authority_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unit_price_buyers_ratio_idx" ON "marts"."unit_price_buyers" USING btree ("year","family","pack","ratio");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unit_price_buyers_authority_idx" ON "marts"."unit_price_buyers" USING btree ("authority_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marts"."unit_price_groups" (
	"family" text NOT NULL,
	"pack" text NOT NULL,
	"year" smallint NOT NULL,
	"buyers" integer NOT NULL,
	"median" numeric NOT NULL,
	"p10" numeric NOT NULL,
	"p25" numeric NOT NULL,
	"p75" numeric NOT NULL,
	"p90" numeric NOT NULL,
	"leads" integer NOT NULL,
	"excess" numeric NOT NULL,
	"excess_all" numeric DEFAULT 0 NOT NULL,
	"max_ratio" numeric,
	CONSTRAINT "unit_price_groups_pkey" PRIMARY KEY("family","pack","year")
);
