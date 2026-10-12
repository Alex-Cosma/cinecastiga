CREATE TABLE "marts"."contract_identity_archives" (
	"archive_key" text PRIMARY KEY NOT NULL,
	"bundle_sha256" text NOT NULL,
	"external_id" text NOT NULL,
	"source" text NOT NULL,
	"original_raw_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"content_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marts"."contract_identity_exclusions" (
	"contract_id" bigint PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"snapshot_hash" text NOT NULL,
	"processing_run_id" uuid NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marts"."contract_identity_exclusions" ADD CONSTRAINT "contract_identity_exclusions_candidate_id_contract_identity_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "marts"."contract_identity_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marts"."contract_identity_exclusions" ADD CONSTRAINT "contract_identity_exclusions_fingerprint_contract_identity_observations_fingerprint_fk" FOREIGN KEY ("fingerprint") REFERENCES "marts"."contract_identity_observations"("fingerprint") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contract_identity_archives_external_idx" ON "marts"."contract_identity_archives" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "contract_identity_exclusions_candidate_idx" ON "marts"."contract_identity_exclusions" USING btree ("candidate_id");