import { BLOCK_FILTERS } from "../../../lib/ask/filters/blocks";
import { filterContext } from "../../../lib/ask/filters/context";
import { describeConditions, type ConditionLabels } from "../../../lib/ask/filters/describe";
import { advancedConditions, legacyConditions, type LegacyCondition } from "../../../lib/ask/filters/legacy-conditions";
import { exclusionWords, splitExcluded, type Excluded } from "../../../lib/ask/filters/origin";
import { conditionSet, FILTERS } from "../../../lib/ask/filters/registry";
import { presentationTokens, sentenceTokens, type SentenceSlot, type SentenceToken } from "../../../lib/ask/filters/sentence";
import type { FilterCtx, FilterId, FilterSpec, Slot } from "../../../lib/ask/filters/types";
import { employeesOnBands } from "../../../lib/ask/filters/words";
import { trendMonthsState, trendMonthsWaiting, type TrendMonthsState } from "../../../lib/ask/filters/trend-rules";
import type { Choice } from "../../../lib/ask/filters/pickers";
import { monthsLabel } from "../../../lib/ask/months-window";
import { askLink } from "../../../lib/ask/source-spec";
import type { QueryPopulation } from "../../../lib/ask/population";
import type { NetworkOptions, SankeyOptions, TimeseriesOptions, TrendOptions } from "../../../lib/ask/spec";
import { specTrendList, type TrendList } from "../../../lib/ask/trend-shared";
import { KIND_WORDS, cloneQuestion, countyWords, questionKey, type QuestionSpec } from "../../../lib/ask/question-ui";
import type { SentenceToken as KitToken } from "./kit-types";
import type { UnderChipItem } from "./UnderChips";

/*
 * What the builder draws for a draft (plan §2.3, kit P1–P9): the registry
 * (BLOCK_FILTERS, sentence.ts, legacyConditions) mapped onto the kit's props in
 * one place, as MAPPING.md lists them. Pure: QuestionBuilder renders it and
 * the windows (BuilderWindow) open what `windows` names. Every control opens a
 * window keyed here: "s:" a phrase of the sentence, "p:" of the presentation
 * line, "i:" an invitation, "r:" a chip of a condition row, "u:" a chip the
 * question owns under the sentence (the trend's "Aceleași luni"), "x:" a collapsed
 * exclusion, "advanced" the "⋯ › Selecție avansată" window (P9), which an
 * "a:" chip ("Selecție avansată: …") opens too.
 */

/** A window the builder can open: the registry's place (its filter, picker and what it also writes), its title (R10) and name. */
export interface BuilderWindowSpec {
  key: string;
  slot: Slot;
  title: string;
  /** The place's name: "Perioada", "Ce s-a cumpărat", for a screen reader and the remove button. */
  name: string;
}

/**
 * What × under the sentence removes: a link's condition, some exclusions, or a "Selecție avansată" key;
 * or, on the question's own chip (the trend's "Aceleași luni"), the choice its × or its switch makes.
 */
export type UnderRemoval =
  | { kind: "link"; condition: LegacyCondition }
  | { kind: "exclusion"; excluded: Excluded[] }
  | { kind: "advanced"; key: "population" | "minimumRecords" }
  | { kind: "choice"; slot: Slot; choice: Choice };

/** A chip of a condition row; `toggle`: a switch without values (kit component 5, the network's „Cu semnale”). */
export interface RowChipView { key: string; id: FilterId; label: string; name: string; active: boolean; toggle?: true }
export interface RowView { label: string; kind: "group" | "selection"; chips: RowChipView[] }

export interface BuilderView {
  sentence: KitToken[];
  presentation: KitToken[];
  windows: Record<string, BuilderWindowSpec>;
  invites: { id: string; label: string }[];
  rows: RowView[];
  under: UnderChipItem[];
  removals: Record<string, UnderRemoval>;
  /** A link's conditions the engine refuses: "Vezi răspunsul" waits until they are removed. */
  refused: LegacyCondition[];
  /** Why the run waits for a choice under the sentence (a trend's months not confirmed in the data), or null. */
  waiting: string | null;
  /** P9 offered on this question ("⋯ › Selecție avansată"). */
  advanced: readonly Slot[];
  /** Component 18 on the three profiles. */
  scopeLine: boolean;
}

