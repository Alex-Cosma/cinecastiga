ALTER TABLE "marts"."national_stats" DROP CONSTRAINT "national_stats_kind_year_pk";--> statement-breakpoint
-- year is nullable (NULL = all-time overall row); dropping it from the PK must
-- also drop the NOT NULL the PK implied (drizzle-kit doesn't emit this).
ALTER TABLE "marts"."national_stats" ALTER COLUMN "year" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "national_stats_kind_year_idx" ON "marts"."national_stats" USING btree ("kind","year");