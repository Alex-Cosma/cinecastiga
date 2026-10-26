import type { Block } from "../spec";
import { FILTERS } from "./defs";
import { splitExcluded } from "./origin";
import { offersKind, presentationTokens, sentenceSlots, sentenceTokens, type SentenceSlot } from "./sentence";
import type { AdvancedField, BlockFilters, ConditionRow, FilterCtx, FilterId, FilterSpec, Picker, Slot } from "./types";

/*
 * BLOCK_FILTERS (plan §2.2, §4, §5 F1b): what each of the 13 questions offers,
 * in which place, with today's keys only. The builder renders from it
 * (app/intreaba/builder/view.ts). registry.test.ts walks every offer and
 * every pair of offers against the engine (R1).
 *
 * - P1 is the sentence (sentence.ts): one slot per editable phrase.
 * - P2 are the fragments the sentence does not show yet, named (kit §4), in
 *   its order, at most four: an invitation becomes its phrase once set.
 * - P3b, the partners of the network and the flow ("Furnizorii",
 *   "Clienții"): a selection, the total changes. P3a, a group row, only where
 *   the answer's version moved its key to the group: the employees of a
 *   ranking of firms ("Câștigătorii": trend-2, table:employees-2 in F3, and
 *   "Cine conduce?" by value); elsewhere the engine still applies every key on
 *   the records (plan §2.1, §12.14).
 * - P4 the chips the question owns: the trend's "Aceleași luni" (F2).
 * - P5 the presentation line (table, trend); P6 the controls beside the answer
 *   that write a key (the trend's groups and "Prima dată", F2); P9 "⋯ ›
 *   Selecție avansată" (plan §1.1 variant A).
 *
 * Nothing generic is under a question any more (R3, G1): no "Adaugă o
 * condiție", no "Mai multe filtre", no record threshold or single bidder. A
 * link's conditions the question does not show are chips under the sentence
 * (legacyConditions), applied or refused with their reason.
 */

const slot = (id: FilterId, extra: Omit<Slot, "id"> = {}): Slot => ({ id, ...extra });

/** The names of the places outside the sentence (kit §4) and the windows they open (R10, the phrase's own). */
const PLACES = {
  cpvTerm: ["Ce s-a cumpărat", "Ce s-a cumpărat?"],
  buyer: ["Cine a cumpărat", "Cine a cumpărat?"],
  from: ["De la cine", "De la cine?"],
  dataset: ["Ce fel de achiziții", "Ce fel de achiziții?"],
  seat: ["Sediul firmei", "Unde au sediul firmele?"],
  place: ["Unde", "Unde?"],
  employees: ["Angajați", "Câți angajați au firmele?"],
  admin: ["Administrator", "Cine conduce firmele?"],
  clientCounty: ["Județul instituției", "Unde?"],
  clientKind: ["Tipul instituției", "Cine a cumpărat?"],
  advanced: ["Selecție avansată", "Selecție avansată"],
  months: ["Aceleași luni", "Ce luni compari?"],
  size: ["Mărimea achiziției", "Cât de mare e fiecare achiziție?"],
} as const satisfies Record<string, readonly [string, string]>;
type Place = keyof typeof PLACES;

const placed = (id: FilterId, name: Place, extra: Omit<Slot, "id" | "label" | "window"> = {}): Slot =>
  slot(id, { ...extra, label: PLACES[name][0], window: PLACES[name][1] });

/** "+ Cine a cumpărat": every institution, a kind, one institution or a town hall, and their place where the sentence hides it too. */
const buyerInvite = (ctx: FilterCtx, opts: { authority?: boolean; locality?: boolean; county?: boolean } = {}): Slot => placed("authorityKind", "buyer", {
  picker: "buyer",
  writes: [
    ...(opts.authority !== false ? ["authority" as const] : []),
    ...(opts.locality !== false && ctx.locality.ok ? ["locality" as const] : []),
    ...(opts.county !== false ? ["county" as const] : []),
  ],
});
/** "+ De la cine": its tabs on this question (kit §5.24). */
const fromInvite = (tabs: readonly ("supplier" | "admin" | "employees")[]): Slot =>
  placed(tabs[0]!, "from", { picker: "from", ...(tabs.length > 1 ? { writes: tabs.slice(1) } : {}) });
