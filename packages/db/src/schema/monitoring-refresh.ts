import { sql } from "drizzle-orm";
import { bigserial, check, index, jsonb, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { appSchema } from "./app.js";

/** A ready row publishes a coherent analytic snapshot, never source completeness. */
export const monitoringRefreshes = appSchema.table("monitoring_refreshes", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: bigserial("version", { mode: "bigint" }).notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("running"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  sourceCoverage: jsonb("source_coverage").notNull().default({}),
  methodology: jsonb("methodology").notNull().default({}),
  validation: jsonb("validation").notNull().default({}),
  error: text("error"),
}, t => [
  uniqueIndex("monitoring_refreshes_version_idx").on(t.version),
  index("monitoring_refreshes_status_version_idx").on(t.status, t.version),
  check("monitoring_refreshes_kind_check", sql`${t.kind} in ('coordinated', 'baseline', 'manual')`),
  check("monitoring_refreshes_status_check", sql`${t.status} in ('running', 'ready', 'failed')`),
  check("monitoring_refreshes_completion_check", sql`(${t.status} = 'running' and ${t.completedAt} is null) or (${t.status} <> 'running' and ${t.completedAt} is not null)`),
  check("monitoring_refreshes_ready_check", sql`${t.status} <> 'ready' or (${t.kind} <> 'manual' and ${t.error} is null)`),
]);
