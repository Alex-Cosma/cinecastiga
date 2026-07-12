CREATE TABLE "marts"."authority_concentration" (
	"authority_entity_id" bigint PRIMARY KEY NOT NULL,
	"distinct_suppliers" integer NOT NULL,
	"top_supplier_pct" numeric,
	"hhi" numeric,
	"total_ron" numeric
);
--> statement-breakpoint
CREATE TABLE "marts"."entity_profile" (
	"entity_id" bigint NOT NULL,
	"role" text NOT NULL,
	"n_contracts" integer DEFAULT 0 NOT NULL,
	"n_das" integer DEFAULT 0 NOT NULL,
	"total_ron_full" numeric,
	"total_ron_split" numeric,
	"first_activity" text,
	"last_activity" text,
	CONSTRAINT "entity_profile_entity_id_role_pk" PRIMARY KEY("entity_id","role")
);
--> statement-breakpoint
CREATE TABLE "marts"."entity_top_partners" (
	"entity_id" bigint NOT NULL,
	"role" text NOT NULL,
	"partner_entity_id" bigint NOT NULL,
	"rank" integer NOT NULL,
	"n" integer NOT NULL,
	"total_ron" numeric,
	CONSTRAINT "entity_top_partners_entity_id_role_partner_entity_id_pk" PRIMARY KEY("entity_id","role","partner_entity_id")
);
--> statement-breakpoint
CREATE TABLE "marts"."national_stats" (
	"kind" text NOT NULL,
	"year" integer,
	"n" integer NOT NULL,
	"total_ron" numeric,
	CONSTRAINT "national_stats_kind_year_pk" PRIMARY KEY("kind","year")
);
--> statement-breakpoint
CREATE TABLE "marts"."spend_by_cpv" (
	"division" text NOT NULL,
	"name_ro" text,
	"kind" text NOT NULL,
	"n" integer NOT NULL,
	"total_ron" numeric,
	CONSTRAINT "spend_by_cpv_division_kind_pk" PRIMARY KEY("division","kind")
);
--> statement-breakpoint
CREATE TABLE "marts"."top_entities" (
	"role" text NOT NULL,
	"rank" integer NOT NULL,
	"entity_id" bigint NOT NULL,
	"total_ron_full" numeric,
	"n_contracts" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "top_entities_role_rank_pk" PRIMARY KEY("role","rank")
);
--> statement-breakpoint
CREATE INDEX "authority_concentration_hhi_idx" ON "marts"."authority_concentration" USING btree ("hhi");--> statement-breakpoint
CREATE INDEX "entity_profile_role_full_idx" ON "marts"."entity_profile" USING btree ("role","total_ron_full");--> statement-breakpoint
CREATE INDEX "entity_top_partners_lookup_idx" ON "marts"."entity_top_partners" USING btree ("entity_id","role","rank");--> statement-breakpoint
CREATE INDEX "spend_by_cpv_total_idx" ON "marts"."spend_by_cpv" USING btree ("total_ron");