const datasetInvite = placed("dataset", "dataset");
const employeesInvite = placed("employees", "employees");
const adminInvite = placed("admin", "admin");
/** "+ Mărimea achiziției" (plan §4.1–§4.2 P2, F3): set, the chip "Doar cele de peste 1 mil. lei" under the sentence says it. */
const sizeInvite = placed("purchaseValue", "size");
/**
 * "+ Sediul firmei" (F4, kit §5.28): set, the phrase glued to the firms, "cu sediul [în alt județ]". Its window
 * writes either key: against the buyer's county (firmSeat) or a county of its own (seatCounty); on the index only
 * the county (a profile has no record to compare, and no foreign firm reaches 20 direct acquisitions).
 */
const seatInvite = placed("firmSeat", "seat", { writes: ["seatCounty"] });
const seatCountyInvite = placed("seatCounty", "seat");

/** Each question's fragments that can be added, in the order of its sentence (plan §4, kit §6). */
function candidates(spec: FilterSpec, ctx: FilterCtx): Slot[] {
  const firms = spec.dim === "supplier";
  // "+ Ce s-a cumpărat": the kind ("Orice · Produse · Servicii · Lucrări") and the domain, where the sentence says the kind (F3).
  const cpvInvite = placed("cpvTerm", "cpvTerm", offersKind(spec) ? { writes: ["purchaseKind"] } : {});
  switch (ctx.block) {
    case "stat": return [cpvInvite, buyerInvite(ctx), fromInvite(["supplier", "admin", "employees"]), sizeInvite];
    // The ranked firms' size is the row CÂȘTIGĂTORII (F3), not an invitation.
    case "table": return firms ? [seatInvite, adminInvite, cpvInvite, sizeInvite] : [cpvInvite, fromInvite(["supplier", "admin", "employees"]), sizeInvite];
    case "timeseries": return [cpvInvite, buyerInvite(ctx), fromInvite(["supplier", "admin"])];
    case "map": return [cpvInvite, buyerInvite(ctx, { authority: false, locality: false, county: false }), fromInvite(["supplier", "admin"])];
    case "breakdown": return [cpvInvite, fromInvite(["supplier"])];
    // Between firms, who bought is a condition on their clients: a kind and its place (kit §6 compare 1).
    case "compare": return [cpvInvite, ...(ctx.role === "supplier" ? [buyerInvite(ctx, { authority: false, locality: false })] : [])];
    case "trend":
      if (firms) return [cpvInvite, buyerInvite(ctx), datasetInvite];
      // On institutions the kind is the subject; their place is added apart (final trend §3.6 "Unde și ce fel").
      if (spec.dim === "authority") return [placed("county", "place", ctx.locality.ok ? { writes: ["locality"] } : {}), cpvInvite, fromInvite(["supplier"]), datasetInvite];
      return [cpvInvite, buyerInvite(ctx, { authority: false, locality: false, county: false }), fromInvite(["supplier"]), datasetInvite];
    case "network": case "sankey": return [cpvInvite];
    case "fact_check": return [cpvInvite, datasetInvite];
    case "entity_card":
      if (ctx.form === "entity_card:risk") return firms ? [seatCountyInvite] : [];
      return firms ? [seatInvite, adminInvite, cpvInvite] : [cpvInvite, fromInvite(["supplier", "admin", "employees"])];
    default: return [];
  }
}

/** A window's filters: its own, and what it also writes. */
export const windowOf = (s: Pick<Slot, "id" | "writes">): FilterId[] => [s.id, ...(s.writes ?? [])];
/** The filters a picker chooses among, whatever its phrase shows now ("Cine a cumpărat?" on a kind or on one institution). */
export const PICKER_FAMILY: Partial<Record<Picker, readonly FilterId[]>> = {
  buyer: ["authority", "authorityKind", "locality"],
  from: ["supplier", "admin", "employees"],
};
/**
 * What a phrase stands for: its filter and what it says, the whole family of
 * a buyer or "De la cine?" window, a plain window's other filters. The focal
 * entity and the subject switch to another role or subject: that is not a
 * phrase of the filters they also write.
 */
function phraseFilters(t: SentenceSlot): FilterId[] {
  if (t.picker === "focal" || t.picker === "subject") return [t.filter, ...t.says];
  if (t.picker && PICKER_FAMILY[t.picker]) return [...PICKER_FAMILY[t.picker]!, t.filter, ...t.says];
  return [t.filter, ...t.says, ...(t.writes ?? [])];
}
const isSet = (spec: FilterSpec, id: FilterId) => id === "dataset" ? spec.dataset !== undefined && spec.dataset !== "all" : FILTERS[id].read(spec) !== undefined;