/**
 * A key the strip beside the answer changed (plan §2.3): written into the
 * applied question and the draft, the rest of the draft left as it is. A new
 * `seq` is a new change; the builder is not remounted, so a draft survives.
 */
export interface StripPatch {
  seq: number; path: "dataset" | "measure" | "trend" | "timeseries" | "purchaseKind" | "network" | "sankey" | "sharedPartners"; value: string;
  /** "trend": the list chosen in the answer (`value`) and the applied question's trend options after it (null: no key). */
  trend?: TrendOptions | null;
  /** "timeseries" (F3): the evolution's options after the strip's split or same months (null: no key). */
  timeseries?: TimeseriesOptions | null;
  /** "network" (F4): its options after a group, an order or a reference year chosen beside the answer; a group takes the period away. */
  network?: NetworkOptions | null;
  dropPeriod?: true;
  /** "sankey" (F4): its options after „Arată 6 · 10 · 15” (null: no key). */
  sankey?: SankeyOptions | null;
}

/** The draft after a strip change: only that key, as the applied question got it. */
export function patchDraft(draft: QuestionSpec, patch: Pick<StripPatch, "path" | "value" | "trend" | "timeseries" | "network" | "dropPeriod" | "sankey">): QuestionSpec {
  const next = cloneQuestion(draft);
  if (patch.path === "dataset") next.dataset = patch.value;
  else if (patch.path === "trend") {
    if (patch.trend) next.trend = structuredClone(patch.trend) as TrendOptions;
    else delete next.trend;
  } else if (patch.path === "timeseries") {
    if (patch.timeseries) next.timeseries = structuredClone(patch.timeseries) as TimeseriesOptions;
    else delete next.timeseries;
  } else if (patch.path === "network") {
    if (patch.network) next.network = structuredClone(patch.network) as NetworkOptions;
    else delete next.network;
    if (patch.dropPeriod) for (const key of ["yearFrom", "yearTo", "monthFrom", "monthTo"]) delete next.filters[key];
  } else if (patch.path === "sankey") {
    if (patch.sankey) next.sankey = structuredClone(patch.sankey) as SankeyOptions;
    else delete next.sankey;
  } else if (patch.path === "purchaseKind") {
    // The breakdown's kinds row (F3): a kind, or every kind again (an empty value).
    if (patch.value) next.filters.purchaseKind = patch.value;
    else delete next.filters.purchaseKind;
  } else if (patch.path === "sharedPartners") {
    // A comparison's „Doar clienții comuni” (F4): on ("true") or off.
    if (patch.value === "true") next.filters.sharedPartners = true;
    else delete next.filters.sharedPartners;
  } else next.measure = patch.value;
  return next;
}

/**
 * The answer's list a draft asks for when it differs from the applied question
 * only by its trend's group (the sentence's "Ce fel de schimbare?" chose
 * another one): the screen switches to it like its button, with no request,
 * when the answer holds it (AskPanel). The order and its base belong to the
 * growths' list (trendListSpec) and do not count; the months and every other
 * key do. Null otherwise: the draft waits for "Actualizează răspunsul".
 */
export function trendListSwitch(draft: QuestionSpec, applied: QuestionSpec | null): TrendList | null {
  if (!applied || draft.block !== "trend" || applied.block !== "trend") return null;
  const list = specTrendList(draft as { trend?: TrendOptions });
  if (list === specTrendList(applied as { trend?: TrendOptions })) return null;
  const rest = (q: QuestionSpec) => {
    const { change: _change, firstOnly: _first, order: _order, minBase: _base, ...trend } = (q.trend ?? {}) as TrendOptions;
    return questionKey({ ...q, trend });
  };
  return rest(draft) === rest(applied) ? list : null;
}

