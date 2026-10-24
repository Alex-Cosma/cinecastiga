import type { FilterDef } from "../types";
import { readAhead, setFilters } from "./shared";
import type { Party } from "./selection";

/* The second entity of a comparison (same role as the first) and, read ahead, their shared clients (F4). */

export const compareWith: FilterDef<Party> = {
  id: "compareWith", keys: ["filters.compareWith", "filters.compareWithId"], placement: "sentence", control: "entitySearch",
  label: "A doua entitate",
  windowTitle: "Cu cine comparăm?", windowNote: "Comparăm două instituții sau două firme în aceeași selecție.",
  engine: { compare: "row" }, scope: () => "selection",
  read: (spec) => spec.filters.compareWith || spec.filters.compareWithId
    ? { name: String(spec.filters.compareWith ?? ""), ...(spec.filters.compareWithId ? { id: Number(spec.filters.compareWithId) } : {}) } : undefined,
  write: (spec, value) => setFilters(spec, { compareWith: value?.name, compareWithId: value?.id }),
  // The picker searches the focal entity's role.
  choices: (_spec, ctx) => [ctx.role === "authority" ? { name: "Comuna Alta", id: 103 } : { name: "Firma Alta SRL", id: 204 }],
};

export const sharedPartners = readAhead<true>({
  id: "sharedPartners", keys: ["filters.sharedPartners"], placement: "strip", control: "toggle",
  label: "Doar clienții comuni", scope: "selection",
  sample: { block: "compare", value: true, base: { dim: "supplier", filters: { supplierId: 1, compareWithId: 2 } } },
});

export const COMPARE_DEFS: readonly FilterDef[] = [compareWith, sharedPartners];
