-- Additive TED provenance only. Existing auth/app tables and manual indexes are intentionally excluded.
ALTER TABLE "core"."ted_lot_results" ADD COLUMN "amount_kind" text;
--> statement-breakpoint
ALTER TABLE "core"."ted_lot_results" ADD COLUMN "amount_details" jsonb;
--> statement-breakpoint
ALTER TABLE "core"."ted_notices" ADD COLUMN "normalization_version" integer;
--> statement-breakpoint
ALTER TABLE "marts"."ted_awards" ADD COLUMN "lot_id" text;
--> statement-breakpoint
ALTER TABLE "marts"."ted_awards" ADD COLUMN "winner_selection_status" text;
--> statement-breakpoint
ALTER TABLE "marts"."ted_awards" ADD COLUMN "amount_kind" text;
--> statement-breakpoint
ALTER TABLE "marts"."ted_awards" ADD COLUMN "amount_details" jsonb;
