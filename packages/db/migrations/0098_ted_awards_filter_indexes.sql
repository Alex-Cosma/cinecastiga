-- /supra-prag's column funnels (owner decision of 4 November 2026): every filter of the award table has an index.
-- The procedure is counted (index-only, 4.5 s -> 0.12 s on the local copy's 4.0M rows) and filtered on its btree; a
-- winner's awards are found through the GIN on the id array (`winner_entity_ids && …`). Local copy: 27 MB and 14 MB,
-- built in about 2 s each. A plain CREATE INDEX holds off writes to marts.ted_awards meanwhile; only the nightly
-- ted-mart stage writes it, and the deploy lock keeps deploys and processing apart.
CREATE INDEX IF NOT EXISTS "ted_awards_procedure_idx" ON "marts"."ted_awards" USING btree ("procedure_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ted_awards_winner_ids_gin" ON "marts"."ted_awards" USING gin ("winner_entity_ids");
