import { createHash } from "node:crypto";
import { withMonitoringSnapshot, MonitoringRefreshUnavailableError, type DbSql } from "@seap/db";
import { assertConnectionIdentity } from "./connections";
import { connectionTransaction } from "./connection-evidence";
import { PeerError, getPeersInSnapshot } from "./peers";
import { getLegacyPeersInSnapshot } from "./peers-legacy";
import { peerEvidenceSpec, validatePeerEvidence, type PeerEvidenceSelection } from "./peers-evidence-shared";
import type { PeerMember, PeersResult } from "./peers-shared";
import type { Grounding } from "./ask/ground";
import type { DrillOpts } from "./ask/compile";

export interface BoundPeerEvidence {
  selection: PeerEvidenceSelection; spec: ReturnType<typeof peerEvidenceSpec>; grounding: Grounding;
  sourceMembers: PeerMember[]; comparison: PeersResult;
  context: { title: string; description: string; selectionKind: "comparison" | "member"; focal: PeerMember;
    cohort: PeersResult["cohort"]; members: PeerMember[]; filters: PeersResult["filters"]; checkpoint: PeersResult["checkpoint"]; methodology: PeersResult["methodology"] };
}

export async function bindPeerEvidence(q: DbSql, raw: unknown): Promise<BoundPeerEvidence> {
  const selection = validatePeerEvidence(raw);
  if ("error" in selection) throw new PeerError(selection.error);
  const [checkpoint] = await q`select id,status,version::text,completed_at::text,source_coverage from app.monitoring_refreshes order by version desc limit 1`;
  if (!checkpoint || checkpoint.status !== "ready" || checkpoint.id !== selection.checkpointId)
    throw new PeerError("Datele comparației s-au schimbat. Reia comparația înainte de a vedea sau salva sursele.", 409);
  const { entityId, identity, role, dataset, year, cpv, county, checkpointId } = selection;
  const getComparison = selection.version === "peer-evidence-1" ? getLegacyPeersInSnapshot : getPeersInSnapshot;
  const comparison = await getComparison(q, { entityId, identity, role, dataset, year, cpv, ...(county===undefined?{}:{county}), checkpointId, page: 1,
    ...(selection.version === "peer-evidence-2" ? { method: selection.method, populationVersion: selection.populationVersion, members: selection.members } : {}) },
    { id: String(checkpoint.id), version: String(checkpoint.version), validatedAt: checkpoint.completed_at == null ? null : String(checkpoint.completed_at), sourceCoverage: checkpoint.source_coverage as Record<string, unknown> },
    selection.selection.kind === "comparison" ? { allMembers: true } : { memberId: selection.selection.entityId });
  if (!comparison.focal) throw new PeerError("Entitatea nu are surse pentru anul și domeniul alese. Reia comparația.", 409);
  if (selection.selection.kind === "comparison" && comparison.cohort.status === "unknown_authority_type")
    throw new PeerError("Tipul instituției nu poate fi stabilit. Poți păstra separat sursele instituției, dar nu o comparație automată.");
  if (selection.selection.kind === "comparison" && comparison.cohort.status === "unknown_population")
    throw new PeerError("Populația administrației nu a putut fi identificată. Alege manual membrii înainte de a salva comparația.");
  if (selection.selection.kind === "comparison" && selection.version === "peer-evidence-2" && !comparison.cohort.count)
    throw new PeerError("Adaugă cel puțin o altă entitate înainte de a salva comparația.");
  let sourceMembers: PeerMember[];
  if (selection.selection.kind === "member") {
    const selected = selection.selection;
    const member = selected.entityId === comparison.entity.id ? comparison.focal : comparison.members.find(candidate => candidate.entity.id === selected.entityId);
    if (!member) throw new PeerError("Entitatea aleasă nu aparține grupului comparației. Reia comparația.", 409);
    assertConnectionIdentity(member.entity, selected.identity);
    sourceMembers = [member];
  } else sourceMembers = [comparison.focal, ...comparison.members];
  const spec = peerEvidenceSpec(selection), grounding: Grounding = selection.cpv === "all" ? {} : {cpv:{term:selection.cpv,prefixes:[selection.cpv],matchedNames:[],method:"code"}};
  if (selection.selection.kind === "member") {
    const member = sourceMembers[0]!.entity;
    grounding[role] = { query: member.name, entityId: member.id, nameDisplay: member.name, county: member.county, alternatives: [] };
  }
  const title = selection.selection.kind === "comparison" ? `Comparație · ${comparison.entity.name}` : `Surse în comparație · ${sourceMembers[0]!.entity.name}`;
  let description = selection.selection.kind === "comparison"
    ? `Comparația păstrează entitatea analizată, toți cei ${comparison.cohort.count} alți membri și toate sursele eligibile. Mediana exclude entitatea analizată. Media pe înregistrare nu este un preț unitar, iar diferențele nu stabilesc o neregulă.`
    : "Această captură păstrează sursele unui singur membru. Grupul și mediana oferă context; sursele celorlalți membri nu sunt incluse în această captură.";
  if (selection.version === "peer-evidence-2") description +=
    ` Grupul conține ${comparison.cohort.count} alți membri, dintre care ${comparison.cohort.observedMemberCount ?? comparison.cohort.count} au înregistrări eligibile. Membrii fără înregistrări rămân în grup, dar nu intră în mediană; lipsa datelor nu înseamnă cheltuieli zero.`;
  return { selection, spec, grounding, sourceMembers, comparison,
    context: { title, description, selectionKind: selection.selection.kind, focal: comparison.focal, cohort: comparison.cohort,
      members: selection.selection.kind === "comparison" ? comparison.members : sourceMembers, filters: comparison.filters, checkpoint: comparison.checkpoint, methodology: comparison.methodology } };
}

