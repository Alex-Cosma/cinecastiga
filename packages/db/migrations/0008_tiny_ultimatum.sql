CREATE TABLE "marts"."cpv_tree" (
	"code" text PRIMARY KEY NOT NULL,
	"parent_code" text,
	"level" integer NOT NULL,
	"name_ro" text,
	"total_ron" numeric,
	"n_children" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marts"."spend_by_county" (
	"county" text NOT NULL,
	"role" text NOT NULL,
	"n" integer NOT NULL,
	"total_ron" numeric,
	CONSTRAINT "spend_by_county_county_role_pk" PRIMARY KEY("county","role")
);
--> statement-breakpoint
CREATE INDEX "cpv_tree_parent_idx" ON "marts"."cpv_tree" USING btree ("parent_code");--> statement-breakpoint
CREATE INDEX "cpv_tree_level_total_idx" ON "marts"."cpv_tree" USING btree ("level","total_ron");