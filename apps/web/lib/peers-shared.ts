import type { AskSpec, AuthorityKind, Dataset } from "./ask/spec";
import type { ConnectionEntity, ConnectionRole, ConnectionsResult } from "./connections-shared";

export type PeerYear = number | "all";
export const peerPeriodLabel = (year: PeerYear | null) => year === "all" ? "Toți anii" : year === null ? "Perioadă nealeasă" : String(year);

export const peerDomainLabel = (cpv: string | null) => cpv === "all" ? "Toate domeniile" : cpv === null ? "Domeniu neales" : `CPV ${cpv}`;

export interface PeerInput {
  entityId: string; role: ConnectionRole; dataset: Dataset; year?: PeerYear; cpv?: string; county?: string; page: number;
  identity?: string; checkpointId?: string;
  method?: PeerMethod; populationVersion?: string; members?: PeerSelectionMember[];
}
export type PeerMethod = "population" | "activity" | "manual";
export interface PeerSelectionMember { id: string; identity: string }
export interface PeerPopulation {
  value: number; siruta?: number; unitName: string; county: string; level: "local" | "county" | "sector";
  referenceDate: string; sourceUrl: string; sourceSha256?: string; sourceRow: number; catalogVersion: string; differencePercent: number | null; mappingMethod?: "siruta_name_county" | "exact_name_county";
}
export interface PeerFilters { dataset: Dataset; year: PeerYear | null; cpv: string | null; county?: string; page: number;
  method?: PeerMethod; populationVersion?: string; members?: PeerSelectionMember[] }
export interface PeerMember {
  entity: ConnectionEntity; recordCount: number; totalExact: string; meanRounded: string;
  daRows: number; contractRows: number; distinctContracts: number; firstDate: string | null; lastDate: string | null;
  spec: AskSpec;
  population?: PeerPopulation; selectionReason?: "population" | "manual";
}
export interface PeersResult {
  entity: ConnectionEntity; focal: PeerMember | null; filters: PeerFilters;
  suggested: { year: boolean; cpv: boolean };
  options: { years: number[]; divisions: { code: string; label: string; rowCount: number; totalExact: string }[]; counties: string[] };
  cohort: {
    count: number; minimumRecords: number; maximumRecords: number; authorityKind: AuthorityKind | null;
    medianTotalExact: string | null; medianMeanRounded: string | null; enoughPeers: boolean;
    status: "ready" | "small_sample" | "unknown_authority_type" | "no_focal_records" | "unknown_population" | "no_selection";
    excludedUnknownType: number; excludedUnknownCounty: number;
    observedMemberCount?: number; missingPopulationCount?: number;
  };
  coverage: { focalUndatedRows: number; focalYearMissingCpvRows: number; unresolvedEntityRows: number };
  members: PeerMember[];
  pagination: { page: number; pageSize: number; totalPages: number; hasNext: boolean };
  checkpoint: ConnectionsResult["checkpoint"];
  methodology: { version: "peers-1" | "peers-2"; method?: PeerMethod; defaultMethod?: "population" | "activity"; populationVersion?: string; descriptions: string[] };
}
export interface PeerCandidate { entity: ConnectionEntity; population?: PeerPopulation }
export interface PeerCandidatesResult { items: PeerCandidate[]; checkpoint: ConnectionsResult["checkpoint"]; populationVersion: string; hasMore: boolean }

export function peerSourceSpec(entity: Pick<ConnectionEntity, "id" | "name" | "role">, filters: PeerFilters): AskSpec {
  if (filters.year === null || filters.cpv === null) throw new Error("Alege anul și domeniul înainte de a deschide sursele.");
  return { block: "stat", measure: "value", dataset: filters.dataset, filters: {
    [entity.role === "authority" ? "authorityId" : "supplierId"]: Number(entity.id),
    [entity.role === "authority" ? "authorityName" : "supplierName"]: entity.name,
    ...(filters.year === "all" ? {} : { yearFrom: filters.year, yearTo: filters.year }),
  }, ...(filters.cpv === "all" ? {} : { population: { operator: "and" as const, groups: [{ operator: "and" as const, conditions: [{ field: "cpv" as const, op: "in" as const, values: [filters.cpv] }] }] } }) };
}

export type PeersResponse = PeersResult;
export const peerMemberSpec = peerSourceSpec;

/** Explicit all-selection semantics; numeric-year/single-division receipts keep their historic prose. */
export function peerScopeDescriptions(descriptions: string[], year: PeerYear | null, cpv: string | null): string[] {
  if (year !== "all" && cpv !== "all") return descriptions;
  return descriptions.map(text => text
    .replace("Același an calendaristic, canal de achiziții și diviziune CPV.", `${year === "all" ? "Toți anii disponibili" : "Același an calendaristic"}, același canal de achiziții și ${cpv === "all" ? "toate domeniile CPV" : "aceeași diviziune CPV"}.`)
    .replace(/Înregistrările fără an sau CPV utilizabil nu intră în (grup|măsurători)\./g,
      `${year === "all" ? "Înregistrările fără dată sunt incluse dacă îndeplinesc celelalte criterii." : "Înregistrările fără an utilizabil sunt excluse."} ${cpv === "all" ? "Opțiunea „Toate domeniile” include și înregistrările fără CPV utilizabil." : "Înregistrările fără CPV utilizabil sunt excluse."}`));
}
