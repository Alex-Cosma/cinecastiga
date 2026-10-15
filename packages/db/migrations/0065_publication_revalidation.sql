CREATE TABLE "marts"."contract_identity_revisions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"processing_run_id" uuid NOT NULL,
	"previous_snapshot" jsonb NOT NULL,
	"next_snapshot" jsonb NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marts"."contract_identity_revisions" ADD CONSTRAINT "contract_identity_revisions_candidate_id_contract_identity_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "marts"."contract_identity_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contract_identity_revisions_candidate_idx" ON "marts"."contract_identity_revisions" USING btree ("candidate_id");