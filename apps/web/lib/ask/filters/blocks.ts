import type { Block } from "../spec";
import { FILTERS } from "./defs";
import { presentationTokens, sentenceSlots, sentenceTokens, type SentenceSlot } from "./sentence";
import type { BlockFilters, ConditionRow, FilterCtx, FilterId, FilterSpec, Picker, Slot } from "./types";

/*
 * BLOCK_FILTERS (plan §2.2, §4, §5 F1b): what each of the 13 questions offers,
 * in which place, with today's keys only. The builder renders from it
 * (QuestionBuilder still draws today's offers, described in today-blocks.ts,
 * until it does). registry.test.ts walks every offer and every pair of offers
 * against the engine (R1).
 *
 * - P1 is the sentence (sentence.ts): one slot per editable phrase.
 * - P2 are the fragments the sentence does not show yet, named (kit §4), in
 *   its order, at most four: an invitation becomes its phrase once set.
 * - P3b, the partners of the network and the flow ("Furnizorii",
 *   "Clienții"): a selection, the total changes. No group row (P3a) in F1b:
 *   the engine still applies every key on the records (plan §2.1, §12.14).
 * - P5 the presentation line (table, trend); P6 the controls beside the answer
 *   that write a key; P9 "⋯ › Selecție avansată" (plan §1.1 variant A).
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
const cpvInvite = placed("cpvTerm", "cpvTerm");
const datasetInvite = placed("dataset", "dataset");
const employeesInvite = placed("employees", "employees");
const adminInvite = placed("admin", "admin");

/** Each question's fragments that can be added, in the order of its sentence (plan §4, kit §6). */
function candidates(spec: FilterSpec, ctx: FilterCtx): Slot[] {
  const firms = spec.dim === "supplier";
  switch (ctx.block) {
    case "stat": return [cpvInvite, buyerInvite(ctx), fromInvite(["supplier", "admin", "employees"])];
    case "table": return firms ? [employeesInvite, adminInvite, cpvInvite] : [cpvInvite, fromInvite(["supplier", "admin", "employees"])];
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
      if (ctx.form === "entity_card:risk") return firms ? [placed("county", "seat")] : [];
      return firms ? [employeesInvite, adminInvite, cpvInvite] : [cpvInvite, fromInvite(["supplier", "admin", "employees"])];
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
  if (t.picker) return [...PICKER_FAMILY[t.picker] ?? [], t.filter, ...t.says];
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
 * total. An institution in the centre: its firms' size and administrator; a
 * firm: its clients' county and kind. The rest of today's keys would filter
 * the centre itself (all or nothing): a link's chip.
 */
function partners(_spec: FilterSpec, ctx: FilterCtx): ConditionRow[] {
  return ctx.role === "authority"
    ? [{ label: "Furnizorii", kind: "selection", chips: [placed("employees", "employees"), placed("admin", "admin")] }]
    : [{ label: "Clienții", kind: "selection", chips: [placed("county", "clientCounty"), placed("authorityKind", "clientKind")] }];
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

const sentence: BlockFilters["sentence"] = (spec, ctx) => sentenceSlots(sentenceTokens(spec, ctx));
const presentation: BlockFilters["presentation"] = (spec) => sentenceSlots(presentationTokens(spec));

function entry(extra: Partial<Pick<BlockFilters, "rows" | "strip">> = {}): BlockFilters {
  return {
    sentence, presentation, invites, advanced,
    scopeLine: (_spec, ctx) => ctx.profile ? "historical-da" : null,
    rows: extra.rows ?? (() => []), under: () => [], strip: extra.strip ?? [],
    // P7–P8 are the answer's (its row menu and facts), drawn with the strip.
    rowMenu: [], facts: [],
  };
}

export const BLOCK_FILTERS: Record<Block, BlockFilters> = {
  stat: entry(),
  table: entry(),
  timeseries: entry(),
  // The measure is the map's lens, beside the answer (plan §4.4 F1b).
  map: entry({ strip: ["measure"] }),
  // The data stream is the strip's segmented "Toate · Directe · Proceduri"; the sentence says it once set ("prin […]").
  breakdown: entry({ strip: ["dataset"] }),
  compare: entry({ strip: ["dataset"] }),
  trend: entry(),
  network: entry({ rows: partners, strip: ["dataset"] }),
  sankey: entry({ rows: partners, strip: ["dataset"] }),
  fact_check: entry(),
  distribution: entry(),
  scatter: entry(),
  entity_card: entry(),
};
