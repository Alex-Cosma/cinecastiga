CREATE TABLE "core"."flags" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" bigint NOT NULL,
	"partner_id" bigint,
	"flag_code" text NOT NULL,
	"period" text,
	"triggered" boolean NOT NULL,
	"severity" real,
	"evidence" jsonb,
	"methodology_version" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."risk_thresholds" (
	"key" text NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone,
	"value_num" numeric NOT NULL,
	"note" text,
	CONSTRAINT "risk_thresholds_key_valid_from_pk" PRIMARY KEY("key","valid_from")
);
--> statement-breakpoint
CREATE INDEX "flags_subject_idx" ON "core"."flags" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "flags_code_idx" ON "core"."flags" USING btree ("flag_code","triggered");--> statement-breakpoint
CREATE INDEX "flags_severity_idx" ON "core"."flags" USING btree ("flag_code","severity");