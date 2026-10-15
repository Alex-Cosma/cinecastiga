CREATE TABLE "marts"."contract_identity_decisions" (
	"candidate_id" text PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"canonical_contract_id" bigint NOT NULL,
	"reason" text NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marts"."contract_identity_members" (
	"contract_id" bigint PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"snapshot_hash" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marts"."contract_identity_decisions" ADD CONSTRAINT "contract_identity_decisions_candidate_id_contract_identity_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "marts"."contract_identity_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marts"."contract_identity_decisions" ADD CONSTRAINT "contract_identity_decisions_fingerprint_contract_identity_observations_fingerprint_fk" FOREIGN KEY ("fingerprint") REFERENCES "marts"."contract_identity_observations"("fingerprint") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marts"."contract_identity_members" ADD CONSTRAINT "contract_identity_members_candidate_id_contract_identity_decisions_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "marts"."contract_identity_decisions"("candidate_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contract_identity_members_candidate_idx" ON "marts"."contract_identity_members" USING btree ("candidate_id");