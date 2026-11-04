import type { TableColumns } from "./table-filters/types";

/*
 * The filterable columns of the radiography's supplier table (owner decision of 4 November 2026: column funnels, the
 * search box above the table gone). One row per supplier, so its funnel lists names without counts, the largest
 * suppliers first. The SQL lives in radiografie.ts.
 */
export const RADIOGRAFIE_COLUMNS: TableColumns = [
  { key: "furnizor", kind: "pick", label: "Furnizor", chip: "furnizor", param: "furnizor", valuePattern: /^\d{1,16}$/, counts: false },
  { key: "valoare", kind: "range", label: "Valoare", chip: "valoare", param: "valoare", unit: "lei" },
  { key: "inregistrari", kind: "range", label: "Înregistrări", chip: "înregistrări", param: "inregistrari" },
];
