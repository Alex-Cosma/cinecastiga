import { withInvestigationAccess, isWorkspaceId } from "./investigation-access";
import { captureDatabase, captureSummary } from "./evidence-captures";
import { captureFingerprint } from "./evidence-bundle";
import { citationText } from "./evidence-citation";
import { clipHref, clipKindLabel, clipSourceUrl, clipTitle, clipValue, type ClipLike } from "./evidence-clip";
import type { CaptureSummary, FrozenRecord } from "./evidence-captures-shared";

/*
 * The frozen-sources page of a dossier ("fișa de probă", owner 7 November 2026): one complete capture of one saved
 * item, its rows in a stated order (by date or by value, chosen in the URL), and its citation. Server-only.
 */

export type SheetSort = "data" | "valoare" | "captura";
export const SHEET_PAGE = 100;
export const sheetSort = (value: unknown): SheetSort => value === "valoare" || value === "captura" ? value : "data";
export const sheetSortWords: Record<SheetSort, string> = {
  data: "după data înregistrării, cele mai noi întâi",
  valoare: "după valoare, cele mai mari întâi",
  captura: "în ordinea capturii",
};

export interface EvidenceSheet {
  capture: CaptureSummary;
  clip: ClipLike & { createdAt: string };
  rows: (FrozenRecord & { rowNo: string })[];
  page: number;
  hasMore: boolean;
  investigationTitle: string;
  /** The item's complete versions, oldest first: this sheet is one of them. */
  versions: { id: string; version: number; completedAt: string | null }[];
  /** The order actually used: a capture over SHEET_SORT_CAP rows is listed in capture order only. */
  sort: SheetSort;
  sortable: boolean;
}

/** Sorting by date or value reads the whole capture on each view: up to this many rows. */
export const SHEET_SORT_CAP = 50_000;

export async function readEvidenceSheet(userId: string, investigationId: string, captureId: string, sort: SheetSort, page: number): Promise<EvidenceSheet | null> {
  if (!isWorkspaceId(captureId)) return null;
  const offset = Math.max(0, Math.min(page, 100000)) * SHEET_PAGE;
  return withInvestigationAccess(userId, investigationId, "read", async (q) => {
    const [row] = await q`select * from app.evidence_captures where id=${captureId} and investigation_id=${investigationId} and status='complete'`;
    if (!row) return null;
    const capture = captureSummary(row);
    const [clipRow] = await q`select id,kind,ref_id,spec,snapshot,note,created_at from app.clips where id=${row.clip_id} and investigation_id=${investigationId}`;
    const [investigation] = await q`select title from app.investigations where id=${investigationId}`;
    const versions = await q`select id::text id, version, completed_at::text completed_at from app.evidence_captures
      where clip_id=${row.clip_id} and investigation_id=${investigationId} and status='complete' order by version`;
    const sortable = capture.rowCount !== null && capture.rowCount <= SHEET_SORT_CAP;
    const used: SheetSort = sortable ? sort : "captura";
    const order = used === "valoare" ? q`value_exact desc nulls last, row_no` : used === "captura" ? q`row_no` : q`record->>'date' desc nulls last, row_no`;
    const rows = await q`select row_no::text row_no, record from app.evidence_capture_rows where capture_id=${captureId}
      order by ${order} limit ${SHEET_PAGE + 1} offset ${offset}`;
    const clip = { id: String(clipRow?.id ?? row.clip_id), kind: String(clipRow?.kind ?? capture.scope.kind), refId: clipRow?.ref_id == null ? capture.scope.refId : String(clipRow.ref_id),
      spec: clipRow?.spec ?? capture.scope.spec, snapshot: capture.summary, note: clipRow?.note == null ? null : String(clipRow.note),
      createdAt: clipRow?.created_at instanceof Date ? clipRow.created_at.toISOString() : String(clipRow?.created_at ?? capture.createdAt), capture };
    return { capture, clip, sort: used, sortable, page: Math.max(0, page), hasMore: rows.length > SHEET_PAGE, investigationTitle: String(investigation?.title ?? "Dosar"),
      versions: versions.map((v) => ({ id: String(v.id), version: Number(v.version), completedAt: v.completed_at == null ? null : String(v.completed_at) })),
      rows: rows.slice(0, SHEET_PAGE).map((r) => ({ ...(r.record as FrozenRecord), rowNo: String(r.row_no) })) };
  }, captureDatabase());
}

/** The address the reader used (its Host header; a dev server's own URL says 0.0.0.0). */
export function hostOrigin(host: string | null | undefined, fallback = "http://localhost:3000"): string {
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return fallback;
  return `${/^(localhost|127\.|0\.0\.0\.0)/.test(host) ? "http" : "https"}://${host}`;
}

/** The site's own address for links in a citation: the public origin in production (behind the proxy), else the request's. */
export function publicOrigin(requestOrigin: string): string {
  const configured = process.env.NODE_ENV === "production" ? process.env.BETTER_AUTH_URL : undefined;
  try { return configured ? new URL(configured).origin : requestOrigin; } catch { return requestOrigin; }
}

/** What the sheet and the dossier card copy: the item, its exact value, the capture's moment and fingerprint, the links. */
export function sheetCitation(clip: ClipLike, capture: CaptureSummary, fingerprint: string | null, investigationId: string, origin: string): string {
  const base = publicOrigin(origin), href = clipHref(clip);
  return citationText({
    title: clipTitle(clip), kind: capture.summary?.monitoringSide === "before" ? "Sursele înainte de modificare" : capture.summary?.monitoringSide === "after" ? "Sursele după modificare" : clipKindLabel[clip.kind] ?? "Dovadă",
    value: clipValue({ ...clip, capture }), rowCount: capture.rowCount, totalExact: capture.totalExact,
    capturedAt: typeof capture.summary?.capturedAt === "string" ? capture.summary.capturedAt : capture.completedAt, version: capture.version,
    fingerprint, publicUrl: href && href.startsWith("/") && !href.startsWith("/intreaba") ? `${base}${href}` : null, sourceUrl: clipSourceUrl(clip),
    sheetUrl: `${base}/anchete/${investigationId}/dovezi/${capture.id}`,
  });
}

export async function captureCitation(userId: string, investigationId: string, captureId: string, origin: string): Promise<{ text: string; fingerprint: string | null } | null> {
  const sheet = await readEvidenceSheet(userId, investigationId, captureId, "captura", 0);
  if (!sheet) return null;
  const fingerprint = await captureFingerprint(captureId, sheet.capture.rowCount);
  return { text: sheetCitation(sheet.clip, sheet.capture, fingerprint, investigationId, origin), fingerprint };
}
