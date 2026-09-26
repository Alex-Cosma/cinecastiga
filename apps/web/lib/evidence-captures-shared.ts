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
