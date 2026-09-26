import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, jsonb, numeric, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { appSchema, clips, investigations } from "./app.js";
import { authUsers } from "./auth.js";
import { monitoringRefreshes } from "./monitoring-refresh.js";

/** A watch pins the executed identities and grounding; editing a recipe cannot broaden it. */
export const monitoringWatches = appSchema.table("monitoring_watches", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: text("owner_user_id").notNull().references(() => authUsers.id, { onDelete:"cascade" }),
  title: text("title").notNull(), spec: jsonb("spec").notNull(), options: jsonb("options").notNull(), grounding: jsonb("grounding").notNull(),
  scopeNotes: jsonb("scope_notes").notNull().default([]),
  preferences: jsonb("preferences").notNull(), paused: boolean("paused").notNull().default(false),
  recipeId: uuid("recipe_id"), recipeVersion: bigint("recipe_version", { mode:"number" }),
  pinnedAt: timestamp("pinned_at", { withTimezone:true }).notNull().defaultNow(),
  lastSuccessRunId: uuid("last_success_run_id"), lastSuccessAt: timestamp("last_success_at", { withTimezone:true }),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone:true }), lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone:true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone:true }).notNull().defaultNow(),
}, t => [index("monitoring_watches_owner_created_idx").on(t.ownerUserId,t.createdAt,t.id),
  check("monitoring_watches_title_check",sql`length(${t.title}) between 1 and 200`),
  check("monitoring_watches_recipe_check",sql`(${t.recipeId} is null and ${t.recipeVersion} is null) or (${t.recipeId} is not null and ${t.recipeVersion}>0)`)]);

/** Only completed runs are inserted; a failed attempt leaves the last good run intact. */
export const monitoringRuns = appSchema.table("monitoring_runs", {
  id: uuid("id").primaryKey().defaultRandom(), watchId: uuid("watch_id").notNull().references(() => monitoringWatches.id, { onDelete:"cascade" }),
  checkpointId: uuid("checkpoint_id").notNull().references(() => monitoringRefreshes.id), previousRunId: uuid("previous_run_id"),
  kind: text("kind").notNull(), checkedAt: timestamp("checked_at", { withTimezone:true }).notNull().defaultNow(),
  rowCount: bigint("row_count", { mode:"number" }).notNull(), totalExact: numeric("total_exact"), knownValueExact: numeric("known_value_exact").notNull(), unknownValues: bigint("unknown_values", { mode:"number" }).notNull().default(0),
  previousTotalExact: numeric("previous_total_exact"), totalDifferenceExact: numeric("total_difference_exact"),
  counts: jsonb("counts").notNull(), relevantCounts: jsonb("relevant_counts").notNull(), preferences: jsonb("preferences").notNull(),
  hasAlert: boolean("has_alert").notNull().default(false), resultChanged: boolean("result_changed").notNull().default(false), methodologyChanged: boolean("methodology_changed").notNull().default(false),
  result: jsonb("result").notNull(), methodology: jsonb("methodology").notNull(), checkpoint: jsonb("checkpoint").notNull(), notes: jsonb("notes").notNull(),
}, t => [uniqueIndex("monitoring_runs_watch_checkpoint_uq").on(t.watchId,t.checkpointId), index("monitoring_runs_watch_checked_idx").on(t.watchId,t.checkedAt,t.id),
  check("monitoring_runs_kind_check",sql`${t.kind} in ('baseline','update','unchanged')`),
  check("monitoring_runs_count_check",sql`${t.rowCount} between 0 and 200000 and ${t.unknownValues} between 0 and ${t.rowCount}`)]);

export const monitoringRunRows = appSchema.table("monitoring_run_rows", {
  runId: uuid("run_id").notNull().references(() => monitoringRuns.id, { onDelete:"cascade" }),
  sourceKey: text("source_key").notNull(), rowNo: bigint("row_no", { mode:"number" }).notNull(), record: jsonb("record").notNull(), valueExact: numeric("value_exact"),
}, t => [primaryKey({ columns:[t.runId,t.sourceKey] }), uniqueIndex("monitoring_run_rows_cursor_uq").on(t.runId,t.rowNo)]);

export const monitoringDeltas = appSchema.table("monitoring_deltas", {
  runId: uuid("run_id").notNull().references(() => monitoringRuns.id, { onDelete:"cascade" }), rowNo: bigint("row_no", { mode:"number" }).notNull(), sourceKey: text("source_key").notNull(),
  type: text("type").notNull(), classification: text("classification").notNull(), beforeRecord: jsonb("before_record"), afterRecord: jsonb("after_record"),
  changedFields: jsonb("changed_fields").notNull(), amountDifferenceExact: numeric("amount_difference_exact"), relevant: boolean("relevant").notNull(),
}, t => [primaryKey({ columns:[t.runId,t.rowNo] }),uniqueIndex("monitoring_deltas_source_uq").on(t.runId,t.sourceKey),
  check("monitoring_deltas_type_check",sql`${t.type} in ('added','removed','changed')`),
  check("monitoring_deltas_classification_check",sql`${t.classification} in ('new_dated_record','historical_first_observed','date_unknown','left_selection','source_changed')`)]);

/** Editorial state is separate from the immutable calculation. */
export const monitoringReviews = appSchema.table("monitoring_reviews", {
  runId: uuid("run_id").primaryKey().references(() => monitoringRuns.id, { onDelete:"cascade" }), reviewedAt: timestamp("reviewed_at", { withTimezone:true }).notNull().defaultNow(),
});
/** Saving an update twice cannot duplicate its case evidence or task. */
export const monitoringCaseLinks = appSchema.table("monitoring_case_links", {
  runId: uuid("run_id").notNull().references(() => monitoringRuns.id, { onDelete:"cascade" }),
  investigationId: uuid("investigation_id").notNull().references(() => investigations.id, { onDelete:"cascade" }),
  clipId: uuid("clip_id").notNull().references(() => clips.id, { onDelete:"cascade" }), beforeCaptureId: uuid("before_capture_id").notNull(), afterCaptureId: uuid("after_capture_id").notNull(), taskId: uuid("task_id"),
}, t => [primaryKey({ columns:[t.runId,t.investigationId] })]);
