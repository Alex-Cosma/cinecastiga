import { flagLabel } from "./flags";
import type { ColumnDef, TableColumns } from "./table-filters/types";
import type { Role } from "./marts";

/*
 * The column filters of /semnale (owner, 20 November 2026: both lists get a funnel on each column, over every row of
 * the list, not the page shown). Shared by the address (signals-shared.ts reads and writes them), the screen (the
 * funnels and their chips) and the server (signals.ts binds them to SQL). A pattern's list has the columns its rows
 * show: the partner only where the row names one, the year only for yearly patterns, the measure only where the row's
 * number is comparable across rows (a multiple, lei, a share, days).
 */

/** The number a pattern's row shows on its right, as a funnel: its words, its unit. Null where there is none. */
export interface SignalMeasure { label: string; unit: string }
export const SIGNAL_MEASURES: Readonly<Record<string, SignalMeasure>> = {
  da_split: { label: "Față de plafon", unit: "× plafonul" },
  da_round: { label: "Sub plafon", unit: "lei" },
  da_above_ceiling: { label: "Peste plafon", unit: "lei" },
  da_year_end: { label: "Decembrie", unit: "% din an" },
  da_concentration: { label: "Ponderea ei", unit: "%" },
  da_dependence: { label: "Ponderea lui", unit: "%" },
  da_capacity: { label: "Față de cifra de afaceri", unit: "×" },
  da_first_month: { label: "Prima achiziție", unit: "zile" },
  da_first_month_buyer: { label: "Prima achiziție", unit: "zile" },
};

/** Patterns counted over the whole period (`all`), with no year to filter. */
const WHOLE_PERIOD = new Set(["award_concentration", "award_dependence", "da_concentration", "da_dependence", "fin_public_reliance", "net_shared_admin"]);

/** The partner's words in a pattern's list (signal-list-words.ts signalListHeads), or null when the row names none. */
export function signalPartnerLabel(code: string, role: Role): string | null {
  if (code.startsWith("award_")) return null;
  const other = role === "authority" ? "Firma" : "Instituția";
  const partner: Record<string, string> = {
    da_split: other, da_round: other, da_above_ceiling: other, da_concentration: "Firma principală", da_dependence: "Clientul public principal",
    da_first_month: "Instituția", da_first_month_buyer: "Firma", net_shared_admin: "Instituția",
  };
  return partner[code] ?? null;
}

const pick = (key: string, label: string, chip: string): ColumnDef => ({ key, kind: "pick", label, chip, param: key, valuePattern: /^\d{1,19}$/, counts: true });

/** The cases of one pattern: the entity, its partner, the year, the row's number, the value. */
export function signalCaseColumns(code: string, role: Role): TableColumns {
  const entity = code.startsWith("award_") || role === "authority" ? "Instituția" : "Firma";
  const partner = signalPartnerLabel(code, role);
  const measure = SIGNAL_MEASURES[code];
  return [
    pick("cine", entity, entity === "Firma" ? "firma" : "instituția"),
    ...(partner ? [pick("partener", partner, partner.toLowerCase())] : []),
    ...(WHOLE_PERIOD.has(code) ? [] : [{ key: "an", kind: "options", label: "Anul", chip: "anul", param: "an", valuePattern: /^\d{4}$/, order: "newest" } satisfies ColumnDef]),
    ...(measure ? [{ key: "masura", kind: "range", label: measure.label, chip: measure.label.toLowerCase(), param: "masura", unit: measure.unit } satisfies ColumnDef] : []),
    { key: "valoare", kind: "range", label: code.startsWith("award_") ? "Valoare" : "Valoare înregistrată", chip: "valoarea", param: "valoare", unit: "lei" },
  ];
}

/** The ranking by risk: the profile, its patterns, its direct acquisitions, its value, its score. */
export function signalRiskColumns(role: Role, criteria: readonly string[]): TableColumns {
  const entity = role === "authority" ? "Instituția" : "Firma";
  return [
    pick("nume", entity, entity === "Firma" ? "firma" : "instituția"),
    { key: "tipare", kind: "options", label: "Tipare", chip: "", param: "tipare", valuePattern: /^[a-z_]{3,40}$/,
      labels: Object.fromEntries(criteria.map((code) => [code, flagLabel(code)])) },
    { key: "achizitii", kind: "range", label: "Achiziții directe", chip: "achiziții directe", param: "achizitii" },
    { key: "valoare", kind: "range", label: "Valoare", chip: "valoarea", param: "valoare", unit: "lei" },
    { key: "risc", kind: "range", label: "Scor", chip: "scorul", param: "risc" },
  ];
}