/** The registry's slot of a phrase: its filter, picker and what its window also writes (sentence.ts sentenceSlots). */
export const phraseSlot = (token: SentenceSlot): Slot => ({
  id: token.filter, ...(token.picker ? { picker: token.picker } : {}), ...(token.writes ? { writes: token.writes } : {}),
  ...(token.required ? { required: true as const } : {}),
});

// Neutral about age: a selection saved today on a page whose shape is not recognised (a comparison group's clip) also reads "Din link".
const LINK_TIP = "Condiție din link; se aplică la fel. Nu se alege aici.";
const ORIGIN_TIP = "Vine din altă pagină a site-ului; se aplică întocmai.";

const capital = (text: string) => text.charAt(0).toLocaleUpperCase("ro-RO") + text.slice(1);

/** A row chip's words: its name unset ("Angajați"), its value set ("1–9 angajați", "Conduse azi de ION"). */
function rowChipLabel(spec: FilterSpec, slot: Slot, described: ReturnType<typeof describeConditions>["byId"]): string {
  const name = slot.label ?? FILTERS[slot.id].label;
  if (!conditionSet(spec, slot.id)) return name;
  switch (slot.id) {
    case "admin": return `Conduse azi de ${spec.filters.adminName ?? "persoana aleasă"}`;
    case "authorityKind": return capital(KIND_WORDS[String(spec.filters.authorityKind)]?.bare ?? name);
    case "county": return capital(countyWords(String(spec.filters.county)).replace(/^din /, ""));
    default: return described[slot.id]?.chip ?? name;
  }
}

/** The kit's tokens of a sentence; each phrase is keyed by its window. */
function kitTokens(tokens: readonly SentenceToken[], prefix: string, windows: Record<string, BuilderWindowSpec>): KitToken[] {
  return tokens.map((token): KitToken => {
    if (token.kind === "text") return token;
    // A fixed phrase says why it cannot change in its (?) ("Un consiliu pe județ.").
    if (token.kind === "fixed") return { kind: "fixed", text: token.text, ...(token.tip ? { tip: token.tip } : {}) };
    const key = `${prefix}${token.id}`;
    windows[key] = { key, slot: phraseSlot(token), title: token.window, name: token.slot };
    return { kind: "slot", id: key, slot: token.slot, value: token.value };
  });
}

