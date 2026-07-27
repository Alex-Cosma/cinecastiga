ALTER TABLE "core"."entities" ADD COLUMN "country_code" text;--> statement-breakpoint
ALTER TABLE "core"."entities" ADD COLUMN "is_foreign" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."entities" ADD COLUMN "foreign_id_raw" text;--> statement-breakpoint
ALTER TABLE "core"."entities" ADD COLUMN "foreign_id_norm" text;--> statement-breakpoint
CREATE UNIQUE INDEX "entities_foreign_id_uq" ON "core"."entities" USING btree ("country_code","foreign_id_norm") WHERE "core"."entities"."cui_valid" = false and "core"."entities"."foreign_id_norm" is not null and "core"."entities"."country_code" is not null;--> statement-breakpoint
CREATE INDEX "entities_is_foreign_idx" ON "core"."entities" USING btree ("is_foreign");