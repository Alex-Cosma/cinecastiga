ALTER TABLE "core"."contracts" ADD COLUMN "original_value" numeric;--> statement-breakpoint
ALTER TABLE "core"."contracts" ADD COLUMN "original_currency" text;--> statement-breakpoint
ALTER TABLE "core"."contracts" ADD COLUMN "value_ron" numeric;--> statement-breakpoint
ALTER TABLE "core"."contracts" ADD COLUMN "currency_rate" numeric;--> statement-breakpoint
ALTER TABLE "core"."contracts" ADD COLUMN "amount_status" text;--> statement-breakpoint
ALTER TABLE "core"."contracts" ADD COLUMN "amount_raw_id" bigint;--> statement-breakpoint
ALTER TABLE "core"."contracts" ADD COLUMN "amount_evidence" jsonb;