/**
 * P2: a candidate is invited while the sentence has no phrase for it and none
 * of its filters is set (a link's condition the sentence does not say keeps
 * its chip until ×: one visible control per key, R2). At most four.
 */
function invites(spec: FilterSpec, ctx: FilterCtx): Slot[] {
  const shown = new Set(sentenceTokens(spec, ctx).flatMap((t) => t.kind === "slot" ? phraseFilters(t) : []));
  return candidates(spec, ctx).filter((invite) => windowOf(invite).every((id) => !shown.has(id) && !isSet(spec, id))).slice(0, 4);
}

/**
 * P3b (plan §4.8, §4.9): who the partners are, a selection with the line of
 * total. An institution in the centre: its firms' size and, on the network,
 * their administrator (the flow's final leaves the person to the network and
 * the verification); a firm: its clients' county and kind. The firms' seat
 * comes with F4. The rest of today's keys would filter the centre itself (all
 * or nothing): a link's chip.
 */
function partners(_spec: FilterSpec, ctx: FilterCtx): ConditionRow[] {
  if (ctx.role === "supplier") return [{ label: "Clienții", kind: "selection", chips: [placed("county", "clientCounty"), placed("authorityKind", "clientKind")] }];
  return [{ label: "Furnizorii", kind: "selection", chips: [placed("employees", "employees"), ...(ctx.block === "network" ? [placed("admin", "admin")] : [])] }];
}

/**
 * P9, "⋯ › Selecție avansată" (plan §1.1 variant A, kit P9): the precise
 * selection until its replacements come (F3 sizes, F4 exclusions), on the
 * questions that apply it; not on the profiles, nor on a comparison (as
 * today). The record threshold counts the ranked role only (the firms of a
 * ranking of firms), never on a trend.
 */
function advanced(spec: FilterSpec, ctx: FilterCtx): Slot[] {
  if (ctx.profile || ctx.block === "compare") return [];
  const ranked = ["table", "entity_card"].includes(ctx.block) && (spec.dim === "supplier" || spec.dim === "authority") ? spec.dim : null;
  return [
    placed("population", "advanced"),
    ...(ranked ? [placed("minimumRecords", "advanced", { choices: [{ role: ranked, count: 5 }, { role: ranked, count: 1_000_000 }, undefined] })] : []),
  ];
}

/**
 * P9's precise selection, field by field (plan §1.1 variant A: what the
 * sentence cannot say): lists of institutions and firms, included or left
 * out, several counties, exact days, a winner's share and CPV codes left out
 * (one domain is the sentence's "Ce s-a cumpărat"), with AND/OR between them.
 * The centre of a relation and the pair of a verification are one entity
 * each: a list of their role, or of the buyers' counties around an institution
 * in the centre, would filter that entity itself (all or nothing).
 */
const ADVANCED_FIELDS: readonly AdvancedField[] = [
  { field: "date", ops: ["gte", "lte"] }, { field: "value", ops: ["gte", "lte"] },
  { field: "authority", ops: ["in", "not_in"] }, { field: "supplier", ops: ["in", "not_in"] },
  { field: "cpv", ops: ["not_in"] }, { field: "county", ops: ["in", "not_in"] },
];
function advancedFields(spec: FilterSpec, ctx: FilterCtx): AdvancedField[] {
  if (!advanced(spec, ctx).some((s) => s.id === "population")) return [];
  const fixed = new Set<AdvancedField["field"]>();
  if (ctx.block === "network" || ctx.block === "sankey") { fixed.add(ctx.role); if (ctx.role === "authority") fixed.add("county"); }
  if (ctx.block === "fact_check") for (const field of ["authority", "supplier", "county"] as const) fixed.add(field);
  return ADVANCED_FIELDS.filter((f) => !fixed.has(f.field));
}

/**
 * A precise selection the question's "Selecție avansată" can show and edit:
 * every condition besides the "Fără X" exclusions (their own chips) on an
 * offered field and rule. Anything else is an old link's chip ("Din link").
 */
export function populationFits(population: FilterSpec["population"], fields: readonly AdvancedField[]): boolean {
  const { rest } = splitExcluded(population);
  return !rest || rest.groups.every((group) => group.conditions.every((c) => fields.some((f) => f.field === c.field && f.ops.includes(c.op))));
}

const sentence: BlockFilters["sentence"] = (spec, ctx) => sentenceSlots(sentenceTokens(spec, ctx));
const presentation: BlockFilters["presentation"] = (spec) => sentenceSlots(presentationTokens(spec));

