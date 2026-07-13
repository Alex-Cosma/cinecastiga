CREATE TABLE "marts"."entity_flags" (
	"entity_id" bigint NOT NULL,
	"role" text NOT NULL,
	"name_display" text,
	"county" text,
	"n_das" integer DEFAULT 0 NOT NULL,
	"total_ron" numeric,
	"cri" numeric,
	"n_flags" integer DEFAULT 0 NOT NULL,
	"flags" jsonb,
	CONSTRAINT "entity_flags_entity_id_role_pk" PRIMARY KEY("entity_id","role")
);
--> statement-breakpoint
CREATE TABLE "marts"."flag_instances" (
	"id" bigint PRIMARY KEY NOT NULL,
	"flag_code" text NOT NULL,
	"subject_type" text NOT NULL,
	"entity_id" bigint,
	"entity_name" text,
	"entity_county" text,
	"partner_id" bigint,
	"partner_name" text,
	"severity" numeric,
	"total_ron" numeric,
	"period" text,
	"evidence" jsonb
);
--> statement-breakpoint
CREATE INDEX "entity_flags_role_cri_idx" ON "marts"."entity_flags" USING btree ("role","cri");--> statement-breakpoint
CREATE INDEX "flag_instances_code_sev_idx" ON "marts"."flag_instances" USING btree ("flag_code","severity");--> statement-breakpoint
CREATE INDEX "flag_instances_entity_idx" ON "marts"."flag_instances" USING btree ("entity_id");