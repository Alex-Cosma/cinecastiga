import { BLOCK_FILTERS, populationFits } from "./blocks";
import { filterContext } from "./context";
import { FILTERS } from "./defs";
import type { Party } from "./defs/selection";
import { edited } from "./defs/shared";
import { isDaBoundPopulation } from "./origin";
import { presentationTokens, sentenceTokens } from "./sentence";
import { employeesOnBands } from "./words";
import type { Availability, BlockFilters, FilterCtx, FilterId, FilterSpec, Placement, Slot, SpecPath } from "./types";

export { FILTER_DEFS, FILTERS } from "./defs";
/** A table of offers: BLOCK_FILTERS (F1b), or another table a test walks. */
export type OfferTable = Record<string, BlockFilters | undefined>;

/**
 * The owner of every path of AskSpec (R2: one key, one control). Listed
 * here, not derived, so the compiler fails on a path added to spec.ts without
 * an owner; registry.test.ts checks it against each FilterDef's keys and
 * against what parseSpec reads (IMPLEMENTED_KEYS and READ_AHEAD_KEYS).
 * `block` is the question itself: BLOCK_FILTERS is keyed by it.
 */
export const SPEC_PATH_OWNERS: { readonly [P in SpecPath]: FilterId | "question" } = {
  block: "question", dataset: "dataset", dim: "dim", measure: "measure", topN: "topN", rankBy: "rankBy",
  population: "population", comparisonMode: "comparisonMode", minimumRecords: "minimumRecords",
  "filters.cpvTerm": "cpvTerm", "filters.county": "county", "filters.authorityKind": "authorityKind",
  "filters.authorityName": "authority", "filters.authorityId": "authority",
  "filters.supplierName": "supplier", "filters.supplierId": "supplier",
  "filters.monthFrom": "period", "filters.monthTo": "period", "filters.yearFrom": "period", "filters.yearTo": "period",
  "filters.adminPersonKey": "admin", "filters.adminName": "admin",
  "filters.compareWith": "compareWith", "filters.compareWithId": "compareWith",
  "filters.uatSiruta": "locality", "filters.uatName": "locality",
  "filters.singleBidder": "singleBidder", "filters.minEmployees": "employees", "filters.maxEmployees": "employees",
  "filters.purchaseKind": "purchaseKind", "filters.procedure": "procedure",
  "filters.purchaseValueMin": "purchaseValue", "filters.purchaseValueMax": "purchaseValue",
  "filters.firmSeat": "firmSeat", "filters.seatCounty": "seatCounty", "filters.sharedPartners": "sharedPartners",
  "filters.newSince": "newSince", "filters.newScope": "newSince",
  "filters.mainClient": "mainClient", "filters.dominantSupplier": "dominantSupplier",
  "trend.change": "trendChange", "trend.months": "trendMonths", "trend.order": "trendOrder",
  "trend.minBase": "trendMinBase", "trend.firstOnly": "trendFirstOnly",
  "timeseries.grain": "timeseriesGrain", "timeseries.split": "timeseriesSplit", "timeseries.months": "timeseriesMonths",
  "network.partners": "networkPartners", "network.since": "networkSince", "network.order": "networkOrder",
  "network.show": "networkShow", "network.signals": "networkSignals",
  "sankey.shown": "sankeyShown", "scatter.flag": "scatterFlag", "scatter.rankBy": "scatterRankBy", "map.lens": "mapLens",
  "peers.similar": "peers", "peers.activity": "peers", "peers.domain": "peersDomain",
};

/** Every control of a question on this spec, with its place. */
export function placedSlots(spec: FilterSpec, ctx: FilterCtx = filterContext(spec), table: OfferTable = BLOCK_FILTERS): { placement: Placement; slot: Slot }[] {
  const entry = table[ctx.block];
  if (!entry) return [];
  return [
    ...entry.sentence(spec, ctx).map((slot) => ({ placement: "sentence" as const, slot })),
    ...entry.invites(spec, ctx).map((slot) => ({ placement: "invite" as const, slot })),
    ...entry.rows(spec, ctx).flatMap((row) => row.chips.map((slot) => ({ placement: "row" as const, slot }))),
    ...entry.under(spec, ctx).map((slot) => ({ placement: "under" as const, slot })),
    ...entry.presentation(spec, ctx).map((slot) => ({ placement: "presentation" as const, slot })),
    ...entry.strip.map((id) => ({ placement: "strip" as const, slot: { id } })),
    ...entry.advanced(spec, ctx).map((slot) => ({ placement: "advanced" as const, slot })),
  ];
}

/** The filters a reader can set on this spec, through any control. */
export function offeredFilters(spec: FilterSpec, ctx: FilterCtx = filterContext(spec), table: OfferTable = BLOCK_FILTERS): Set<FilterId> {
  const ids = new Set<FilterId>();
  for (const { slot } of placedSlots(spec, ctx, table)) {
    ids.add(slot.id);
    for (const id of slot.writes ?? []) ids.add(id);
  }
  return ids;
}

/** The value a condition holds, or nothing: the default stream is no condition. */
export const conditionSet = (spec: FilterSpec, id: FilterId): boolean =>
  id === "dataset" ? spec.dataset !== undefined && spec.dataset !== "all" : FILTERS[id].read(spec) !== undefined;

