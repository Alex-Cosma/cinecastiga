import { MonitoringRefreshUnavailableError, withMonitoringSnapshot, type DbSql } from "@seap/db";
import { ConnectionError, assertConnectionIdentity, readConnectionEntity } from "./connections";
import { connectionEvidenceSpec, validateConnectionEvidence, type ConnectionEvidenceSelection } from "./connection-evidence-shared";
import type { ConnectionEntity } from "./connections-shared";
import type { AskSpec } from "./ask/spec";
import type { Grounding } from "./ask/ground";

export interface BoundConnectionEvidence {
  selection: ConnectionEvidenceSelection;
  spec: AskSpec;
  grounding: Grounding;
  context: { title: string; description: string; pairs: { authority: ConnectionEntity; supplier: ConnectionEntity }[]; checkpointId: string; dataset: string; yearFrom?: number; yearTo?: number };
}
/** Called inside the reader/capture transaction; never trust browser names, amounts or query scope. */
export async function bindConnectionEvidence(q: DbSql, raw: unknown): Promise<BoundConnectionEvidence> {
  const selection = validateConnectionEvidence(raw);
  if ("error" in selection) throw new ConnectionError(selection.error);
  const [checkpoint] = await q`select id,status from app.monitoring_refreshes order by version desc limit 1`;
  if (!checkpoint || checkpoint.status !== "ready" || checkpoint.id !== selection.checkpointId)
    throw new ConnectionError("Datele acestei legături s-au schimbat. Redeschide legătura înainte de a vedea sau salva sursele; nicio selecție nouă nu a înlocuit-o automat.", 409);
  const entities = new Map<string, ConnectionEntity>();
  for (const pair of selection.pairs) for (const role of ["authority", "supplier"] as const) {
    const expected = pair[role], key = `${role}:${expected.id}`;
    const actual = entities.get(key) ?? await readConnectionEntity(q, expected.id, role);
    assertConnectionIdentity(actual, expected.identity); entities.set(key, actual);
  }
  const pairs = selection.pairs.map(pair => ({ authority: entities.get(`authority:${pair.authority.id}`)!, supplier: entities.get(`supplier:${pair.supplier.id}`)! }));
  const first = pairs[0]!, second = pairs[1];
  const title = second ? first.authority.id === second.authority.id
    ? `Legătură · ${first.supplier.name} → ${first.authority.name} ← ${second.supplier.name}`
    : `Legătură · ${first.authority.name} → ${first.supplier.name} ← ${second.authority.name}`
    : `Legătură · ${first.authority.name} → ${first.supplier.name}`;
  const description = second ? first.authority.id === second.authority.id
    ? "Traseul ales leagă două firme prin aceeași instituție cumpărătoare. Această legătură nu stabilește proprietari comuni, colaborare între firme sau o neregulă."
    : "Traseul ales leagă două instituții prin aceeași firmă furnizoare. Această legătură nu stabilește o coordonare între instituții sau o neregulă."
    : "Perechea aleasă este o instituție cumpărătoare și o firmă furnizoare. Valorile înregistrate nu dovedesc efectuarea plății sau existența unei nereguli.";
  const spec = connectionEvidenceSpec(selection), grounding: Grounding = {};
  // These exact entities were just checked in this snapshot. Ground from that
  // receipt instead of requiring a historical profile or resolving a name.
  for (const role of ["authority", "supplier"] as const) if (spec.filters[`${role}Id`] !== undefined) {
    const actual = first[role];
    grounding[role] = {query:actual.name,entityId:actual.id,nameDisplay:actual.name,county:actual.county,alternatives:[]};
  }
  return { selection, spec, grounding, context: { title, description, pairs,
    checkpointId: selection.checkpointId, dataset: selection.dataset,
    ...(selection.yearFrom === undefined ? {} : { yearFrom: selection.yearFrom }), ...(selection.yearTo === undefined ? {} : { yearTo: selection.yearTo }) } };
}

/** postgres.js reserved connection has no nested begin; keep compiler reads in this snapshot. */
export function connectionTransaction(q: DbSql): DbSql {
  const bound = ((...args: unknown[]) => (q as unknown as (...args: unknown[]) => unknown)(...args)) as unknown as DbSql;
  return Object.assign(bound, q, { begin: (options: unknown, run?: (sql: DbSql) => Promise<unknown>) =>
    (typeof options === "function" ? options as (sql: DbSql) => Promise<unknown> : run!)(q) });
}
export async function withConnectionEvidence<T>(sql: DbSql, raw: unknown, work: (q: DbSql, evidence: BoundConnectionEvidence) => Promise<T>): Promise<T> {
  const selection = validateConnectionEvidence(raw);
  if ("error" in selection) throw new ConnectionError(selection.error);
  return withMonitoringSnapshot(sql, async q => work(connectionTransaction(q), await bindConnectionEvidence(q, selection)), selection.checkpointId);
}
export function connectionEvidenceError(error: unknown): { error: string; status: number } | null {
  if (error instanceof ConnectionError) return { error: error.message, status: error.status };
  if (error instanceof MonitoringRefreshUnavailableError) return { error: error.reason === "superseded"
    ? "Datele acestei legături s-au schimbat. Redeschide legătura înainte de a continua."
    : "Datele sunt în curs de verificare. Reîncearcă după finalizarea actualizării.", status: 409 };
  return null;
}
