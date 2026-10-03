CREATE TABLE "marts"."contract_identity_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"status" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"evidence" jsonb NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_identity_status" CHECK ("marts"."contract_identity_candidates"."status" in ('source_verified','needs_evidence','conflict'))
);
