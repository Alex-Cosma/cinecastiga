import type { AskSpec } from "./spec";
import type { Grounding } from "./ground";
import { COUNTIES } from "../counties";

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();
/** The marts store "Buzau"; links, titles and the builder show "Buzău". Grounding folds either. */
export function countyDisplay(canonical: string): string {
  return COUNTIES.find((name) => fold(name) === fold(canonical)) ?? canonical;
}

/** Persist the identities actually executed, so a saved question cannot later
 * resolve an identically named institution to a different record. */
export function resolvedSpec(spec: AskSpec, grounding: Grounding): AskSpec {
  const filters = { ...spec.filters };
  if (grounding.authority?.entityId) {
    filters.authorityId = Number(grounding.authority.entityId);
    if (grounding.authority.nameDisplay)
      filters.authorityName = grounding.authority.nameDisplay;
  }
  if (grounding.supplier?.entityId) {
    filters.supplierId = Number(grounding.supplier.entityId);
    if (grounding.supplier.nameDisplay)
      filters.supplierName = grounding.supplier.nameDisplay;
  }
  if (grounding.compare?.entityId) {
    filters.compareWithId = Number(grounding.compare.entityId);
    if (grounding.compare.nameDisplay)
      filters.compareWith = grounding.compare.nameDisplay;
  }
  if (grounding.county?.canonical) filters.county = countyDisplay(grounding.county.canonical);
  if (grounding.admin?.personKey)
    filters.adminPersonKey = grounding.admin.personKey;
  return { ...spec, filters };
}
