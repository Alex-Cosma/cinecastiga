import { COUNTRY_RO, PROCEDURE_RO, TED_COUNTRY_REVIEW_LABEL, TED_COUNTRY_UNRESOLVED, TED_LABEL } from "./ted-labels";
import type { FilterValue, TableColumns } from "./table-filters/types";

/*
 * The filterable columns of /supra-prag's award table (owner decision of 4 November 2026: column funnels, the link bar
 * above the table gone). The winners' country funnel starts with „marcate «străin»”, the old „Marcate străin” link,
 * and „Țară de verificat”; the offers funnel holds the old „Ofertant unic”. The SQL lives in ted-awards.ts.
 */

export const FOREIGN = "strain";
export const OFFERS = { unu: "o singură ofertă", mai_multe: "mai multe oferte", necunoscut: "număr necunoscut" } as const;

/** The table's filters from the addresses before 4 November 2026: ?extern=1, ?tara=DE, ?unic=1, ?etichetă=ted-only. */
const legacyCountry = (get: (key: string) => string | null): FilterValue | null => {
  const country = get("tara");
  if (country) return { kind: "options", values: [country] };
  return get("extern") === "1" ? { kind: "options", values: [FOREIGN] } : null;
};

export const TED_COLUMNS: TableColumns = [
  { key: "autoritate", kind: "pick", label: "Autoritate", chip: "autoritate", param: "autoritate", valuePattern: /^\d{1,16}$/ },
  { key: "castigator", kind: "pick", label: "Câștigător", chip: "câștigător", param: "castigator", valuePattern: /^\d{1,16}$/ },
  { key: "tara", kind: "options", label: "Țara câștigătorului", chip: "", param: "tara", valuePattern: /^([A-Z]{2,3}|strain|neclar)$/,
    labels: { [FOREIGN]: "marcate „străin”", [TED_COUNTRY_UNRESOLVED]: TED_COUNTRY_REVIEW_LABEL, ...COUNTRY_RO },
    legacy: { params: ["extern"], read: legacyCountry } },
  { key: "cpv", kind: "pick", label: "Obiect (CPV)", chip: "CPV", param: "cpv", valuePattern: /^\d{8}-\d$/ },
  { key: "potrivire", kind: "options", label: "Potrivire SEAP", chip: "", param: "potrivire", valuePattern: /^(also-in-seap|ted-only|possible-match)$/,
    labels: Object.fromEntries(Object.entries(TED_LABEL).map(([k, v]) => [k, v.title])),
    legacy: { params: ["etichetă"], read: (get) => { const v = get("etichetă"); return v ? { kind: "options", values: [v] } : null; } } },
  { key: "oferte", kind: "options", label: "Oferte", chip: "", param: "oferte", valuePattern: /^(unu|mai_multe|necunoscut)$/, labels: OFFERS,
    legacy: { params: ["unic"], read: (get) => (get("unic") === "1" ? { kind: "options", values: ["unu"] } : null) } },
  { key: "procedura", kind: "options", label: "Procedură", chip: "", param: "procedura", valuePattern: /^[\w .,-]{1,60}$/, labels: PROCEDURE_RO },
  { key: "valoare", kind: "range", label: "Valoare RON", chip: "valoare", param: "valoare", unit: "lei" },
];
