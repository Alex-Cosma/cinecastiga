import { FLAG_META, flagLabel } from "./flags";
import type { ColumnDef, FilterValue, TableColumns } from "./table-filters/types";

/*
 * The filterable columns of the entity page's records table (owner decision of 4 November 2026: a funnel per column,
 * the old bar above the table gone). Shared by the page, the table and the API; the SQL lives in entity-tx.ts.
 *
 * The record's type is an options column whose values are the table's channels: direct acquisitions, contracts and the
 * direct acquisitions outside the total, which appear only when chosen (they used to be the „Arată excluse” box).
 * The signals column offers what the Semnale column shows: the signals marked on direct acquisitions, a single bidder
 * on a contract, and no signal at all.
 */

export const TX_TYPES = { directe: "achiziții directe", contracte: "contracte", excluse: "excluse din total" } as const;
export type TxType = keyof typeof TX_TYPES;

/** A contract with one reported offer; and a row with no lead in its Semnale column. */
export const SINGLE_BIDDER = "un_ofertant";
export const NO_SIGNAL = "fara";

/** A signal the table can filter rows by: one marked on direct acquisitions, not a yearly or entity-wide pattern. */
export const rowFlag = (code: string): boolean => FLAG_META[code]?.subject === "da" || code === "da_split";

const SIGNAL_LABELS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(Object.keys(FLAG_META).filter(rowFlag).map((code) => [code, flagLabel(code)])),
  [SINGLE_BIDDER]: "1 ofertant",
  [NO_SIGNAL]: "fără semnal",
};

const LEGACY_CHANNEL: Readonly<Record<string, TxType>> = { directe: "directe", contracte: "contracte" };

/** The table's type filter from the addresses before 4 November 2026 (?canal=directe|contracte, ?excluse=1). */
function legacyType(get: (key: string) => string | null): FilterValue | null {
  if (get("excluse") === "1") return { kind: "options", values: ["excluse"] };
  const channel = LEGACY_CHANNEL[get("canal") ?? ""];
  return channel ? { kind: "options", values: [channel] } : null;
}

function columns(isAuth: boolean): TableColumns {
  const partner: ColumnDef = isAuth
    ? { key: "partener", kind: "pick", label: "Furnizor", chip: "furnizor", param: "furnizor", valuePattern: /^\d{1,16}$/ }
    : { key: "partener", kind: "pick", label: "Autoritate", chip: "autoritate", param: "autoritate", valuePattern: /^\d{1,16}$/ };
  return [
    { key: "data", kind: "dates", label: "Data", chip: "", param: "an" },
    { key: "tip", kind: "options", label: "Tip", chip: "", param: "tip", valuePattern: /^(directe|contracte|excluse)$/, labels: TX_TYPES,
      legacy: { params: ["canal", "excluse"], read: legacyType } },
    partner,
    { key: "cpv", kind: "pick", label: "Obiect (CPV)", chip: "CPV", param: "cpv", valuePattern: /^\d{8}-\d$/ },
    { key: "valoare", kind: "range", label: "Valoare", chip: "valoare", param: "valoare", unit: "lei" },
    { key: "semnale", kind: "options", label: "Semnale", chip: "", param: "sem", valuePattern: /^[a-z_]{1,40}$/, labels: SIGNAL_LABELS },
  ];
}

const AUTHORITY_COLUMNS = columns(true);
const SUPPLIER_COLUMNS = columns(false);

/** The columns of an institution's table (partners are its suppliers) or of a firm's (partners are institutions). */
export const txColumns = (isAuth: boolean): TableColumns => (isAuth ? AUTHORITY_COLUMNS : SUPPLIER_COLUMNS);
