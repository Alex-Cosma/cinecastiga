import { validateSpec } from "./ask/spec";
import { evidenceOptions } from "./ask/evidence-request";
import { EVIDENCE_KINDS, type CaptureRequest, type EvidenceKind, type FrozenRecord } from "./evidence-captures-shared";
import { evidenceLinks } from "./ask/evidence";
import type { DrillRow } from "./ask/compile";
import { validateRadiografieSelection } from "./radiografie-evidence";
import { connectionEvidenceSpec, validateConnectionEvidence } from "./connection-evidence-shared";
import { peerEvidenceSpec, validatePeerEvidence } from "./peers-evidence-shared";

const object = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
export function validateCaptureRequest(kind: unknown, refId: unknown, spec: unknown, snapshot: unknown): CaptureRequest | { error: string } {
  if (!EVIDENCE_KINDS.includes(kind as EvidenceKind)) return { error: "Tip de probă invalid." };
  const k = kind as EvidenceKind;
  if (k === "monitoring") return { error: "Adaugă o actualizare nouă din Urmăriri. Versiunile unei modificări rămân neschimbate." };
  if (k !== "query" && k !== "note" && (typeof refId !== "string" || (k === "person" ? !refId.trim() || refId.length > 256 : !/^[1-9]\d{0,17}$/.test(refId))))
    return { error: "Identificator de sursă invalid." };
  const input = object(snapshot) ?? {};
  const local = object(input.evidenceOptions) ?? {};
  const options = evidenceOptions({ scope: input.evidenceScope ?? local.scope, search: local.search, state: local.state, stream: local.stream });
  if ("error" in options) return options;
  if (k === "query") {
    if (input.peer !== undefined) {
      if (input.connection !== undefined) return { error: "Alege o singură selecție documentată." };
      const peer = validatePeerEvidence(input.peer);
      if ("error" in peer) return peer;
      if (options.scope && Object.keys(options.scope).length) return { error: "Selecția comparației nu acceptă un alt grup de surse." };
      if (peer.selection.kind === "comparison" && (options.search || options.state || options.stream))
        return { error: "Elimină filtrele listei pentru a salva comparația cu toate sursele." };
      return { kind: k, refId: null, spec: peerEvidenceSpec(peer), options, peer };
    }
    if (input.connection !== undefined) {
      const connection = validateConnectionEvidence(input.connection);
      if ("error" in connection) return connection;
      return { kind: k, refId: null, spec: connectionEvidenceSpec(connection), options, connection };
    }
    const validated = validateSpec(spec);
    if ("error" in validated) return validated;
    return { kind: k, refId: null, spec: validated, options };
  }
  if (k === "radiografie") {
    const selection = validateRadiografieSelection(spec);
    if (!selection) return { error: "Selecție Radiografie invalidă." };
    return { kind: k, refId: refId as string, spec: selection, options: {} };
  }
  if (k === "flag") {
    const flag = object(spec)?.flag;
    if (typeof flag !== "string" || !/^[a-z_]{2,80}$/.test(flag)) return { error: "Cod de semnal invalid." };
    return { kind: k, refId: refId as string, spec: { flag }, options: {} };
  }
  return { kind: k, refId: typeof refId === "string" ? refId : null, spec: null, options: {} };
}

export function freezeRow(row: DrillRow, valueOverride?: string | null): FrozenRecord {
  const links = evidenceLinks(row);
  const original=(row as DrillRow & {originalValueExact?:string|null}).originalValueExact;
  const value = valueOverride === undefined ? Object.hasOwn(row,"originalValueExact") ? original??null : row.valueExact : valueOverride;
  if (value !== null && !/^[+-]?\d+(?:\.\d+)?$/.test(value)) throw new Error("Valoare sursă numerică invalidă.");
  return { daCode: row.daCode, date: row.date, authorityId: row.authorityId, authority: row.authority,
    supplierId: row.supplierId, supplier: row.supplier, county: row.county, cpvCode: row.cpvCode,
    cpvName: row.cpvName, valueExact: value, src: row.src, refId: row.refId, caNoticeId: row.caNoticeId,
    tedPubnum: row.tedPubnum, state: row.state, nWinners: row.nWinners,
    contractValueFull: row.contractValueFull, valueSuspect: row.valueSuspect, sourceUrl: links.seap, tedUrl: links.ted };
}

/** The captured contract's full value never comes from an arbitrary supplier share. */
export function contractSnapshot(fullValue: string | null, currency: string | null, allocations: DrillRow[], title: string | null) {
  return { title, valueExact: fullValue, valueRon: currency?.toUpperCase().includes("RON") ? fullValue : null,
    currency, contractValueFull: fullValue, authority: allocations[0]?.authority ?? null,
    supplier: allocations.map(r => r.supplier ?? "Necunoscut").join("; "),
    suppliers: allocations.map(r => ({ id: r.supplierId, name: r.supplier, shareExact: r.valueExact })),
    nWinners: allocations[0]?.nWinners ?? null, date: allocations[0]?.date ?? null };
}
