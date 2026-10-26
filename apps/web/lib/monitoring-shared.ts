import type { AskSpec } from "./ask/spec";
import { alignAnswerVersions, canonicalJson, readAnswerVersion } from "./ask/answer-core";
import type { CaptureOptions, FrozenRecord } from "./evidence-captures-shared";
import { encodeSpec } from "./ask/permalink";
import { countWords } from "./ask/answer-text";
import { formatInt } from "./format";

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
/** The largest group a watch fixes (plan §9 F2): the national "Noi" (17,633 firms) asks for a place or a shorter period. */
export const MONITORING_MEMBERS_MAX = 5_000;
/** A group above MONITORING_MEMBERS_MAX: "Grupa are 17.633 de firme (cel mult 5.000); restrânge perioada sau locul." (the answer says it before the setup does). */
export const membersTooManyWords = (role: MonitoringMembers["role"], n: number): string =>
  `Grupa are ${role === "county" ? countWords(n, "județ", "județe") : role === "authority" ? countWords(n, "instituție", "instituții") : countWords(n, "firmă", "firme")} (cel mult ${formatInt(MONITORING_MEMBERS_MAX)}); restrânge perioada sau locul.`;
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
/** A check whose methodology changed (a version bump such as D1's kind-2): its records may differ because of it. */
export const MONITORING_METHODOLOGY_CHANGED_NOTE = "Metodologia s-a schimbat la această verificare: o parte din diferențe pot veni din noul calcul, nu din date noi.";
/**
 * The headline of a check in the lists. A changed methodology comes first: the
 * records that entered or left at that check may have done so because of it
 * (D1: a clinical institute enters "spitale"), not because the data changed.
 */
export function monitoringRunTag(run: Pick<MonitoringRun, "kind" | "counts" | "methodologyChanged">): string {
  if (run.kind === "baseline") return "Situația de referință";
  if (run.kind === "unchanged") return "Fără modificări";
  if (run.methodologyChanged) return "Metodologie modificată";
  return run.counts.changed ? "Date modificate" : run.counts.added || run.counts.removed ? "Selecție modificată" : "Rezultat recalculat";
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
