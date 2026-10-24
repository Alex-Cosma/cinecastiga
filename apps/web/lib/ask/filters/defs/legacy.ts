import type { MinimumRecords, QueryPopulation } from "../../population";
import { TRANSACTION_FORMS } from "../context";
import type { FilterDef } from "../types";
import { alwaysScope, edited, levels, setFilters } from "./shared";

/*
 * Keys the plan stops offering on new questions and keeps applying on old
 * links (plan §1.1, §2.6): the record threshold, the precise selection, a
 * single bidder, the comparison mode of older links. Today the builder still
 * offers the first three ("Mai multe filtre", "Adaugă o condiție").
 */

export const minimumRecords: FilterDef<MinimumRecords> = {
  id: "minimumRecords", keys: ["minimumRecords"], placement: "advanced", control: "minimum",
  label: "Prag de înregistrări",
  // groupPredicates: rows whose institution (or firm) has at least N rows in the
  // filtered selection, counted per entity before the answer groups them. A
  // selection (the total changes). Refused on a trend and on the profiles.
  engine: levels(TRANSACTION_FORMS.filter((form) => form !== "trend"), "group"), scope: alwaysScope("selection"),
  read: (spec) => spec.minimumRecords,
  write: (spec, value) => edited(spec, (next) => { if (value) next.minimumRecords = { ...value }; else delete next.minimumRecords; }),
  // "+ Un prag de înregistrări" inserts firms, 5; then "Cel puțin" (1–1.000.000) and "Scoate pragul" (⋯ › Selecție avansată).
  choices: () => [{ role: "supplier", count: 5 }, { role: "authority", count: 5 }, { role: "supplier", count: 1_000_000 }, undefined],
};

const conditions = (...groups: QueryPopulation["groups"]): QueryPopulation => ({ operator: "and", groups });
export const population: FilterDef<QueryPopulation> = {
  id: "population", keys: ["population"], placement: "advanced", control: "population",
  label: "Selecție precisă",
  // populationSql in rowPredicates, on the record (d.*), also inside a trend's two years; refused on the profiles.
  engine: levels(TRANSACTION_FORMS, "row"), scope: alwaysScope("selection"),
  read: (spec) => spec.population,
  write: (spec, value) => edited(spec, (next) => { if (value) next.population = structuredClone(value); else delete next.population; }),
  // PopulationEditor: date and value bounds, lists of institutions, firms, CPV codes and counties, ȘI/SAU groups.
  choices: () => [
    conditions({ operator: "and", conditions: [{ field: "date", op: "gte", value: "2024-03-01" }] }),
    conditions({ operator: "and", conditions: [{ field: "value", op: "lte", value: "50000.00" }] }),
    conditions({ operator: "and", conditions: [{ field: "authority", op: "in", values: ["101", "103"], labels: ["Comuna Exemplu", "Comuna Alta"] }] }),
    conditions({ operator: "and", conditions: [{ field: "supplier", op: "not_in", values: ["202"], labels: ["Firma Exemplu SRL"] }] }),
    conditions({ operator: "and", conditions: [{ field: "cpv", op: "not_in", values: ["45"] }] }),
    conditions({ operator: "and", conditions: [{ field: "county", op: "in", values: ["Cluj", "Alba"] }] }),
    { operator: "or", groups: [
      { operator: "and", conditions: [{ field: "authority", op: "in", values: ["101"], labels: ["Comuna Exemplu"] }] },
      { operator: "and", conditions: [{ field: "supplier", op: "in", values: ["202"], labels: ["Firma Exemplu SRL"] }] },
    ] },
    undefined,
  ],
};

export const singleBidder: FilterDef<true> = {
  id: "singleBidder", keys: ["filters.singleBidder"], placement: "invite", control: "list",
  label: "O singură ofertă", detail: "Contracte cu informații despre competiție.",
  windowTitle: "Vrei să urmărești competiția?",
  windowNote: "Numărul de oferte e publicat doar pentru o parte a contractelor din proceduri.",
  // is_single_bidder on contract rows; validateSpec and transitionQuestion switch the stream to contracts.
  engine: levels(TRANSACTION_FORMS, "row"), scope: alwaysScope("selection"),
  read: (spec) => spec.filters.singleBidder === true ? true : undefined,
  write: (spec, value) => setFilters(spec, { singleBidder: value }),
  // Old links only (kit G1): "Din link: doar contractele cu o singură ofertă".
  choices: () => [true, undefined],
};

export const comparisonMode: FilterDef<"transactions" | "profiles"> = {
  id: "comparisonMode", keys: ["comparisonMode"], placement: "advanced", control: "none",
  label: "Felul comparației",
  // Accepted from older links and ignored since 24 Oct 2026: a comparison is always on the selection.
  engine: {}, scope: alwaysScope("display"),
  read: (spec) => spec.comparisonMode,
  write: (spec, value) => edited(spec, (next) => { if (value) next.comparisonMode = value; else delete next.comparisonMode; }),
  choices: () => [],
};

export const LEGACY_DEFS: readonly FilterDef[] = [minimumRecords, population, singleBidder, comparisonMode];
