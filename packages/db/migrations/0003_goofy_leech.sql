DROP INDEX "core"."awards_raw_id_uq";--> statement-breakpoint
DROP INDEX "core"."awards_ca_notice_idx";--> statement-breakpoint
DROP INDEX "core"."contracts_ca_notice_contract_idx";--> statement-breakpoint
DROP INDEX "core"."direct_acquisitions_raw_id_uq";--> statement-breakpoint
DROP INDEX "core"."notices_raw_id_uq";--> statement-breakpoint
ALTER TABLE "core"."awards" ALTER COLUMN "ca_notice_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."contracts" ALTER COLUMN "ca_notice_contract_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."direct_acquisitions" ALTER COLUMN "sicap_da_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."da_items" ADD COLUMN "sicap_item_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."notices" ADD COLUMN "c_notice_id" bigint NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "awards_ca_notice_id_uq" ON "core"."awards" USING btree ("ca_notice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_ca_notice_contract_id_uq" ON "core"."contracts" USING btree ("ca_notice_contract_id");--> statement-breakpoint
CREATE UNIQUE INDEX "da_items_sicap_item_id_uq" ON "core"."da_items" USING btree ("sicap_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "direct_acquisitions_sicap_da_id_uq" ON "core"."direct_acquisitions" USING btree ("sicap_da_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notices_c_notice_id_uq" ON "core"."notices" USING btree ("c_notice_id");