const MONTH_NAMES = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"] as const;
/** "31 mai": the day a channel is complete until. */
const dayWords = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTH_NAMES[Number(iso.slice(5, 7)) - 1] ?? ""}`;
const CHANNEL_WORDS = { da: "achizițiile directe", contracts: "contractele" } as const;

/**
 * "Aceleași luni" under a trend's sentence (trend final §3.3, kit P4), by the
 * compared year's state (trend-rules.ts): the amber chip with the months the
 * answer will count (× compares whole years), the warning when the data do not
 * confirm them (its button opens the window; the run waits), the chosen months
 * (× back to automatic) or the switch that turns them on again.
 */
function sameMonthsChip(slot: Slot, state: NonNullable<TrendMonthsState>): { item: UnderChipItem; removal?: UnderRemoval } {
  const id = `u:${slot.id}`, name = slot.label ?? "Aceleași luni";
  const choice = (value: unknown): UnderRemoval => ({ kind: "choice", slot, choice: { filter: "trendMonths", value } });
  switch (state.kind) {
    case "auto": {
      const months = state.window ? monthsLabel(state.window) : null;
      const text = state.through && months
        ? `Datele din ${state.year} sunt complete până la ${dayWords(state.through)}. Ambii ani se compară pe ${months}, ca diferența să nu vină din lunile lipsă. Se recalculează la fiecare actualizare.`
        : `Ambii ani se compară pe lunile complete din ${state.year}. Se recalculează la fiecare actualizare.`;
      return { item: { kind: "auto", id, label: months ? `${name}: ${months}` : name, name, tip: { title: name, text } }, removal: choice("whole") };
    }
    case "unconfirmed": {
      const which = state.channels.length === 1 ? CHANNEL_WORDS[state.channels[0]!] : "datele";
      return { item: { kind: "notice", id, label: `${state.year}: luni neconfirmate`, action: "Compară pe aceleași luni…",
        tip: { title: "Luni neconfirmate", text: `Nu știm până când sunt complete ${which} din ${state.year}. Alege lunile comparate sau ani încheiați.` } } };
    }
    case "chosen":
      return { item: { kind: "only", id, label: `${name}: ${monthsLabel({ from: state.window[0], to: state.window[1] })}`, name }, removal: choice("auto") };
    case "off":
      // The kit's switch for "Aceleași luni" keeps its half disc (component 5, glyph "half").
      return state.unconfirmed ? { item: { kind: "toggle", id, label: name, glyph: "half", opens: true } } : { item: { kind: "toggle", id, label: name, glyph: "half" }, removal: choice("auto") };
  }
}

/** The builder's view of a draft. `labels` names a CPV code; `ctx` comes from the caller when it has more than the spec. */
export function builderView(input: QuestionSpec, labels: ConditionLabels = {}, ctx: FilterCtx = filterContext(input as FilterSpec)): BuilderView {
  const spec = input as FilterSpec;
  const entry = BLOCK_FILTERS[ctx.block];
  const windows: Record<string, BuilderWindowSpec> = {};
  const sentence = kitTokens(sentenceTokens(spec, ctx, { cpvName: labels.cpvName }), "s:", windows);
  const presentation = kitTokens(presentationTokens(spec), "p:", windows);
  const described = describeConditions(spec, labels).byId;

  const invites = (entry?.invites(spec, ctx) ?? []).map((slot) => {
    const key = `i:${slot.id}`;
    const label = slot.label ?? FILTERS[slot.id].label;
    windows[key] = { key, slot, title: slot.window ?? FILTERS[slot.id].windowTitle ?? label, name: label };
    return { id: key, label };
  });

  const rows = (entry?.rows(spec, ctx) ?? []).map((row): RowView => ({
    label: row.label, kind: row.kind,
    chips: row.chips.map((slot) => {
      const key = `r:${slot.id}`;
      const name = slot.label ?? FILTERS[slot.id].label;
      windows[key] = { key, slot, title: slot.window ?? FILTERS[slot.id].windowTitle ?? name, name };
      // An old link's range of employees stays its own chip under the sentence (kit §5.5): here the row says nothing.
      const shown = conditionSet(spec, slot.id) && (slot.id !== "employees" || employeesOnBands(spec.filters.minEmployees, spec.filters.maxEmployees));
      return { key, id: slot.id, label: shown ? rowChipLabel(spec, slot, described) : name, name, active: shown, ...(FILTERS[slot.id].control === "toggle" ? { toggle: true as const } : {}) };
    }),
  }));

  const advanced = entry?.advanced(spec, ctx) ?? [];
  if (advanced.length) windows.advanced = { key: "advanced", slot: advanced[0]!, title: "Selecție avansată", name: "Selecție avansată" };

  // P4, in the kit's order (UnderChips sorts): "Selecție avansată: …", exclusions, a link's and another page's conditions.
  const under: UnderChipItem[] = [];
  const removals: Record<string, UnderRemoval> = {};
  const conditions = legacyConditions(spec, labels);
  const refused = conditions.filter((c) => c.status === "refused");
  // The question's own chips (BLOCK_FILTERS.under): the size of a purchase once set ("Doar cele de peste
  // 1 mil. lei": opens its window, × removes it), the trend's "Aceleași luni", drawn by its year's state.
  for (const slot of entry?.under(spec, ctx) ?? []) {
    if (slot.id !== "trendMonths") {
      if (!conditionSet(spec, slot.id)) continue;
      const id = `u:${slot.id}`, name = slot.label ?? FILTERS[slot.id].label;
      under.push({ kind: "only", id, label: described[slot.id]?.chip ?? name, name });
      removals[id] = { kind: "choice", slot, choice: { filter: slot.id, value: undefined } };
      windows[id] = { key: id, slot, title: slot.window ?? FILTERS[slot.id].windowTitle ?? name, name };
      continue;
    }
    const state = trendMonthsState(spec, ctx);
    if (!state) continue;
    const { item, removal } = sameMonthsChip(slot, state);
    under.push(item);
    if (removal) removals[item.id] = removal;
    windows[item.id] = { key: item.id, slot, title: slot.window ?? FILTERS[slot.id].windowTitle ?? FILTERS[slot.id].label, name: slot.label ?? FILTERS[slot.id].label };
  }
  for (const condition of advancedConditions(spec, labels)) {
    const id = `a:${condition.key}`;
    under.push({ kind: "only", id, label: condition.label, name: condition.label });
    removals[id] = { kind: "advanced", key: condition.key };
    // The chip opens "Selecție avansată", where its condition is edited (it read as a window and opened nothing).
    if (advanced.length) windows[id] = { key: id, slot: advanced[0]!, title: "Selecție avansată", name: condition.label };
  }
  const origin = described.population?.origin;
  if (spec.population && !origin && !refused.some((c) => c.key === "population")) {
    const { excluded } = splitExcluded(spec.population);
    for (const field of [...new Set(excluded.map((e) => e.field))]) {
      const own = excluded.filter((e) => e.field === field);
      if (own.length >= 3) {
        const id = `x:${field}`;
        const label = capital(exclusionWords(own)[0]!);
        under.push({ kind: "exclude", id, label, collapsed: true });
        removals[id] = { kind: "exclusion", excluded: own };
        windows[id] = { key: id, slot: { id: "population" }, title: label, name: label };
      } else for (const e of own) {
        const id = `x:${field}:${e.value}`;
        under.push({ kind: "exclude", id, label: `Fără ${e.label}` });
        removals[id] = { kind: "exclusion", excluded: [e] };
      }
    }
  }
  for (const condition of conditions) {
    const id = `l:${condition.key}`;
    removals[id] = { kind: "link", condition };
    const reason = condition.why ?? condition.reason;
    if (condition.origin !== "link") {
      const label = condition.label.slice(0, condition.label.indexOf(":"));
      under.push({ kind: "origin", id, prefix: label, words: condition.words, tip: { title: label, text: reason ?? condition.detail ?? ORIGIN_TIP } });
    } else {
      const tip = reason ?? [condition.tip ?? LINK_TIP, condition.detail].filter(Boolean).join(" ");
      under.push({
        kind: "legacy", id, words: condition.words, tip: { title: "Din link", text: tip },
        ...(condition.retarget ? { link: { label: condition.retarget.label, glyph: "›" as const, href: askLink(condition.retarget.spec as QuestionSpec) } } : {}),
      });
    }
  }

  return {
    sentence, presentation, windows, invites, rows, under, removals, refused, advanced,
    waiting: trendMonthsWaiting(spec, ctx),
    scopeLine: entry?.scopeLine(spec, ctx) === "historical-da",
  };
}

/** The population's exclusions alone ("Fără X"): what is left when its precise selection is removed. */
export function onlyExclusions(population: QueryPopulation | undefined): QueryPopulation | undefined {
  if (!population) return undefined;
  const { excluded, rest } = splitExcluded(population);
  if (!excluded.length) return undefined;
  const groups = population.groups.filter((group) => !rest?.groups.includes(group));
  return groups.length ? { operator: "and", groups } : undefined;
}

/** The population without some labelled exclusions (the chip's ×): lib/ask/filters/exclusions.ts. */
export { withoutExclusions } from "../../../lib/ask/filters/exclusions";
