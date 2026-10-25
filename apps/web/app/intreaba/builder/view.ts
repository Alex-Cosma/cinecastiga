import { BLOCK_FILTERS } from "../../../lib/ask/filters/blocks";
import { filterContext } from "../../../lib/ask/filters/context";
import { describeConditions, type ConditionLabels } from "../../../lib/ask/filters/describe";
import { advancedConditions, legacyConditions, type LegacyCondition } from "../../../lib/ask/filters/legacy-conditions";
import { exclusionWords, splitExcluded, type Excluded } from "../../../lib/ask/filters/origin";
import { conditionSet, FILTERS } from "../../../lib/ask/filters/registry";
import { presentationTokens, sentenceTokens, type SentenceSlot, type SentenceToken } from "../../../lib/ask/filters/sentence";
import type { FilterCtx, FilterId, FilterSpec, Slot } from "../../../lib/ask/filters/types";
import { employeesOnBands } from "../../../lib/ask/filters/words";
import type { QueryPopulation } from "../../../lib/ask/population";
import { KIND_WORDS, cloneQuestion, countyWords, type QuestionSpec } from "../../../lib/ask/question-ui";
import type { SentenceToken as KitToken } from "./kit-types";
import type { UnderChipItem } from "./UnderChips";

/*
 * What the builder draws for a draft (plan §2.3, kit P1–P9): the registry
 * (BLOCK_FILTERS, sentence.ts, legacyConditions) mapped onto the kit's props in
 * one place, as MAPPING.md lists them. Pure: QuestionBuilder renders it and
 * the windows (BuilderWindow) open what `windows` names. Every control opens a
 * window keyed here: "s:" a phrase of the sentence, "p:" of the presentation
 * line, "i:" an invitation, "r:" a chip of a condition row, "x:" a collapsed
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

/** What × under the sentence removes: a link's condition, some exclusions, or a "Selecție avansată" key. */
export type UnderRemoval =
  | { kind: "link"; condition: LegacyCondition }
  | { kind: "exclusion"; excluded: Excluded[] }
  | { kind: "advanced"; key: "population" | "minimumRecords" };

export interface RowChipView { key: string; id: FilterId; label: string; name: string; active: boolean }
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
export interface StripPatch { seq: number; path: "dataset" | "measure"; value: string }

/** The draft after a strip change: only that key, as the applied question got it. */
export function patchDraft(draft: QuestionSpec, patch: Pick<StripPatch, "path" | "value">): QuestionSpec {
  const next = cloneQuestion(draft);
  if (patch.path === "dataset") next.dataset = patch.value;
  else next.measure = patch.value;
  return next;
}

/** The registry's slot of a phrase: its filter, picker and what its window also writes (sentence.ts sentenceSlots). */
export const phraseSlot = (token: SentenceSlot): Slot => ({
  id: token.filter, ...(token.picker ? { picker: token.picker } : {}), ...(token.writes ? { writes: token.writes } : {}),
  ...(token.required ? { required: true as const } : {}),
});

const LINK_TIP = "Condiție dintr-un link mai vechi; se aplică la fel. Nu se mai alege aici.";
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
    if (token.kind === "fixed") return { kind: "fixed", text: token.text };
    const key = `${prefix}${token.id}`;
    windows[key] = { key, slot: phraseSlot(token), title: token.window, name: token.slot };
    return { kind: "slot", id: key, slot: token.slot, value: token.value };
  });
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
      return { key, id: slot.id, label: shown ? rowChipLabel(spec, slot, described) : name, name, active: shown };
    }),
  }));

  const advanced = entry?.advanced(spec, ctx) ?? [];
  if (advanced.length) windows.advanced = { key: "advanced", slot: advanced[0]!, title: "Selecție avansată", name: "Selecție avansată" };

  // P4, in the kit's order (UnderChips sorts): "Selecție avansată: …", exclusions, a link's and another page's conditions.
  const under: UnderChipItem[] = [];
  const removals: Record<string, UnderRemoval> = {};
  const conditions = legacyConditions(spec, labels);
  const refused = conditions.filter((c) => c.status === "refused");
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
      const tip = reason ?? [LINK_TIP, condition.detail].filter(Boolean).join(" ");
      under.push({ kind: "legacy", id, words: condition.words, tip: { title: "Din link", text: tip } });
    }
  }

  return {
    sentence, presentation, windows, invites, rows, under, removals, refused, advanced,
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

/** The population without some labelled exclusions: their values leave the `not_in` lists; an empty list, group or population goes. */
export function withoutExclusions(population: QueryPopulation | undefined, excluded: readonly Pick<Excluded, "field" | "value">[]): QueryPopulation | undefined {
  if (!population) return undefined;
  const gone = (field: string, value: string) => excluded.some((e) => e.field === field && e.value === value);
  const groups = population.groups.map((group) => ({
    ...group,
    conditions: group.conditions.flatMap((c) => {
      if (!("values" in c) || c.op !== "not_in") return [c];
      const keep = c.values.map((value, i) => ({ value, label: c.labels?.[i] })).filter((v) => !gone(c.field, v.value));
      if (!keep.length) return [];
      return [{ ...c, values: keep.map((v) => v.value), ...(c.labels ? { labels: keep.map((v) => v.label!) } : {}) }];
    }),
  })).filter((group) => group.conditions.length);
  return groups.length ? { operator: population.operator, groups } : undefined;
}