/**
 * The conditions this question shows as its own (BLOCK_FILTERS): what its
 * sentence and presentation line say, the set chips of its rows, strip and P4,
 * and a precise selection or record threshold its "Selecție avansată" offers
 * (P9 with the counted role and the question's fields). A town hall implies its county. A profile reads
 * every stream as its archive and the home page's direct-acquisition ceiling
 * is the engine's own, so both are shown by the question itself (the profile
 * line, the answer). Anything else a spec carries is a chip under the
 * sentence (legacyConditions).
 */
export function visibleFilters(spec: FilterSpec, ctx: FilterCtx = filterContext(spec)): Set<FilterId> {
  const entry = BLOCK_FILTERS[ctx.block];
  const ids = new Set<FilterId>();
  if (!entry) return ids;
  // A fixed phrase says its condition too ("prima dată" on a trend's new ones, set beside the answer).
  for (const token of [...sentenceTokens(spec, ctx), ...presentationTokens(spec)])
    if (token.kind !== "text") for (const id of token.says) ids.add(id);
  // A chip of employees shows the kit's bands only; an old link's range stays its own chip (kit §5.5).
  for (const row of entry.rows(spec, ctx)) for (const chip of row.chips)
    if (conditionSet(spec, chip.id) && (chip.id !== "employees" || employeesOnBands(spec.filters.minEmployees, spec.filters.maxEmployees))) ids.add(chip.id);
  for (const id of entry.strip) if (conditionSet(spec, id)) ids.add(id);
  // The question's own chips under the sentence (the trend's "Aceleași luni"), drawn or not by the year's state.
  for (const slot of entry.under(spec, ctx)) if (conditionSet(spec, slot.id)) ids.add(slot.id);
  for (const slot of entry.advanced(spec, ctx))
    if (conditionSet(spec, slot.id) && (!slot.choices || slot.choices.some((value) => sameValue(value, FILTERS[slot.id].read(spec), slot.id)))
      && (slot.id !== "population" || populationFits(spec.population, entry.advancedFields(spec, ctx)))) ids.add(slot.id);
  if (ids.has("locality")) ids.add("county");
  if (ctx.profile && spec.dataset !== "contracts") ids.add("dataset");
  if (isDaBoundPopulation(spec)) ids.add("population");
  return ids;
}
/** A place's values against the spec's: a record threshold by its role (P9 counts one role, any number). */
const sameValue = (choice: unknown, value: unknown, id: FilterId) =>
  id === "minimumRecords" ? (choice as { role?: string } | undefined)?.role === (value as { role?: string } | undefined)?.role : choice === value;

/**
 * The focal picker (pickEntity on `focal`): the entity of either role; it
 * removes the other role, sets the dimension to the role and, when the role
 * changes, the second entity of a comparison.
 */
export function writeFocal(spec: FilterSpec, role: "authority" | "supplier", party: Party): FilterSpec {
  const before = filterContext(spec).role;
  return edited(spec, (next) => {
    const other = role === "authority" ? "supplier" : "authority";
    next.filters[`${role}Name`] = party.name;
    delete next.filters[`${role}Id`];
    if (party.id) next.filters[`${role}Id`] = party.id;
    delete next.filters[`${other}Name`];
    delete next.filters[`${other}Id`];
    next.dim = role;
    if (role !== before) { delete next.filters.compareWith; delete next.filters.compareWithId; }
  });
}

/**
 * Whether a question offers a filter (plan §2.2 Availability): offered when a
 * control of BLOCK_FILTERS writes it, else hidden (R1: what cannot apply is
 * not drawn). A value its window shows unusable is per choice
 * (pickers.ts choiceState).
 */
export function availability(id: FilterId, spec: FilterSpec, ctx: FilterCtx = filterContext(spec)): Availability {
  return offeredFilters(spec, ctx).has(id) ? { state: "offered" } : { state: "hidden" };
}

const BLOCK_OPTIONS = ["trend", "timeseries", "network", "sankey", "scatter", "peers"] as const;
/** The paths a spec carries (an empty filter value is no condition, as in parseSpec). */
export function presentPaths(spec: FilterSpec): SpecPath[] {
  const paths: string[] = [];
  for (const [key, value] of Object.entries(spec)) {
    if (value === undefined || key === "block") continue;
    if (key === "filters") {
      for (const [sub, v] of Object.entries(value as Record<string, unknown>)) if (v !== undefined && v !== null && v !== "") paths.push(`filters.${sub}`);
    } else if ((BLOCK_OPTIONS as readonly string[]).includes(key)) {
      for (const [sub, v] of Object.entries(value as Record<string, unknown>)) if (v !== undefined) paths.push(`${key}.${sub}`);
    } else paths.push(key);
  }
  return paths as SpecPath[];
}

/**
 * The conditions a spec carries that its question does not offer (plan §2.6):
 * `applied` when the engine applies them there (the "Din link" chip or an
 * origin label of legacyConditions), else accepted and ignored.
 */
export function unofferedPaths(spec: FilterSpec, ctx: FilterCtx = filterContext(spec), table: OfferTable = BLOCK_FILTERS): { path: SpecPath; owner: FilterId; applied: boolean }[] {
  const offered = offeredFilters(spec, ctx, table);
  const out: { path: SpecPath; owner: FilterId; applied: boolean }[] = [];
  for (const path of presentPaths(spec)) {
    const owner = SPEC_PATH_OWNERS[path];
    if (owner === "question" || owner === undefined || offered.has(owner)) continue;
    out.push({ path, owner, applied: FILTERS[owner].engine[ctx.form] !== undefined });
  }
  return out;
}
