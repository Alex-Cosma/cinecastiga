import type { AskSpec, Dataset } from "./ask/spec";

export type ConnectionRole = "authority" | "supplier";
export interface ConnectionEntity {
  id: string;
  name: string;
  cui: string | null;
  county: string | null;
  countryCode: string | null;
  role: ConnectionRole;
  /** An identity receipt: a reused internal database ID must never silently change the party. */
  identity: string;
}
export interface ConnectionTotals {
  totalExact: string;
  daRows: number;
  /** One contract allocation per supplier, not necessarily a distinct contract. */
  contractRows: number;
  distinctContracts: number;
  firstDate: string | null;
  lastDate: string | null;
  undatedRows: number;
}
export interface ConnectionItem extends ConnectionTotals {
  entity: ConnectionEntity;
  spec: AskSpec;
}
export interface ConnectionFilters {
  dataset: Dataset;
  yearFrom?: number;
  yearTo?: number;
  search: string;
  page: number;
  excludeEntityId?: string;
  /** Exact counterpart lookup, including a pair outside the first result page. */
  partnerId?: string;
}
export interface ConnectionInput extends ConnectionFilters {
  entityId: string;
  role: ConnectionRole;
  identity?: string;
  checkpointId?: string;
}
export interface ConnectionsResult {
  entity: ConnectionEntity;
  filters: ConnectionFilters;
  summary: ConnectionTotals & { partnerCount: number };
  /** Eligible source rows without a resolved counterpart, or with the same identity at both ends. */
  excluded: { rowCount: number; totalExact: string; selfRows: number };
  items: ConnectionItem[];
  pagination: { page: number; pageSize: number; totalPages: number; totalPartners: number; hasNext: boolean };
  checkpoint: { id: string; version: string; validatedAt: string | null; sourceCoverage: Record<string, unknown> };
}
export type ConnectionPartner = ConnectionItem;
export type ConnectionsResponse = ConnectionsResult;

/** The source drawer and investigation capture use the exact same transaction scope as a connection. */
export function connectionPairSpec(authority: Pick<ConnectionEntity, "id" | "name">,
  supplier: Pick<ConnectionEntity, "id" | "name">, filters: Pick<ConnectionFilters, "dataset" | "yearFrom" | "yearTo">): AskSpec {
  return { block: "stat", measure: "value", dataset: filters.dataset, filters: {
    authorityId: Number(authority.id), authorityName: authority.name,
    supplierId: Number(supplier.id), supplierName: supplier.name,
    ...(filters.yearFrom !== undefined ? { yearFrom: filters.yearFrom } : {}),
    ...(filters.yearTo !== undefined ? { yearTo: filters.yearTo } : {}),
  } };
}
