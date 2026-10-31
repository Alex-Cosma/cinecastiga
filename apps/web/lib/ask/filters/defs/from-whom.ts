import { TRANSACTION_FORMS } from "../context";
import type { FilterDef } from "../types";
import { alwaysScope, levels, setFilters } from "./shared";
import type { Party } from "./selection";

/*
 * Who sold (plan §2.2 from-whom.ts): a named firm, the firms' size and the
 * firms a person leads today. Employees and the administrator are attributes
 * of the firm (a semi-join on the supplier), applied to the records: today a
 * selection everywhere, the total changes (TODAY_SCOPE).
 */

export interface EmployeesChoice { minEmployees?: number; maxEmployees?: number }
export interface PersonChoice { key: string; name: string }

export const supplier: FilterDef<Party> = {
  id: "supplier", keys: ["filters.supplierName", "filters.supplierId"], placement: "sentence", control: "entitySearch",
  label: "O anumită firmă", detail: "Cine furnizează.",
  windowTitle: "Care firmă?", windowNote: "Caută numele firmei furnizoare sau codul fiscal.",
  // On a distribution the named firm is the one placed among its peers.
  engine: { ...levels(TRANSACTION_FORMS, "row"), distribution: "profile" },
  scope: (form) => form === "distribution" ? "display" : "selection",
  read: (spec) => spec.filters.supplierName || spec.filters.supplierId
    ? { name: String(spec.filters.supplierName ?? ""), ...(spec.filters.supplierId ? { id: Number(spec.filters.supplierId) } : {}) } : undefined,
  write: (spec, value) => setFilters(spec, { supplierName: value?.name, supplierId: value?.id }),
  choices: () => [{ name: "Firma Exemplu SRL", id: 202 }, { name: "Firma Fara Id SRL" }],
};

export const employees: FilterDef<EmployeesChoice> = {
  id: "employees", keys: ["filters.minEmployees", "filters.maxEmployees"], placement: "invite", control: "range",
  label: "Angajați", detail: "Numărul de angajați din bilanț.",
  windowTitle: "Câți angajați au firmele?", windowNote: "Numărul de angajați provine din ultimul bilanț disponibil. Firmele fără bilanț sunt excluse.",
  // employeesCond in rowPredicates: the firm's latest MF filing (marts.entity_profile); on the profiles of firms only
  // "Cine conduce?" on the index takes it (F6c, profilePredicates: the profiles of the firms in the band; a size is the
  // firm's, not the record's), the risk cloud and the distribution still refuse it.
  // On a trend of firms (F2, under trend-2) an attribute of the grouped firm: the groups keep the band and
  // count those without a filing, the selection keeps every firm (trendGrouping in compile.ts). On a ranking
  // of firms (F3, table:employees-2) and on "Cine conduce?" by value, which runs it, the same: the row
  // CÂȘTIGĂTORII narrows the list, the total and „% din total” stay the sentence's (rankedFirmsGroup).
  engine: { ...levels(TRANSACTION_FORMS, "entityAttr"), "entity_card:risk": "profile" },
  scope: (form, spec) => form === "trend" || ((form === "table" || form === "entity_card:value") && spec?.dim === "supplier") ? "group" : "selection",
  read: (spec) => spec.filters.minEmployees !== undefined || spec.filters.maxEmployees !== undefined
    ? {
      ...(spec.filters.minEmployees !== undefined ? { minEmployees: Number(spec.filters.minEmployees) } : {}),
      ...(spec.filters.maxEmployees !== undefined ? { maxEmployees: Number(spec.filters.maxEmployees) } : {}),
    } : undefined,
  write: (spec, value) => setFilters(spec, { minEmployees: value?.minEmployees, maxEmployees: value?.maxEmployees }),
  // The presets "Fără angajați", "Sub 5", "Sub 50", "250 sau mai mulți", and two bounds typed in.
  choices: () => [{ maxEmployees: 0 }, { maxEmployees: 4 }, { maxEmployees: 49 }, { minEmployees: 250 }, { minEmployees: 10, maxEmployees: 49 }],
};

export const admin: FilterDef<PersonChoice> = {
  id: "admin", keys: ["filters.adminPersonKey", "filters.adminName"], placement: "invite", control: "personSearch",
  label: "Administratorul firmelor", detail: "Reprezentanți legali din Registrul Comerțului.",
  windowTitle: "Cine conduce firmele?",
  windowNote: "Reprezentanți legali din Registrul Comerțului. Situația curentă poate diferi de cea de la data achiziției.",
  // The firms the person represents today (adminSupplierIds), refused on profiles.
  engine: levels(TRANSACTION_FORMS, "entityAttr"), scope: alwaysScope("selection"),
  read: (spec) => spec.filters.adminPersonKey || spec.filters.adminName
    ? { key: String(spec.filters.adminPersonKey ?? ""), name: String(spec.filters.adminName ?? "") } : undefined,
  write: (spec, value) => setFilters(spec, { adminPersonKey: value?.key, adminName: value?.name }),
  choices: () => [{ key: "ion exemplu|1970-01-01|cluj-napoca", name: "Ion Exemplu (n. 1970, Cluj-Napoca)" }],
};

export const FROM_WHOM_DEFS = [supplier, employees, admin] as const;
