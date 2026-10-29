import { AUTHORITY_KINDS, SEAT_RULES, SELECTION_RULES, WINNERS_RULES, type AskSpec, type AuthorityKind, type Block } from "../spec";
import { BLOCK_FILTERS, PICKER_FAMILY, populationFits, windowOf } from "./blocks";
import { filterContext, NATIONAL_ENTITY_SCAN, nationalEntityScan } from "./context";
import { FILTERS } from "./defs";
import { edited } from "./defs/shared";
import type { Party } from "./defs/selection";
import { writeFocal } from "./registry";
import { KINDS_AFTER_D1, kindAfterD1 } from "./sentence";
import { trendMonthsWaiting } from "./trend-rules";
import type { Availability, FilterCtx, FilterId, FilterSpec, Slot } from "./types";

/*
 * The windows of BLOCK_FILTERS (plan §2.3, kit §3 component 9): every value a
 * place offers on a draft, how its window writes it, and which values it
 * shows unusable with the reason (R1: never offered and then refused).
 * transition.ts applies a choice to the draft; registry.test.ts walks every
 * choice and every pair of choices against the engine.
 */

/** One row of a window: the filter it writes and its value (undefined: the window's first row, R4). */
export interface Choice { filter: FilterId; value: unknown }
/** The subject window's rows: firms, institutions with their kind, or counties. */
export interface SubjectChoice { dim: "supplier" | "authority" | "county"; kind?: AuthorityKind }

/**
 * The answer's shape: its window has no empty row, the first row is a value ("Toate achizițiile", "valoarea
 * înregistrată"); so are a trend's change, order and base, whose every value is a row ("Toate schimbările", "Diferența în lei").
 */
const NO_EMPTY_ROW: ReadonlySet<FilterId> = new Set(["dim", "measure", "topN", "rankBy", "dataset", "trendChange", "trendOrder", "trendMinBase",
  // F4: the network's year, order and length are values every one ("2025", "Valoarea înregistrată", "Primii 15").
  "networkSince", "networkOrder", "networkShow", "sankeyShown"]);

/** Kinds a question cannot say before D1 (sentence.ts KINDS_AFTER_D1): its windows do not offer them. */
const laterKind = (block: Block, kind: unknown) => (KINDS_AFTER_D1[block] ?? []).includes(kind as AuthorityKind);

/**
 * The kit's employee bands (§4, component 10): one band or a run of adjacent
 * ones, as Bands writes them (bandRange: both ends, from 0 for a run from it).
 * Today's presets ("Sub 5", "Sub 50") are the def's, for today's builder.
 */
export const EMPLOYEE_BAND_CHOICES: readonly { minEmployees: number; maxEmployees?: number }[] = [
  { minEmployees: 0, maxEmployees: 0 }, { minEmployees: 1, maxEmployees: 9 }, { minEmployees: 10, maxEmployees: 49 },
  { minEmployees: 50, maxEmployees: 249 }, { minEmployees: 250 }, { minEmployees: 1, maxEmployees: 49 }, { minEmployees: 0, maxEmployees: 9 },
];
/**
 * A filter's values in F1b's windows: the def's, except where the kit's control offers other ones
 * (the employee bands) or fewer (a precise selection on the fields this question's P9 offers).
 */
function kitChoices(id: FilterId, spec: FilterSpec, ctx: FilterCtx): readonly unknown[] {
  if (id === "employees") return EMPLOYEE_BAND_CHOICES;
  const values = FILTERS[id].choices(spec, ctx);
  if (id !== "population") return values;
  const fields = BLOCK_FILTERS[ctx.block]?.advancedFields(spec, ctx) ?? [];
  return values.filter((value) => value === undefined || populationFits(value as FilterSpec["population"], fields));
}

/**
 * The values of one filter in this place, with the first row that removes it when the place is set
 * (R4); a place the question needs filled (Slot.required: the pair of a verification) has none.
 */
