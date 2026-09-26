import type { AskSpec } from "./ask/spec";
import type { CaptureOptions, FrozenRecord } from "./evidence-captures-shared";

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
export interface MonitoringScope { spec: AskSpec; options: CaptureOptions }
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
