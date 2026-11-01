-- The risk score (rf-2026.18, owner decision of 1 November 2026): marts.entity_flags
-- gets the score over 100, its unrounded value and the strengths behind it. The
-- flag marts build fills them; until the first build after this migration every
-- profile reads score 0 beside its previous cri. ~172k rows; the defaults are
-- constants, so PostgreSQL adds the columns without rewriting the table.
ALTER TABLE "marts"."entity_flags" ADD COLUMN "score" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "marts"."entity_flags" ADD COLUMN "score_raw" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "marts"."entity_flags" ADD COLUMN "score_parts" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "entity_flags_role_score_idx" ON "marts"."entity_flags" USING btree ("role","score");
