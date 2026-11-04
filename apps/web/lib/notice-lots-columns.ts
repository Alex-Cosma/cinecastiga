import type { TableColumns } from "./table-filters/types";

/*
 * The filterable columns of an award notice's records (/anunturi/[caid]; owner decision of 4 November 2026). A large
 * framework has up to ~2,700 records. The SQL lives in notice-lots.ts.
 */
export const LOT_KINDS = {
  contract: "contract",
  calloff: "contract subsecvent",
  framework: "acord-cadru (plafon)",
  amendment: "act adițional",
  review: "tip neclar, de verificat",
} as const;

export const LOT_COLUMNS: TableColumns = [
  { key: "tip", kind: "options", label: "Tip", chip: "", param: "tip", valuePattern: /^(contract|calloff|framework|amendment|review)$/, labels: LOT_KINDS },
  { key: "castigator", kind: "pick", label: "Câștigător", chip: "câștigător", param: "castigator", valuePattern: /^\d{1,16}$/ },
  { key: "data", kind: "dates", label: "Data", chip: "", param: "an" },
  { key: "valoare", kind: "range", label: "Valoare", chip: "valoare", param: "valoare", unit: "lei" },
];
