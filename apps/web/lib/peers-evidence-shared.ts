import type { AskSpec, Dataset } from "./ask/spec";
import type { ConnectionRole } from "./connections-shared";
import type { PeerMethod, PeerSelectionMember, PeerYear } from "./peers-shared";

interface PeerEvidenceBase<Year extends PeerYear = PeerYear> {
  checkpointId: string; entityId: string; identity: string;
  role: ConnectionRole; dataset: Dataset; year: Year; cpv: string; county?: string;
  selection: { kind: "comparison" } | { kind: "member"; entityId: string; identity: string };
}
export interface LegacyPeerEvidenceSelection extends PeerEvidenceBase<number> { version: "peer-evidence-1" }
export interface CurrentPeerEvidenceSelection extends PeerEvidenceBase {
  version: "peer-evidence-2"; method: PeerMethod; populationVersion?: string; members?: PeerSelectionMember[];
}
export type PeerEvidenceSelection = LegacyPeerEvidenceSelection | CurrentPeerEvidenceSelection;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === "string" && /^[1-9]\d{0,15}$/.test(value) && Number.isSafeInteger(Number(value));
const identity = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export function validatePeerEvidence(raw: unknown): PeerEvidenceSelection | { error: string } {
  const invalid = { error: "Comparația salvată nu este validă. Redeschide comparația și încearcă din nou." };
  if (!object(raw) || !["peer-evidence-1", "peer-evidence-2"].includes(String(raw.version)) || !id(raw.entityId) || !identity(raw.identity)
    || typeof raw.checkpointId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(raw.checkpointId)
    || !["authority", "supplier"].includes(String(raw.role)) || !["all", "da", "contracts"].includes(String(raw.dataset))
    || (!(raw.version === "peer-evidence-2" && raw.year === "all") && (!Number.isInteger(raw.year) || Number(raw.year) < 2000 || Number(raw.year) > 2099))
    || typeof raw.cpv !== "string" || (!/^\d{2}$/.test(raw.cpv) && !(raw.version === "peer-evidence-2" && raw.cpv === "all")) || !object(raw.selection)) return invalid;
  if (raw.county !== undefined && (typeof raw.county !== "string" || !raw.county.trim() || raw.county.length > 100)) return invalid;
  const selected = raw.selection;
  if (selected.kind !== "comparison" && (selected.kind !== "member" || !id(selected.entityId) || !identity(selected.identity))) return invalid;
  const base: PeerEvidenceBase & { version: "peer-evidence-1" } = { version: "peer-evidence-1", checkpointId: raw.checkpointId, entityId: raw.entityId, identity: raw.identity,
    role: raw.role as ConnectionRole, dataset: raw.dataset as Dataset, year: raw.year === "all" ? "all" : Number(raw.year), cpv: raw.cpv,
    ...(raw.county === undefined ? {} : { county: String(raw.county).trim() }),
    selection: selected.kind === "comparison" ? { kind: "comparison" } : { kind: "member", entityId: selected.entityId as string, identity: selected.identity as string } };
  // Version 1 is deliberately left byte-for-byte compatible with saved activity captures.
  if (raw.version === "peer-evidence-1") return { ...base, year: base.year as number };
  if (!["population", "activity", "manual"].includes(String(raw.method))) return invalid;
  if (raw.populationVersion !== undefined && (typeof raw.populationVersion !== "string" || !/^[a-z0-9][a-z0-9._-]{0,99}$/.test(raw.populationVersion))) return invalid;
  if ((raw.method === "population" || raw.method === "manual") && raw.populationVersion === undefined) return invalid;
  let members: PeerSelectionMember[] | undefined;
  if (raw.method === "manual") {
    if (raw.county !== undefined) return invalid;
    if (!Array.isArray(raw.members) || raw.members.length > 50) return invalid;
    const seen = new Set<string>(); members = [];
    for (const member of raw.members) {
      if (!object(member) || !id(member.id) || !identity(member.identity) || member.id === raw.entityId || seen.has(member.id)) return invalid;
      seen.add(member.id); members.push({ id: member.id, identity: member.identity });
    }
  } else if (raw.members !== undefined) return invalid;
  return { ...base, version: "peer-evidence-2", method: raw.method as PeerMethod,
    ...(raw.populationVersion === undefined ? {} : { populationVersion: raw.populationVersion as string }),
    ...(members === undefined ? {} : { members }) };
}

/** A portable placeholder. The server always binds membership and identities again. */
export function peerEvidenceSpec(selection: PeerEvidenceSelection): AskSpec {
  return { block: "stat", measure: "value", dataset: selection.dataset,
    filters: { ...(selection.year === "all" ? {} : { yearFrom: selection.year, yearTo: selection.year }),
      ...(selection.selection.kind === "member" ? { [selection.role === "authority" ? "authorityId" : "supplierId"]: Number(selection.selection.entityId) } : {}) },
    ...(selection.cpv === "all" ? {} : { population: { operator: "and" as const, groups: [{ operator: "and" as const, conditions: [{ field: "cpv" as const, op: "in" as const, values: [selection.cpv] }] }] } }) };
}
