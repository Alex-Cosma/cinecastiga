ALTER TABLE "app"."procurement_documents" ADD COLUMN "classification" jsonb;--> statement-breakpoint
ALTER TABLE "app"."procurement_documents" ADD COLUMN "classification_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."procurement_documents" ADD COLUMN "classification_pdf_hash" text;--> statement-breakpoint
ALTER TABLE "app"."procurement_documents" ADD COLUMN "priority" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
CREATE INDEX "procurement_document_priority" ON "app"."procurement_documents" USING btree ("priority","notice_key") WHERE "app"."procurement_documents"."processed_at" is null;