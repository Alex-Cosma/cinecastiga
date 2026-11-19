import { flagLabel } from "../flags";
import type { TableColumns } from "../table-filters/types";
import { scatterFlagsOf, type ScatterRole } from "./scatter-shared";

/*
 * The columns of the risk map's list (owner, 19 November 2026: the whole list on the page, 10 a page, a funnel on each
 * column). Shared by the screen (the funnels, the chips) and the server (scatter-list.ts binds them to SQL). The
 * parameters are the request's (/api/ask/scatter-list); the page's address keeps only the question.
 */
export const SCATTER_LIST_PAGE_SIZE = 10;

export function scatterListColumns(role: ScatterRole): TableColumns {
  const firm = role === "supplier";
  return [
    { key: "nume", kind: "pick", label: firm ? "Firmă" : "Instituție", chip: "", param: "nume", valuePattern: /^\d{1,19}$/, counts: false },
    { key: "judet", kind: "pick", label: "Județ", chip: "județul", param: "judet", valuePattern: /^[\p{L} .-]{1,40}$/u },
    { key: "tipare", kind: "options", label: "Tipare", chip: "", param: "tipare", valuePattern: /^[a-z_]{3,40}$/,
      labels: Object.fromEntries(scatterFlagsOf(role).map((code) => [code, flagLabel(code)])) },
    { key: "valoare", kind: "range", label: "Valoare", chip: "valoarea", param: "valoare", unit: "lei" },
    { key: "risc", kind: "range", label: "Risc", chip: "riscul", param: "risc" },
    { key: "achizitii", kind: "range", label: "Achiziții directe", chip: "achiziții directe", param: "achizitii" },
  ];
}