function valuesOf(slot: Slot, id: FilterId, spec: FilterSpec, ctx: FilterCtx): unknown[] {
  const values = [...(id === slot.id && slot.choices ? slot.choices : kitChoices(id, spec, ctx))];
  if (id === slot.id && slot.required) return values.filter((value) => value !== undefined);
  if (!values.includes(undefined) && !NO_EMPTY_ROW.has(id) && FILTERS[id].read(spec) !== undefined) values.push(undefined);
  return values;
}

/** Every choice a place offers on this draft, whatever its state (choiceState). */
export function choicesOf(slot: Slot, spec: FilterSpec, ctx: FilterCtx = filterContext(spec)): Choice[] {
  switch (slot.picker) {
    case "focal":
      return (["authority", "supplier"] as const).flatMap((role) => FILTERS[role].choices(spec, ctx).map((value) => ({ filter: role, value })));
    case "subject": {
      const dims = FILTERS.dim.choices(spec, ctx) as SubjectChoice["dim"][];
      return dims.flatMap((dim): Choice[] => dim !== "authority" ? [{ filter: "dim", value: { dim } }]
        : [{ filter: "dim", value: { dim } }, ...AUTHORITY_KINDS.map((kind) => ({ filter: "dim" as const, value: { dim, kind } }))]);
    }
    case "buyer": case "from": {
      const family = PICKER_FAMILY[slot.picker]!;
      const own = windowOf(slot);
      const tabs = family.filter((id) => own.includes(id));
      const rest = own.filter((id) => !family.includes(id));
      // The first row clears the window ("Toate instituțiile publice", "Orice firmă"); then each tab's values.
      return [
        { filter: tabs[0]!, value: undefined },
        ...tabs.flatMap((id) => kitChoices(id, spec, ctx).filter((value) => value !== undefined).map((value) => ({ filter: id, value }))),
        ...rest.flatMap((id) => valuesOf(slot, id, spec, ctx).map((value) => ({ filter: id, value }))),
      ];
    }
    default:
      return windowOf(slot).flatMap((id) => valuesOf(slot, id, spec, ctx).map((value) => ({ filter: id, value })));
  }
}

/** The filters a place's window writes: what its choice may replace without a note. */
export function windowFilters(slot: Slot): FilterId[] {
  switch (slot.picker) {
    case "focal": return ["authority", "supplier", "dim"];
    case "subject": return ["dim", "authorityKind"];
    case "buyer": case "from": return [...new Set([...PICKER_FAMILY[slot.picker]!.filter((id) => windowOf(slot).includes(id)), ...windowOf(slot)])];
    default: return windowOf(slot);
  }
}

/**
 * The draft after a choice, as its window writes it. The buyer's window and
 * "De la cine?" choose one of their filters (kit §5.24): the others leave.
 * The subject writes the kind only on institutions; on firms or counties the
 * kind stays the buyer's ("Ce firme câștigă achizițiile făcute de [spitalele]").
 */
export function writeChoice(spec: FilterSpec, slot: Slot, choice: Choice): FilterSpec {
  if (slot.picker === "focal") return writeFocal(spec, choice.filter as "authority" | "supplier", choice.value as Party);
  if (slot.picker === "subject") {
    const { dim, kind } = choice.value as SubjectChoice;
    return edited(spec, (next) => {
      next.dim = dim;
      if (dim === "authority") {
        if (kind) next.filters.authorityKind = kind;
        else delete next.filters.authorityKind;
      }
      // One county council per county: on the risk cloud the place is the whole country (plan §4.12, the fixed phrase).
      if (spec.block === "scatter" && kind === "consiliu_judetean") delete next.filters.county;
    });
  }
  const family = slot.picker ? PICKER_FAMILY[slot.picker] ?? [] : [];
  // „Ce fel de firme” holds the firms' size and their seat together where the window writes the seat (S4r-from-seat): one tab.
  const tab = (id: FilterId): FilterId => slot.picker === "from" && (id === "firmSeat" || id === "newSince") ? "employees" : id;
  let next = spec;
  if (family.includes(tab(choice.filter)))
    for (const id of windowOf(slot)) if (tab(id) !== tab(choice.filter) && family.includes(tab(id))) next = FILTERS[id].write(next, undefined);
  return FILTERS[choice.filter].write(next, choice.value);
}

