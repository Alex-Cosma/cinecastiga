import type { AskSpec } from "./ask/spec";
import { alignAnswerVersions, canonicalJson, readAnswerVersion } from "./ask/answer-core";
import type { CaptureOptions, FrozenRecord } from "./evidence-captures-shared";
import { encodeSpec } from "./ask/permalink";

export const MONITORING_MAX_ROWS = 200_000;
export const MONITORING_CHANGE_TYPES = ["added", "removed", "changed", "recalculated", "methodology"] as const;
export type MonitoringChangeType = typeof MONITORING_CHANGE_TYPES[number];
export type MonitoringClassification = "new_dated_record" | "historical_first_observed" | "date_unknown" | "left_selection" | "source_changed";
export interface MonitoringPreferences {
  types: MonitoringChangeType[];
  minimumValueExact: string;
  digest: boolean;
}
export const DEFAULT_MONITORING_PREFERENCES: MonitoringPreferences = {
  types: [...MONITORING_CHANGE_TYPES], minimumValueExact: "0", digest: false,
};
/**
 * The fixed members of a trend or network group (plan §2.8, F2): fixed when
 * the watch is activated, separate from `scope`, so the watch follows the
 * same entities (or counties) at every check; the live group is only a note.
 */
export interface MonitoringMembers { kind: "trend-group" | "network-group"; role: "supplier" | "authority" | "county"; group: string; ids: string[]; frozenAt: string }
/** A watch's sources: the drawer's selection (CaptureOptions) and, on a group, its fixed members. */
export type MonitoringOptions = CaptureOptions & { members?: MonitoringMembers };
export interface MonitoringScope { spec: AskSpec; options: MonitoringOptions }
/**
 * A watch's question and sources in Întreabă: the scope travels as `evidence`, the drawer's filters as
 * `sourceFilters` (only those validateEvidenceFilters reads). A group's fixed members never travel: the
 * link opens the group of today (the watch's summary says it keeps the fixed ones).
 */
export function selectionHref({ spec, options }: MonitoringScope): string {
  const filters = Object.fromEntries((["search", "state", "stream"] as const).flatMap((key) => options[key] ? [[key, options[key]]] : []));
  return `/intreaba?spec=${encodeURIComponent(encodeSpec(spec))}&drill=1${options.scope ? `&evidence=${encodeURIComponent(JSON.stringify(options.scope))}` : ""}${Object.keys(filters).length ? `&sourceFilters=${encodeURIComponent(JSON.stringify(filters))}` : ""}`;
}
export interface MonitoringCreateInput extends MonitoringScope { title?: string; preferences?: MonitoringPreferences; recipeId?: string; recipeVersion?: number }
export interface MonitoringWatch extends MonitoringScope {
  id: string; title: string; paused: boolean; preferences: MonitoringPreferences;
  createdAt: string; updatedAt: string; pinnedAt: string;
  recipeId: string | null; recipeVersion: number | null;
  lastSuccessRunId: string | null; lastSuccessAt: string | null;
  lastAttemptAt: string | null; lastError: string | null;
  unreadCount: number;
  scopeNotes: string[];
}
export interface MonitoringCounts { added: number; removed: number; changed: number }
export interface MonitoringRun {
  id: string; watchId: string; watchTitle: string; checkpointId: string;
  previousRunId: string | null; previousCheckedAt: string | null; status: "complete" | "failed";
  kind: "baseline" | "update" | "unchanged"; checkedAt: string;
  rowCount: number | null; totalExact: string | null; knownValueExact: string | null; unknownValues: number;
  previousTotalExact: string | null; totalDifferenceExact: string | null;
  counts: MonitoringCounts; relevantCounts: MonitoringCounts;
  hasAlert: boolean; reviewedAt: string | null;
  resultChanged: boolean; methodologyChanged: boolean;
  error: string | null; checkpoint: Record<string, unknown>; previousCheckpoint: Record<string, unknown> | null;
  notes: string[];
}
export interface MonitoringDelta {
  cursor: string; sourceKey: string; type: "added" | "removed" | "changed";
  classification: MonitoringClassification; relevant: boolean;
  before: FrozenRecord | null; after: FrozenRecord | null;
  changedFields: string[]; amountDifferenceExact: string | null;
  observedAt: string; previousObservedAt: string;
}
export interface MonitoringPage<T> { items: T[]; nextCursor: string | null }
export interface MonitoringRunDetail {
  watch: MonitoringWatch; run: MonitoringRun;
  previousResult: unknown; result: unknown;
  methodology: Record<string, unknown>; previousMethodology: Record<string, unknown> | null;
}
/**
 * Two stored methodologies of a watch as they are compared (plan §2.8): the
 * answer versions read with the "<id>-1" rule (a run from before F0 has none)
 * and over the same ids, the rest as stored. The check compares these, and
 * "Ce s-a schimbat în metodologie" lists their differences.
 */
export function comparableMethodologies(before: Record<string, unknown> | null, after: Record<string, unknown>, block: string): [Record<string, unknown> | null, Record<string, unknown>] {
  if (!before) return [null, after];
  const [a, b] = alignAnswerVersions(readAnswerVersion(before.answer, block), readAnswerVersion(after.answer, block));
  return [{ ...before, answer: a }, { ...after, answer: b }];
}
export function methodologiesDiffer(before: Record<string, unknown> | null, after: Record<string, unknown>, block: string): boolean {
  const [a, b] = comparableMethodologies(before, after, block);
  return canonicalJson(a) !== canonicalJson(b);
}
export interface MonitoringCaseResult { investigationId: string; clipId: string; beforeCaptureId: string; afterCaptureId: string; taskId: string | null }

/** API contract (every endpoint requires the owner's authenticated session):
 * GET/POST /api/urmariri → {items,nextCursor,refresh} / {watch}
 * GET/PATCH /api/urmariri/:id → {watch} / {watch}; PATCH accepts title,paused,preferences only.
 * GET /api/urmariri/actualizari?after=runUUID&unread=1 → {items,nextCursor,refresh}
 * GET /api/urmariri/:id/runs?after=runUUID → {items,nextCursor}
 * GET /api/urmariri/:id/runs/:runId → MonitoringRunDetail
 * PATCH /api/urmariri/:id/runs/:runId {reviewed:boolean} → {run}
 * GET /api/urmariri/:id/runs/:runId/rows?after=0&relevant=1 → {items,nextCursor}
 * GET /api/urmariri/:id/runs/:runId/sources?after=0 → {items:[{cursor,record}],nextCursor}
 * POST /api/urmariri/:id/runs/:runId/anchete {investigationId,createTask?:boolean} → MonitoringCaseResult
 * POST /api/urmariri/:id/check → {run|null}; schedules a check on the current READY checkpoint only.
 * Errors always {error:string}; 401 session,404 ownership,409 refresh not ready,422 unsupported/too broad.
 */