/** Queue and worker must describe the same cohort even if a writer bypasses the gate. */
export function peerCaptureFingerprint(bound: BoundPeerEvidence): string {
  return createHash("sha256").update(JSON.stringify({selection:bound.selection,cohort:bound.comparison.cohort,
    focal:bound.comparison.focal,members:bound.sourceMembers})).digest("hex");
}

/** County selects registered entities, never the buyer county on a source row. */
export function peerEvidenceOptions(bound: BoundPeerEvidence, opts: DrillOpts, capture = false): DrillOpts {
  if (opts.scope && Object.keys(opts.scope).length) throw new PeerError("Selecția comparației este fixată. Reia comparația pentru a schimba membrii sau domeniul.");
  if (capture && bound.selection.selection.kind === "comparison" && (opts.search || opts.state || opts.stream))
    throw new PeerError("Elimină filtrele din lista surselor înainte de salvare. Comparația păstrează toate înregistrările selecției, fără un eșantion filtrat.");
  return { ...opts, scope: { entityIds: bound.sourceMembers.map(member => member.entity.id), role: bound.selection.role } };
}
export async function withPeerEvidence<T>(sql: DbSql, raw: unknown, work: (q: DbSql, evidence: BoundPeerEvidence) => Promise<T>): Promise<T> {
  const selection = validatePeerEvidence(raw);
  if ("error" in selection) throw new PeerError(selection.error);
  return withMonitoringSnapshot(sql, async q => work(connectionTransaction(q), await bindPeerEvidence(q, selection)), selection.checkpointId);
}
export function peerEvidenceError(error: unknown): { error: string; status: number } | null {
  if (error instanceof PeerError) return { error: error.message, status: error.status };
  if (error instanceof MonitoringRefreshUnavailableError) return { error: error.reason === "superseded"
    ? "Datele comparației s-au schimbat. Reia comparația înainte de a continua."
    : "Datele sunt în curs de verificare. Reîncearcă după finalizarea actualizării.", status: 409 };
  return null;
}