/** A ranking pinned to one row by the draft: the subject that row would be, and what to remove first. */
function pinnedRow(spec: FilterSpec, ctx: FilterCtx, dim: SubjectChoice["dim"]): string | null {
  if (!["table", "trend"].includes(ctx.block)) return null;
  if (dim === "county") return spec.filters.county ? "Scoate județul ca să clasezi județele."
    : spec.filters.uatSiruta ? "Scoate localitatea ca să clasezi județele." : null;
  if (dim === "authority" && ctx.named.authority) return "Scoate instituția aleasă ca să clasezi instituțiile.";
  if (dim === "supplier" && ctx.named.supplier) return "Scoate firma aleasă ca să clasezi firmele.";
  return null;
}

/**
 * The state of one row of a window (R1, plan §2.1): hidden where the question
 * cannot say it (a kind before D1), disabled with the reason where it would
 * pin a ranking to one row (TODAY_REFUSALS county-ranking, ranking-pair), else
 * offered. What a choice makes inapplicable elsewhere on the draft is
 * transition.ts's: dropped with a note, or parked on a change of axis.
 */
export function choiceState(slot: Slot, choice: Choice, spec: FilterSpec, ctx: FilterCtx = filterContext(spec)): Availability {
  if (slot.picker === "subject") {
    const { dim, kind } = choice.value as SubjectChoice;
    if (kind && laterKind(ctx.block, kind)) return { state: "hidden" };
    const pinned = pinnedRow(spec, ctx, dim);
    return pinned ? { state: "disabled", reason: pinned } : { state: "offered" };
  }
  // A kind of the profiles' subject waits; the buyers of a ranking of firms keep every kind (kindAfterD1).
  if (choice.filter === "authorityKind" && kindAfterD1(spec, choice.value)) return { state: "hidden" };
  // A purchase kind a CPV code has no codes of (SELECTION_RULES): shown, with the reason, never chosen (F3, kit §5.3).
  if (choice.filter === "purchaseKind" && choice.value !== undefined) {
    const reason = SELECTION_RULES.purchaseKind(FILTERS.purchaseKind.write(spec, choice.value) as unknown as AskSpec);
    if (reason) return { state: "disabled", reason };
    // Goods and services cover most records: grouped per entity nationally they read both marts whole (S4 review,
    // 2–9 s); works are an index range of 45 (about 1 s). The current choice stays choosable.
    if (choice.value !== "lucrari" && choice.value !== spec.filters.purchaseKind && nationalEntityScan(spec)) return { state: "disabled", reason: NATIONAL_ENTITY_SCAN };
  }
  // A foreign firm has no MF filing (SEAT_RULES, F4): beside a size, "În străinătate" is shown with the reason.
  if (choice.filter === "firmSeat" && choice.value !== undefined) {
    const reason = SEAT_RULES.firmSeat(FILTERS.firmSeat.write(spec, choice.value) as unknown as AskSpec);
    if (reason) return { state: "disabled", reason };
  }
  // F5: a sense of „Firme noi” the draft cannot take (registered beside a foreign seat, a year after the period).
  if (choice.filter === "newSince" && choice.value !== undefined) {
    const next = FILTERS.newSince.write(spec, choice.value) as unknown as AskSpec;
    const reason = SEAT_RULES.firmSeat(next) ?? WINNERS_RULES.newSince(next);
    if (reason) return { state: "disabled", reason };
  }
  // The automatic months of a year whose complete months are not confirmed: the run would refuse it (trend final §3.3).
  if (choice.filter === "trendMonths" && choice.value === "auto") {
    const waiting = trendMonthsWaiting(FILTERS.trendMonths.write(spec, "auto"), ctx);
    if (waiting) return { state: "disabled", reason: waiting };
  }
  return { state: "offered" };
}
