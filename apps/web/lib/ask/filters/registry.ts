import { BLOCK_FILTERS } from "./blocks";
import { filterContext } from "./context";
import { COMPARE_DEFS } from "./defs/compare";
import { EXCLUDE_DEFS } from "./defs/exclude";
import { FROM_WHOM_DEFS } from "./defs/from-whom";
import { LEGACY_DEFS } from "./defs/legacy";
import { NETWORK_DEFS } from "./defs/network";
import { PROFILE_DEFS } from "./defs/profile";
import { RANKING_DEFS } from "./defs/ranking";
import { SANKEY_DEFS } from "./defs/sankey";
import { SEAT_DEFS } from "./defs/seat";
import { SELECTION_DEFS, type Party } from "./defs/selection";
import { edited } from "./defs/shared";
import { TIMESERIES_DEFS } from "./defs/timeseries";
import { TREND_DEFS } from "./defs/trend";
import { refusalOf } from "./today";
import type { Availability, FilterCtx, FilterDef, FilterId, FilterSpec, Placement, Slot, SpecPath } from "./types";

export const FILTER_DEFS: readonly FilterDef[] = [
  ...SELECTION_DEFS, ...FROM_WHOM_DEFS, ...SEAT_DEFS, ...RANKING_DEFS, ...PROFILE_DEFS, ...TREND_DEFS,
  ...TIMESERIES_DEFS, ...NETWORK_DEFS, ...SANKEY_DEFS, ...COMPARE_DEFS, ...EXCLUDE_DEFS, ...LEGACY_DEFS,
];
export const FILTERS = Object.fromEntries(FILTER_DEFS.map((def) => [def.id, def])) as Record<FilterId, FilterDef>;

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
  "sankey.shown": "sankeyShown", "scatter.flag": "scatterFlag", "scatter.rankBy": "scatterRankBy",
  "peers.similar": "peers", "peers.activity": "peers", "peers.domain": "peers",
};

/** Every control of a question on this spec, with its place. */
export function placedSlots(spec: FilterSpec, ctx: FilterCtx = filterContext(spec)): { placement: Placement; slot: Slot }[] {
  const entry = BLOCK_FILTERS[ctx.block];
  if (!entry) return [];
  return [
    ...entry.sentence(spec, ctx).map((slot) => ({ placement: "sentence" as const, slot })),
    ...entry.invites(spec, ctx).map((slot) => ({ placement: "invite" as const, slot })),
    ...entry.under(spec, ctx).map((slot) => ({ placement: "under" as const, slot })),
    ...entry.presentation(spec, ctx).map((slot) => ({ placement: "presentation" as const, slot })),
    ...entry.advanced(spec, ctx).map((id) => ({ placement: "advanced" as const, slot: { id } })),
  ];
}

/** The filters a reader can set on this spec, through any control. */
export function offeredFilters(spec: FilterSpec, ctx: FilterCtx = filterContext(spec)): Set<FilterId> {
  const ids = new Set<FilterId>();
  for (const { slot } of placedSlots(spec, ctx)) {
    ids.add(slot.id);
    for (const id of slot.writes ?? []) ids.add(id);
  }
  return ids;
}

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
 * Whether a question offers a filter (plan §2.2 Availability). Today a filter
 * is offered when any control writes it; it is "refused" when one of the
 * values its control offers makes the engine refuse the question
 * (TODAY_REFUSALS of kind "engine"), which F1b removes.
 */
export function availability(id: FilterId, spec: FilterSpec, ctx: FilterCtx = filterContext(spec)): Availability {
  if (!offeredFilters(spec, ctx).has(id)) return { state: "hidden" };
  const def = FILTERS[id];
  const values = def.choices(spec, ctx);
  const refused = values.map((value) => refusalOf(id, value, spec, ctx)).filter((r) => r !== null && r.kind === "engine");
  if (!refused.length) return { state: "offered" };
  return { state: "refused", reason: refused[0]!.reason, refusal: refused[0]!.id, ...(refused.length < values.length ? { partial: true as const } : {}) };
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
export function unofferedPaths(spec: FilterSpec, ctx: FilterCtx = filterContext(spec)): { path: SpecPath; owner: FilterId; applied: boolean }[] {
  const offered = offeredFilters(spec, ctx);
  const out: { path: SpecPath; owner: FilterId; applied: boolean }[] = [];
  for (const path of presentPaths(spec)) {
    const owner = SPEC_PATH_OWNERS[path];
    if (owner === "question" || owner === undefined || offered.has(owner)) continue;
    out.push({ path, owner, applied: FILTERS[owner].engine[ctx.form] !== undefined });
  }
  return out;
}