/**
 * P3a, the row CÂȘTIGĂTORII of a ranking of firms (plan §4.2, §4.7, §4.13):
 * the firms' size is an attribute of the ranked firm, the list narrows to the
 * band and the total stays the sentence's: on a trend of firms under trend-2,
 * on "Cine câștigă?" under table:employees-2 (F3), and on "Cine conduce?" by
 * value, which runs that ranking (its place 1 is the same firm). Not on the
 * risk index (F6c: the employees on profiles).
 */
function winners(spec: FilterSpec, ctx: FilterCtx): ConditionRow[] {
  if (spec.dim !== "supplier" || ctx.form === "entity_card:risk") return [];
  return [{ label: "Câștigătorii", kind: "group", chips: [employeesInvite] }];
}

/**
 * P4 on a trend (trend final §3.3): "Aceleași luni" on every trend, drawn by
 * the state of the compared year (trend-rules.ts trendMonthsState): the
 * automatic chip, the chosen months, the switch, or nothing on complete years.
 */
const sameMonths = placed("trendMonths", "months");

/**
 * The role of an answer's rows that "Scoate din calcul" leaves out (F4, plan
 * §4.2, §4.7, §4.13): the ranked institutions or firms of a ranking, of "Cine
 * conduce?" by value (its places run that ranking) and of a trend (the
 * optional exclusion of §9 F2, offered). Not the counties (42 rows: leaving
 * one out is not a question, final table §3.11), not a profile (no record to
 * leave out). The map's card, the network's and the flow's partners come
 * with their own rows (F5, F4's relations).
 */
function rowRole(spec: FilterSpec, ctx: FilterCtx): "authority" | "supplier" | null {
  if (ctx.profile || !["table", "trend", "entity_card"].includes(ctx.block)) return null;
  return spec.dim === "authority" || spec.dim === "supplier" ? spec.dim : null;
}
const excludeRows: BlockFilters["exclude"] = (spec, ctx) => {
  const field = rowRole(spec, ctx);
  return field ? { field, max: 5 } : null;
};
/** P7 (kit §2): "Vezi înregistrările →" · "Scoate din calcul" · "Fișa firmei ↗", on every row with an entity of its own. */
const entityRowMenu: BlockFilters["rowMenu"] = (spec, ctx) => rowRole(spec, ctx) ? ["records", "exclude", "entity"] : [];

function entry(extra: Partial<Pick<BlockFilters, "rows" | "strip" | "under">> = {}): BlockFilters {
  return {
    sentence, presentation, invites, advanced, advancedFields,
    scopeLine: (_spec, ctx) => ctx.profile ? "historical-da" : null,
    rows: extra.rows ?? (() => []), under: extra.under ?? (() => []), strip: extra.strip ?? [],
    // P7–P8 are the answer's (its row menu and facts), drawn with the strip.
    rowMenu: entityRowMenu, exclude: excludeRows, facts: [],
  };
}

/** P4 on the total and the ranking (F3, kit §6 stat 3): "Doar cele de peste 1 mil. lei ×", drawn once set. */
const size = () => [sizeInvite];
/** P4 on the evolution (F3): the chip "Aceleași luni: ian.–mai ×" once the strip's switch set it. */
const seriesMonths = placed("timeseriesMonths", "months");

export const BLOCK_FILTERS: Record<Block, BlockFilters> = {
  stat: entry({ under: size }),
  table: entry({ rows: winners, under: size }),
  // The split and the same months beside the answer (F3, final timeseries §3.8–§3.9); the months' chip once set.
  timeseries: entry({ strip: ["timeseriesSplit", "timeseriesMonths"], under: () => [seriesMonths] }),
  // The measure is the map's lens, beside the answer (plan §4.4 F1b).
  map: entry({ strip: ["measure"] }),
  // The data stream is the strip's segmented "Toate · Directe · Proceduri"; the sentence says it once set ("prin […]").
  // The number beside the value: the legend's headers order by it (F3, final breakdown §3.8).
  breakdown: entry({ strip: ["dataset", "measure"] }),
  compare: entry({ strip: ["dataset"] }),
  // The groups beside the answer switch on the data already fetched (owner-R-facts-all-lists); "Prima dată" on the new ones.
  trend: entry({ rows: winners, under: () => [sameMonths], strip: ["trendChange", "trendFirstOnly"] }),
  network: entry({ rows: partners, strip: ["dataset"] }),
  sankey: entry({ rows: partners, strip: ["dataset"] }),
  fact_check: entry(),
  distribution: entry(),
  scatter: entry(),
  entity_card: entry({ rows: winners }),
};
