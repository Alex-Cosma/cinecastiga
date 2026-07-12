import { pgSchema } from "drizzle-orm/pg-core";

/**
 * Gold layer: precomputed aggregates (entity_stats, national_stats_*,
 * red_flags). Tables land here in project Phases 5 and 8 — written only
 * by ingestion batch jobs, read by the web app.
 */
export const martsSchema = pgSchema("marts");
