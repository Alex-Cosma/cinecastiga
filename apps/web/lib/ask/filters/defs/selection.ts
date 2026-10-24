import { COUNTIES } from "../../../counties";
import { AUTHORITY_KINDS, type AuthorityKind } from "../../spec";
import { PROFILE_FORMS, TRANSACTION_FORMS } from "../context";
import type { FilterDef, FilterSpec } from "../types";
import { alwaysScope, edited, levels, readAhead, setFilters } from "./shared";

/*
 * What is counted: the data stream, the domain, who bought, where and when
 * (plan §2.2 selection.ts). Today's words and pickers are QuestionBuilder's
 * (FIELDS, the "Adaugă o condiție" list); write() repeats its side effects.
 */

/** A named entity as a picker hands it over: the name, and the exact id of a search hit. */
export interface Party { name: string; id?: number }
/** A locality: the place picker removes the county, the "Localitatea" picker sets the UAT's own. */
export interface LocalityChoice { siruta: number; name: string; county?: string }
export interface PeriodChoice { yearFrom?: number; yearTo?: number; monthFrom?: number; monthTo?: number }

export const dataset: FilterDef<"all" | "da" | "contracts"> = {
  id: "dataset", keys: ["dataset"], placement: "under", control: "list",
  label: "Canalul achizițiilor",
  windowTitle: "Ce achiziții includem?", windowNote: "Contractele din proceduri și achizițiile directe sunt surse distincte.",
  // Profiles have only direct acquisitions: all and da give the same profile, contracts is refused.
  engine: levels(TRANSACTION_FORMS, "row"), scope: alwaysScope("selection"),
  read: (spec) => spec.dataset as "all" | "da" | "contracts" | undefined,
  write: (spec, value) => edited(spec, (next) => {
    next.dataset = value ?? "all";
    // chooseValue: "un singur ofertant" exists only on the contracts stream.
    if (value !== "contracts") delete next.filters.singleBidder;
  }),
  choices: () => ["all", "contracts", "da"],
};

export const cpvTerm: FilterDef<string> = {
  id: "cpvTerm", keys: ["filters.cpvTerm"], placement: "under", control: "domainSearch",
  label: "Domeniul achiziției", detail: "Medicamente, asfaltare, mobilier…",
  windowTitle: "Ce fel de achiziții?", windowNote: "Scrie un domeniu, un produs sau un cod CPV: medicamente, asfaltare, mobilier…",
  engine: levels(TRANSACTION_FORMS, "row"), scope: alwaysScope("selection"),
  read: (spec) => spec.filters.cpvTerm as string | undefined,
  write: (spec, value) => setFilters(spec, { cpvTerm: value }),
  // A search: suggested terms, CPV divisions or the words typed.
  choices: () => ["medicamente", "33600000", "45"],
};

export const authority: FilterDef<Party> = {
  id: "authority", keys: ["filters.authorityName", "filters.authorityId"], placement: "sentence", control: "entitySearch",
  label: "O anumită instituție", detail: "Cine cumpără.",
  windowTitle: "Care instituție?", windowNote: "Caută numele instituției cumpărătoare.",
  // On a distribution the named entity is the one placed among its peers, not a condition on them.
  engine: { ...levels(TRANSACTION_FORMS, "row"), distribution: "profile" },
  scope: (form) => form === "distribution" ? "display" : "selection",
  read: (spec) => spec.filters.authorityName || spec.filters.authorityId
    ? { name: String(spec.filters.authorityName ?? ""), ...(spec.filters.authorityId ? { id: Number(spec.filters.authorityId) } : {}) } : undefined,
  write: (spec, value) => setFilters(spec, { authorityName: value?.name, authorityId: value?.id }),
  choices: () => [{ name: "Comuna Exemplu", id: 101 }, { name: "Spitalul Exemplu" }],
};

export const authorityKind: FilterDef<AuthorityKind> = {
  id: "authorityKind", keys: ["filters.authorityKind"], placement: "sentence", control: "list",
  label: "Tipul instituției", detail: "Comune, spitale, școli și altele.",
  windowTitle: "Ce instituții te interesează?", windowNote: "Poți privi toate instituțiile sau un singur tip.",
  // A name pattern on the buyer (KIND_PATTERNS); on profiles, on an authority's own name only.
  engine: { ...levels(TRANSACTION_FORMS, "row"), ...levels(PROFILE_FORMS, "profile") }, scope: alwaysScope("selection"),
  read: (spec) => spec.filters.authorityKind as AuthorityKind | undefined,
  write: (spec, value) => setFilters(spec, { authorityKind: value }),
  choices: () => [undefined, ...AUTHORITY_KINDS],
};

