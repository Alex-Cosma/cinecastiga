import type { TableColumns } from "./table-filters/types";

/*
 * The filterable columns of the repeated-purchases groups on the entity page (owner decision of 4 November 2026). The
 * table sits inside a signal card on the same page as the records table, so its filters stay out of the address
 * (SplitPairsTable); the parameters below are its API's only. The SQL lives in entity-splits.ts.
 */
export const SPLIT_TYPES = { da_ceiling_works: "lucrări", da_ceiling_goods_services: "produse / servicii" } as const;

export function splitColumns(isAuth: boolean): TableColumns {
  return [
    { key: "partener", kind: "pick", label: isAuth ? "Furnizor" : "Autoritate", chip: isAuth ? "furnizor" : "autoritate", param: "partener", valuePattern: /^\d{1,16}$/ },
    { key: "an", kind: "options", label: "An", chip: "anul", param: "an", valuePattern: /^\d{4}$/, order: "newest" },
    { key: "tip", kind: "options", label: "Tip", chip: "", param: "tip", valuePattern: /^da_ceiling_(works|goods_services)$/, labels: SPLIT_TYPES },
    { key: "achizitii", kind: "range", label: "Achiziții", chip: "achiziții", param: "achizitii" },
    { key: "total", kind: "range", label: "Total", chip: "total", param: "total", unit: "lei" },
  ];
}
