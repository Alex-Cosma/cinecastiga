CREATE TABLE "marts"."topic_acquisitions" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"ref_id" bigint NOT NULL,
	"title" text NOT NULL,
	"search" "tsvector" NOT NULL,
	"authority_id" bigint,
	"supplier_ids" bigint[] NOT NULL,
	"county" text,
	"uat_siruta" integer,
	"year" integer,
	"date" text,
	"value" numeric,
	"procedure_id" text
);
--> statement-breakpoint
CREATE TABLE "marts"."topic_search_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"built_at" timestamp with time zone DEFAULT now() NOT NULL,
	"records" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "topic_search_idx" ON "marts"."topic_acquisitions" USING gin ("search");--> statement-breakpoint
CREATE INDEX "topic_authority_idx" ON "marts"."topic_acquisitions" USING btree ("authority_id");--> statement-breakpoint
CREATE INDEX "topic_suppliers_idx" ON "marts"."topic_acquisitions" USING gin ("supplier_ids");--> statement-breakpoint
CREATE INDEX "topic_place_idx" ON "marts"."topic_acquisitions" USING btree ("uat_siruta");--> statement-breakpoint
CREATE INDEX "topic_county_year_idx" ON "marts"."topic_acquisitions" USING btree ("county","year");--> statement-breakpoint
CREATE INDEX "topic_procedure_idx" ON "marts"."topic_acquisitions" USING btree ("procedure_id","authority_id");