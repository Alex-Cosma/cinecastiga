import type { AskSpec } from "./spec";

/**
 * The questions other pages of the site open in "Întreabă" (plan §2.6). Each
 * page builds its spec here, as a pure function, so the legacy-link corpus
 * (fixtures/legacy-corpus.ts) runs exactly what the page links to, and the
 * inventory (fixtures/site-links-inventory.ts) fails on a link built anywhere
 * else. Key order is the permalink's: reordering changes every link's bytes.
 */

type Role = "authority" | "supplier";
type Party = { id: string; name: string };

/** Home "Pornește de aici" cards; the first is also the guide's question. */
export const ROADS_RANKING_SPEC: AskSpec = { block: "table", dataset: "all", dim: "supplier", measure: "value", topN: 10, filters: { cpvTerm: "drumuri" } };
export const HOSPITALS_BREAKDOWN_SPEC: AskSpec = { block: "breakdown", dataset: "all", measure: "value", filters: { authorityKind: "spital" } };
export const CONTRACT_WINNERS_SPEC: AskSpec = { block: "table", dataset: "contracts", dim: "supplier", measure: "value", topN: 10, filters: {} };
/** Home national figures. The DA count states the plausibility bound the engine serves from agg_national. */
export const NATIONAL_DA_COUNT_SPEC: AskSpec = { block: "stat", dataset: "da", measure: "count", filters: {}, population: { operator: "and", groups: [{ operator: "and", conditions: [{ field: "value", op: "lte", value: "2000000" }] }] } };
export const NATIONAL_CONTRACT_COUNT_SPEC: AskSpec = { block: "stat", dataset: "contracts", measure: "count", filters: {} };
export const NATIONAL_VALUE_SPEC: AskSpec = { block: "stat", dataset: "all", measure: "value", filters: {} };
/** The home map's "Vezi harta" link. */
export const NATIONAL_MAP_SPEC: AskSpec = { block: "map", dataset: "all", measure: "value", filters: {} };

/** Entity page stat cards: this entity's records of one channel (opened on its sources). */
export function entityChannelSpec(entityId: string, name: string, role: Role, dataset: "da" | "contracts" | "all"): AskSpec {
  return {
    block: "stat",
    measure: "value",
    dataset,
    filters:
      role === "authority"
        ? { authorityName: name, authorityId: Number(entityId) }
        : { supplierName: name, supplierId: Number(entityId) },
  };
}

/** Entity page "Conducere": a ranking of every firm this person represents today. */
export function personFirmsSpec(personKey: string, personName: string): AskSpec {
  return {
    block: "table",
    dim: "supplier",
    measure: "value",
    filters: { adminPersonKey: personKey, adminName: personName },
  };
}

/** Entity page year chart: one month of the entity's direct acquisitions (opened on its sources). */
export function entityMonthSpec(entityId: string, entityName: string, role: Role, year: number | string, month: number): AskSpec {
  return {
    block: "stat",
    measure: "value",
    dataset: "da",
    filters: {
      ...(role === "authority"
        ? { authorityId: Number(entityId), authorityName: entityName }
        : { supplierId: Number(entityId), supplierName: entityName }),
      yearFrom: Number(year),
      yearTo: Number(year),
      monthFrom: month,
      monthTo: month,
    },
  };
}

/** Partner rows (entity page) and the contract page: one buyer–firm pair, on both channels. */
export function pairSpec(authority: Party, supplier: Party): AskSpec {
  return {
    block: "stat",
    measure: "value",
    filters: {
      authorityName: authority.name,
      supplierName: supplier.name,
      authorityId: Number(authority.id),
      supplierId: Number(supplier.id),
    },
  };
}

/** Domains page: the ranking or the evolution of one CPV division in one year. */
export function domainContextSpec(block: "table" | "timeseries", code: string, year: number, dim?: "supplier" | "authority"): AskSpec {
  return { block, dataset: "all", measure: "value", ...(dim ? { dim, topN: 10 } : {}), filters: { cpvTerm: code, yearFrom: year, yearTo: year } };
}

/** Investigation dossier: a saved person opens the firms the person represents. */
export function personClipSpec(personKey: string): AskSpec {
  return { block: "table", measure: "value", dim: "supplier", filters: { adminPersonKey: personKey } };
}

/** Radiografie: the procedure contracts of one buyer–firm pair, in the sources drawer. */
export function pairContractsSpec(authorityId: string | number, supplierId: string | number): AskSpec {
  return { block: "fact_check", dataset: "contracts", measure: "value", filters: { authorityId: Number(authorityId), supplierId: Number(supplierId) } };
}

/** Evidence capture of a person: the records of every firm the person represents. */
export function personCaptureSpec(personKey: string): AskSpec {
  return { block: "stat", measure: "value", dataset: "all", filters: { adminPersonKey: personKey } };
}

/** Evidence capture of an entity: its records as a buyer or as a firm. */
export function entityCaptureSpec(entityId: string): AskSpec {
  return { block: "stat", measure: "value", dataset: "all", filters: {}, population: { operator: "or", groups: [
    { operator: "or", conditions: [{ field: "authority", op: "in", values: [entityId] }, { field: "supplier", op: "in", values: [entityId] }] },
  ] } };
}
