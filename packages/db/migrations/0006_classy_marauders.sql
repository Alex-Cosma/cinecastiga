CREATE TABLE "marts"."spend_by_type" (
	"kind" text NOT NULL,
	"acquisition_type" text,
	"n" integer NOT NULL,
	"total_ron" numeric
);
--> statement-breakpoint
ALTER TABLE "core"."awards" ADD COLUMN "acquisition_type" text;--> statement-breakpoint
ALTER TABLE "core"."direct_acquisitions" ADD COLUMN "acquisition_type" text;--> statement-breakpoint
ALTER TABLE "core"."notices" ADD COLUMN "acquisition_type" text;--> statement-breakpoint
CREATE INDEX "spend_by_type_idx" ON "marts"."spend_by_type" USING btree ("kind","acquisition_type");