import type { AskSpec } from "./ask/spec";
import type { EvidenceScope } from "./ask/evidence";
import type { ConnectionEvidenceSelection } from "./connection-evidence-shared";
import type { PeerEvidenceSelection } from "./peers-evidence-shared";

export const EVIDENCE_KINDS = ["entity", "contract", "notice", "person", "query", "flag", "note", "da", "signal", "radiografie", "monitoring"] as const;
export type EvidenceKind = typeof EVIDENCE_KINDS[number];
export type CaptureStatus = "queued" | "running" | "complete" | "failed";
export interface CaptureOptions { scope?: EvidenceScope; search?: string; state?: string; stream?: "da" | "contracts" }
export interface RadiografiePatternBinding {
  version: "radiografie-pattern-1"; authorityId:string; kind:string; cpvClass:string; memberIds:string[]; notices:string[]; fingerprint:string;
}
export interface CaptureRequest { kind: EvidenceKind; refId: string | null; spec: AskSpec | Record<string, unknown> | null; options: CaptureOptions; sourceBinding?: RadiografiePatternBinding; connection?: ConnectionEvidenceSelection; peer?: PeerEvidenceSelection; peerBinding?: {fingerprint:string} }
export interface CaptureSummary {
  id: string; version: number; status: CaptureStatus; createdAt: string;
  startedAt: string | null; completedAt: string | null; rowCount: number | null;
  totalExact: string | null; error: string | null; methodology: Record<string, unknown> | null;
  scope: CaptureRequest; summary: Record<string, unknown> | null;
}
export interface FrozenRecord {
  daCode: string | null; date: string | null; authorityId: string | null; authority: string | null;
  supplierId: string | null; supplier: string | null; county: string | null;
  cpvCode: string | null; cpvName: string | null; valueExact: string | null;
  src: "da" | "contracts"; refId: string | null; caNoticeId: string | null; tedPubnum: string | null;
  state: string | null; nWinners: number | null; contractValueFull: string | null;
  contractInternalId?: string | null;
  valueSuspect: boolean; sourceUrl: string | null; tedUrl: string | null;
}

/**
 * Why a capture did not keep the sources, in the dossier's words (audit Z8-02): the data gate's messages speak of
 * "Monitorizarea" (Urmăriri's own product, packages/db), which a dossier does not use. Pure, for the card, the
 * dossier's summary line and the export.
 */
export function captureFailureWords(error: string | null | undefined): { reason: string; text: string } {
  const e = error ?? "";
  if (/nu a fost validat|Monitorizarea așteaptă|actualizare verificată a datelor|în curs de actualizare|Versiunea datelor s-a schimbat/i.test(e))
    return { reason: "datele de azi nu sunt încă validate", text: "Datele de azi nu sunt încă validate. Păstrarea surselor așteaptă o actualizare validată; o poți relua după ea." };
  return { reason: "captura nu s-a încheiat", text: e ? `Captura nu s-a încheiat: ${e}` : "Captura nu s-a încheiat. Nu este prezentată ca dovadă completă." };
}

/** How a capture was made, in words (audit Z8-36, Z8-43): "Probe înghețate, v1 · scor de risc rf-2026.24". */
export function captureMethodWords(methodology: Record<string, unknown> | null | undefined): string | null {
  const m = methodology ?? {};
  const version = typeof m.version === "string" ? m.version : null, frozen = version ? /^frozen-evidence-(\d+)$/.exec(version) : null;
  return [frozen ? `Probe înghețate, v${frozen[1]}` : version, m.riskVersion ? `scor de risc ${String(m.riskVersion)}` : null].filter(Boolean).join(" · ") || null;
}
