import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, numeric, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { appSchema, clips, investigations } from "./app.js";

/** Append-only capture versions. Source rebuilds never touch these app tables. */
export const evidenceCaptures = appSchema.table("evidence_captures", {
  id: uuid("id").primaryKey().defaultRandom(),
  investigationId: uuid("investigation_id").notNull().references(() => investigations.id, { onDelete: "cascade" }),
  clipId: uuid("clip_id").notNull().references(() => clips.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  createdBy: text("created_by").notNull(),
  status: text("status").notNull().default("queued"),
  request: jsonb("request").notNull(),
  summary: jsonb("summary"),
  result: jsonb("result"),
  coverage: jsonb("coverage"),
  methodology: jsonb("methodology"),
  rowCount: bigint("row_count", { mode: "number" }),
  totalExact: numeric("total_exact"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, t => [uniqueIndex("evidence_captures_clip_version_uq").on(t.clipId, t.version), index("evidence_captures_status_idx").on(t.status), check("evidence_captures_version_check", sql`${t.version} > 0`), check("evidence_captures_status_check", sql`${t.status} in ('queued','running','complete','failed')`)]);

export const evidenceCaptureRows = appSchema.table("evidence_capture_rows", {
  captureId: uuid("capture_id").notNull().references(() => evidenceCaptures.id, { onDelete: "cascade" }),
  rowNo: bigint("row_no", { mode: "number" }).notNull(),
  record: jsonb("record").notNull(),
  valueExact: numeric("value_exact"),
}, t => [primaryKey({ columns: [t.captureId, t.rowNo] })]);
