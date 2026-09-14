import { encodeSpec } from "./permalink";
import type { AskSpec } from "./spec";
import type { TableRow } from "./compile";

/** Source drill-downs preserve the executed measure's plausibility rule.
 * Count questions can include rows excluded from monetary aggregates. */
function rowsSpec(spec: AskSpec): AskSpec {
  return {
    block: "stat",
    measure: spec.measure === "count" ? "count" : "value",
    ...(spec.dataset ? { dataset: spec.dataset } : {}),
    filters: { ...spec.filters },
  };
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
