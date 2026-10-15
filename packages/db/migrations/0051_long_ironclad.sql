CREATE TABLE "marts"."contract_identity_observations" (
	"fingerprint" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marts"."contract_identity_observations" ADD CONSTRAINT "contract_identity_observations_candidate_id_contract_identity_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "marts"."contract_identity_candidates"("id") ON DELETE no action ON UPDATE no action;