import { encodeSpec } from "./permalink";
import type { AskSpec } from "./spec";
import { countyWords, type QuestionSpec } from "./question-ui";
import type { TableRow } from "./compile";
import { retarget } from "./filters/retarget";

/** Source drill-downs preserve the executed measure's plausibility rule.
 * Count questions can include rows excluded from monetary aggregates. */
const rowsSpec = (spec: AskSpec): AskSpec => retarget(spec, "stat");
/** "Ce cumpără…": a slice one CPV level down is the same question on the slice's code. */
export function breakdownDeeperSpec<S extends QuestionSpec>(spec: S, code: string): S {
  const next = retarget(spec, "breakdown");
  next.filters.cpvTerm = code;
  return next;
}
/** Keep aggregate eligibility in the original population when opening a group. */
export function entitySourceLink(spec: AskSpec, row:Pick<TableRow, "entityId" | "name">): string {
  const scope = entitySourceScope(spec, row);
  return `/intreaba?spec=${encodeURIComponent(encodeSpec(spec))}&drill=1&evidence=${encodeURIComponent(JSON.stringify(scope))}`;
}
export function entitySourceScope(spec: AskSpec, row:Pick<TableRow, "entityId" | "name">): import("./evidence").EvidenceScope {
  return spec.dim === "county" ? { county:row.name } : { role:spec.dim === "supplier" ? "supplier" : "authority", entityIds:row.entityId ? [row.entityId] : [] };
}
export function entitySourceSpec(
  spec: AskSpec,
  row: Pick<TableRow, "entityId" | "name">,
): AskSpec {
  const next = rowsSpec(spec);
  if (spec.dim === "county") next.filters.county = row.name;
  else if (spec.dim === "supplier") {
    next.filters.supplierName = row.name;
    if (row.entityId) next.filters.supplierId = Number(row.entityId);
    // The ranked firm is seated there by construction (seatCounty selects firms, F4): its records need no seat condition,
    // which a total of one firm would refuse. The seat against the buyer (firmSeat) selects records: it stays.
    delete next.filters.seatCounty;
  } else {
    next.filters.authorityName = row.name;
    if (row.entityId) next.filters.authorityId = Number(row.entityId);
  }
  return next;
}
/** Intersect the original executed conditions with a year. This also retains
 * month limits when the engine has clamped requested years to data coverage. */
export function yearSourceLink(spec: AskSpec, year: number): string {
  return `/intreaba?spec=${encodeURIComponent(encodeSpec(spec))}&drill=1&evidence=${encodeURIComponent(JSON.stringify({ years: [year] }))}`;
}

/**
 * "Cine conduce?" over a group of one (plan §4.13, final entity_card §4 frame F):
 * a county has one county council, so "which one buys the most" would crown it
 * without a rival. The answer says so instead, in these words.
 */
export function leaderAlone(spec: QuestionSpec): string | null {
  const f = spec.filters;
  if (spec.block !== "entity_card" || spec.dim !== "authority" || f.authorityKind !== "consiliu_judetean" || !f.county || f.uatSiruta) return null;
  return `În ${countyWords(String(f.county)).replace(/^din /, "")} e un singur consiliu județean.`;
}
/**
 * The two answers it offers about that council (R8 "›"): where it stands among
 * the other councils (a distribution with today's keys: the kind, the whole
 * country) and what it buys (the same selection as a total, the council named
 * in place of its kind and county).
 */
export function leaderAloneSpecs<S extends QuestionSpec>(spec: S, entity: { entityId: string; name: string }): { peers: QuestionSpec; total: S } {
  const named = { authorityName: entity.name, ...(entity.entityId ? { authorityId: Number(entity.entityId) } : {}) };
  const peers: QuestionSpec = { block: "distribution", dim: "authority", measure: "value", filters: { ...named, authorityKind: "consiliu_judetean" } };
  const total = retarget(spec, "stat");
  delete total.rankBy;
  for (const key of ["authorityKind", "county", "uatSiruta", "uatName"]) delete total.filters[key];
  Object.assign(total.filters, named);
  return { peers, total };
}
/** Another answer in "Întreabă" (R8 "›"), as a link. */
export const askLink = (spec: QuestionSpec): string => `/intreaba?spec=${encodeURIComponent(encodeSpec(spec))}`;
