CREATE TABLE "marts"."data_coverage" (
	"dataset" text PRIMARY KEY NOT NULL,
	"observation" jsonb NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
