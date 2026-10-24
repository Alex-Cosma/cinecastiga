import { encodeSpec } from "./permalink";
import type { AskSpec } from "./spec";
import type { QuestionSpec } from "./question-ui";
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
