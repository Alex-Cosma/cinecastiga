import { jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { martsSchema } from "./marts.js";

/** Observations of the local dataset, never a claim of complete source coverage. */
export const dataCoverage = martsSchema.table("data_coverage", {
  dataset: text("dataset").primaryKey(),
  observation: jsonb("observation").notNull(),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
});
