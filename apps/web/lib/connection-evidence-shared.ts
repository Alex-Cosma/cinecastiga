import type { AskSpec, Dataset } from "./ask/spec";

export interface ConnectionEvidenceEntity { id: string; identity: string }
export interface ConnectionEvidencePair { authority: ConnectionEvidenceEntity; supplier: ConnectionEvidenceEntity }
export interface ConnectionEvidenceSelection {
  version: "connection-evidence-1";
  checkpointId: string;
  dataset: Dataset;
  yearFrom?: number;
  yearTo?: number;
  pairs: ConnectionEvidencePair[];
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const entity = (value: unknown): value is ConnectionEvidenceEntity => object(value)
  && typeof value.id === "string" && /^[1-9]\d{0,15}$/.test(value.id) && Number.isSafeInteger(Number(value.id))
  && typeof value.identity === "string" && /^[a-f0-9]{64}$/.test(value.identity);

/** A relationship is one pair, or two pairs sharing exactly one intermediate entity. */
export function validateConnectionEvidence(raw: unknown): ConnectionEvidenceSelection | { error: string } {
  const invalid = { error: "Legătura salvată nu este validă. Redeschide legătura și încearcă din nou." };
  if (!object(raw) || raw.version !== "connection-evidence-1" || typeof raw.checkpointId !== "string"
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(raw.checkpointId)
    || !["all", "da", "contracts"].includes(String(raw.dataset))
    || !Array.isArray(raw.pairs) || raw.pairs.length < 1 || raw.pairs.length > 2) return invalid;
  for (const year of [raw.yearFrom, raw.yearTo]) if (year !== undefined && (!Number.isInteger(year) || Number(year) < 2000 || Number(year) > 2099)) return invalid;
  if (raw.yearFrom !== undefined && raw.yearTo !== undefined && Number(raw.yearFrom) > Number(raw.yearTo)) return invalid;
  const pairs: ConnectionEvidencePair[] = [];
  for (const pair of raw.pairs) {
    if (!object(pair) || !entity(pair.authority) || !entity(pair.supplier) || pair.authority.id === pair.supplier.id) return invalid;
    pairs.push({ authority: { id: pair.authority.id, identity: pair.authority.identity }, supplier: { id: pair.supplier.id, identity: pair.supplier.identity } });
  }
  if (pairs.length === 2) {
    const [a, b] = pairs as [ConnectionEvidencePair, ConnectionEvidencePair];
    const sameAuthority = a.authority.id === b.authority.id, sameSupplier = a.supplier.id === b.supplier.id;
    if (sameAuthority === sameSupplier) return invalid;
    if (sameAuthority && a.authority.identity !== b.authority.identity || sameSupplier && a.supplier.identity !== b.supplier.identity) return invalid;
    if (a.authority.id === b.supplier.id || a.supplier.id === b.authority.id) return invalid;
  }
  return { version: "connection-evidence-1", checkpointId: raw.checkpointId, dataset: raw.dataset as Dataset,
    ...(raw.yearFrom === undefined ? {} : { yearFrom: Number(raw.yearFrom) }),
    ...(raw.yearTo === undefined ? {} : { yearTo: Number(raw.yearTo) }), pairs };
}

/** OR over complete pairs: never the cross product of a buyer list and supplier list. */
export function connectionEvidenceSpec(selection: ConnectionEvidenceSelection): AskSpec {
  const first = selection.pairs[0]!;
  // The compiler pushes base entity filters into each source branch. Keep the
  // shared endpoint there so a small path never materializes the entire mart.
  const authorityId = selection.pairs.every(pair => pair.authority.id === first.authority.id) ? Number(first.authority.id) : undefined;
  const supplierId = selection.pairs.every(pair => pair.supplier.id === first.supplier.id) ? Number(first.supplier.id) : undefined;
  return { block: "stat", measure: "value", dataset: selection.dataset,
    filters: { ...(authorityId === undefined ? {} : { authorityId }), ...(supplierId === undefined ? {} : { supplierId }),
      ...(selection.yearFrom === undefined ? {} : { yearFrom: selection.yearFrom }), ...(selection.yearTo === undefined ? {} : { yearTo: selection.yearTo }) },
    population: { operator: "or", groups: selection.pairs.map(pair => ({ operator: "and", conditions: [
      { field: "authority", op: "in", values: [pair.authority.id] },
      { field: "supplier", op: "in", values: [pair.supplier.id] },
    ] })) } };
}
