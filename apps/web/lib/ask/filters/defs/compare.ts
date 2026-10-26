import { COMPARE_RULES } from "../../spec";
import type { FilterDef } from "../types";
import { alwaysScope, setFilters } from "./shared";
import type { Party } from "./selection";

/* The second entity of a comparison (same role as the first) and, between two firms, their shared clients (F4). */

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

/**
 * „Doar clienții comuni” (plan §4.6 P6, final compare §3.4, kit component 5):
 * the switch beside the answer of two firms, with the number of their shared
 * clients; under the sentence only once set (a link, the words "clienții
 * comuni"), as a chip with ×. A selection: P, the institutions that bought
 * from both, every section and total keeps their records (compare-prestep.ts).
 * Between institutions it does not exist: their shared suppliers are a
 * section of the answer.
 */
export const sharedPartners: FilterDef<true> = {
  id: "sharedPartners", keys: ["filters.sharedPartners"], placement: "strip", control: "toggle",
  label: "Doar clienții comuni", windowTitle: "Doar clienții comuni",
  engine: { compare: "row" }, scope: alwaysScope("selection"), since: "F4",
  read: (spec) => spec.filters.sharedPartners === true ? true : undefined,
  write: (spec, value) => setFilters(spec, { sharedPartners: value }),
  choices: (_spec, ctx) => ctx.role === "supplier" ? [undefined, true] : [undefined],
  validate: COMPARE_RULES.sharedPartners,
};

export const COMPARE_DEFS: readonly FilterDef[] = [compareWith, sharedPartners];