export const county: FilterDef<string> = {
  id: "county", keys: ["filters.county"], placement: "sentence", control: "placeSearch",
  label: "Județul", detail: "Unde se află instituția cumpărătoare.",
  // On firm profiles the note says "Contează sediul firmei. Alege un județ." (countyIsFirmSeat).
  windowTitle: "Unde?", windowNote: "Contează sediul instituției care cumpără. Alege un județ sau, unde se poate, o localitate.",
  // The buyer's county on a record; the entity's own on a profile (a firm's seat on firm profiles).
  engine: { ...levels(TRANSACTION_FORMS, "row"), ...levels(PROFILE_FORMS, "profile") }, scope: alwaysScope("selection"),
  read: (spec) => spec.filters.county as string | undefined,
  write: (spec, value) => edited(setFilters(spec, { county: value }), (next) => {
    // updateFilter: another county removes the locality.
    if (value !== spec.filters.county) { delete next.filters.uatSiruta; delete next.filters.uatName; }
  }),
  choices: () => [undefined, ...COUNTIES],
};

/** localityScopeSupport: the transaction questions that can be scoped to one town hall. */
const LOCALITY_FORMS = TRANSACTION_FORMS.filter((form) => !["map", "compare", "network", "sankey", "fact_check"].includes(form));
export const locality: FilterDef<LocalityChoice> = {
  id: "locality", keys: ["filters.uatSiruta", "filters.uatName"], placement: "invite", control: "localitySearch",
  label: "Localitatea", detail: "Primăria și consiliul local ale unei localități.",
  windowTitle: "Ce localitate te interesează?",
  windowNote: "Include doar primăria și consiliul local ale localității. Școlile, spitalele și alte instituții din localitate sunt separate.",
  // The UAT's own administration (strict SIRUTA links), never on a county ranking (refused there).
  engine: levels(LOCALITY_FORMS, "row"), scope: alwaysScope("selection"),
  read: (spec) => spec.filters.uatSiruta
    ? { siruta: Number(spec.filters.uatSiruta), name: String(spec.filters.uatName ?? "") } : undefined,
  write: (spec, value) => setFilters(spec, value
    ? { uatSiruta: value.siruta, uatName: value.name, county: value.county }
    : { uatSiruta: undefined, uatName: undefined }),
  choices: () => [
    { siruta: 54975, name: "Municipiul Cluj-Napoca (Cluj)", county: "Cluj" },
    { siruta: 54975, name: "Municipiul Cluj-Napoca (Cluj)" },
  ],
};

export const period: FilterDef<PeriodChoice> = {
  id: "period", keys: ["filters.yearFrom", "filters.yearTo", "filters.monthFrom", "filters.monthTo"], placement: "sentence", control: "period",
  label: "Perioada",
  windowTitle: "În ce perioadă?", windowNote: "Poți alege și lunile, pentru o verificare mai precisă.",
  // On a trend: the two years compared (months are refused there).
  engine: levels(TRANSACTION_FORMS, "row"), scope: alwaysScope("selection"),
  read: (spec) => {
    const f = spec.filters;
    if (!f.yearFrom && !f.yearTo && !f.monthFrom && !f.monthTo) return undefined;
    const value: PeriodChoice = {};
    for (const key of ["yearFrom", "yearTo", "monthFrom", "monthTo"] as const) if (f[key]) value[key] = Number(f[key]);
    return value;
  },
  // submitBounds: the four keys together, an empty one removed.
  write: (spec, value) => setFilters(spec, { yearFrom: value?.yearFrom, yearTo: value?.yearTo, monthFrom: value?.monthFrom, monthTo: value?.monthTo }),
  choices: (spec, ctx) => {
    const y = ctx.year;
    // Trend: three consecutive pairs and two years typed in; no "Toată perioada", no months.
    if (spec.block === "trend") return [{ yearFrom: y - 1, yearTo: y }, { yearFrom: y - 2, yearTo: y - 1 }, { yearFrom: y - 3, yearTo: y - 2 }, { yearFrom: y - 4, yearTo: y - 1 }];
    return [
      { yearFrom: y, yearTo: y }, { yearFrom: y - 1, yearTo: y - 1 }, { yearFrom: y - 2, yearTo: y - 2 }, undefined,
      { yearFrom: y - 3, yearTo: y - 1 }, { yearFrom: y - 2 }, { yearTo: y - 1 }, { yearFrom: y - 1, yearTo: y - 1, monthFrom: 3, monthTo: 6 },
    ];
  },
};

export const purchaseKind = readAhead<string>({
  id: "purchaseKind", keys: ["filters.purchaseKind"], placement: "sentence", control: "segmented",
  label: "Ce fel de achiziții", windowTitle: "Ce fel de achiziții?", scope: "selection",
  sample: { block: "stat", value: "lucrari" },
});

export const procedure = readAhead<string>({
  id: "procedure", keys: ["filters.procedure"], placement: "sentence", control: "list",
  label: "Procedura", windowTitle: "Ce fel de achiziții?", scope: "selection",
  sample: { block: "stat", value: "deschisa", base: { dataset: "contracts" } },
});

export const SELECTION_DEFS = [dataset, cpvTerm, authority, authorityKind, county, locality, period, purchaseKind, procedure] as const;
