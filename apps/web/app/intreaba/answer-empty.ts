import type { BlockData } from "../../lib/ask/compile";
import { LEADER_MIN_DAS } from "../../lib/ask/entity-card-shared";
import { BLOCK_FILTERS } from "../../lib/ask/filters/blocks";
import { filterContext } from "../../lib/ask/filters/context";
import { FILTERS } from "../../lib/ask/filters/registry";
import { advancedConditions, legacyConditions, withoutConditions } from "../../lib/ask/filters/legacy-conditions";
import { sentenceTokens } from "../../lib/ask/filters/sentence";
import type { FilterId, FilterSpec } from "../../lib/ask/filters/types";
import { countyIsFirmSeat } from "../../lib/ask/population";
import type { AskSpec } from "../../lib/ask/spec";
import { MAX_RELAX, removeWords } from "./answer/EmptyState";

/*
 * G2, the empty answer (kit component 17, plan §4 preamble): an answer with
 * no record says so and offers at most three ways to widen the question,
 * each named as the first row of its window ("Toți anii", "Orice domeniu",
 * "Toată țara") or "Scoate „…”" for a condition under the sentence. The last
 * conditions go first: the chips under the sentence, then its phrases from
 * the end. Pure: AskPanel runs the wider question.
 */

/** An answer with nothing to show. A verification's "Nu" and a comparison are answers, never empty states. */
export function emptyAnswer(data: BlockData): boolean {
  switch (data.block) {
    case "stat": return data.stat.count === 0;
    case "table": return data.rows.length === 0 && (data.page ?? 0) === 0;
    case "timeseries": return data.series.length === 0;
    case "map": return data.counties.every((c) => c.count === 0) && data.unknown.count === 0;
    case "breakdown": return data.slices.length === 0 && data.other.count === 0;
    // trend-2: empty when the selection is; an empty group of a full selection says so in its own list (TrendAnswer).
    case "trend": return data.composition?.all ? data.composition.all.count === 0 : data.rowsTrend.length === 0;
    // F4: an empty group of a network with partners says so in its own list (NetworkAnswer).
    case "network": return data.lists.all.partners === 0 && data.lists.new.partners + data.lists.continuing.partners + data.lists.gone.partners === 0;
    case "sankey": return data.flows.length === 0;
    case "scatter": return "scatter" in data ? data.scatter.group.n === 0 : data.points.length === 0;
    // „Cine conduce?” (F6c): no firm or institution in the selection, or no profile with enough acquisitions.
    case "entity_card": return data.empty === true;
    default: return false;
  }
}

/**
 * The empty answer's sentence: a risk cloud's group has no profile (final scatter §4.4); „Cine conduce?” (F6c) has
 * no record, or on the index (`profile`) no profile with enough direct acquisitions; the others no record.
 */
export const emptyMessage = (data: BlockData, profile = false): string =>
  data.block === "scatter" ? "Niciun profil în acest grup."
    : data.block === "entity_card" ? profile ? `Niciun profil cu cel puțin ${LEADER_MIN_DAS} de achiziții directe aici.` : "Nicio înregistrare aici."
      : "Nicio înregistrare pentru această întrebare.";

/** The first row of each phrase's window (kit §4), the words of its relaxation. */
const FIRST_ROW: Partial<Record<FilterId, string>> = {
  period: "Toți anii", dataset: "Toate achizițiile", cpvTerm: "Orice domeniu",
  supplier: "Orice firmă", admin: "Orice firmă", employees: "Orice firmă",
  authority: "Toate instituțiile publice", authorityKind: "Toate instituțiile publice", locality: "Toate instituțiile publice",
  county: "Toată țara",
  // The firm's seat (F4): the first row of „Unde au sediul firmele?” is „Oriunde” (F6c: also the index of firms).
  seatCounty: "Oriunde", firmSeat: "Oriunde",
};
/** The question itself, never relaxed: who it is about, what it ranks and how. */
const QUESTION: ReadonlySet<string> = new Set(["focal", "subject"]);

export interface Relax { id: string; label: string; spec: AskSpec }

/** At most three wider questions, the last conditions first. */
export function relaxations(input: AskSpec): Relax[] {
  const spec = input as unknown as FilterSpec;
  const ctx = filterContext(spec);
  const out: Relax[] = [];
  const add = (id: string, label: string, ids: readonly FilterId[]) => {
    if (out.length >= MAX_RELAX || out.some((r) => r.label === label)) return;
    out.push({ id, label, spec: withoutConditions(spec, ids) as unknown as AskSpec });
  };
  for (const c of advancedConditions(spec)) add(`a:${c.key}`, removeWords("Selecție avansată"), [c.key]);
  for (const c of legacyConditions(spec)) if (c.status === "applied") add(`l:${c.key}`, removeWords(c.words), [c.key]);
  // The rows under the sentence are chips too (CÂȘTIGĂTORII: the firms' size; F6c, final entity_card §4 „Scoate „Angajați””).
  for (const row of BLOCK_FILTERS[ctx.block].rows(spec, ctx)) for (const chip of row.chips)
    // A link's own range of employees is already its chip above.
    if (FILTERS[chip.id].read(spec) !== undefined && !out.some((r) => r.id === `l:${chip.id}`)) add(`r:${chip.id}`, removeWords(chip.label ?? FILTERS[chip.id].label), [chip.id]);
  const slots = sentenceTokens(spec, ctx).filter((t) => t.kind === "slot");
  for (const token of [...slots].reverse()) {
    if (token.required || token.picker && QUESTION.has(token.picker) || !token.says.length) continue;
    const id = token.says[0]!;
    if (id === "dataset" && (spec.dataset ?? "all") === "all") continue;
    const label = id === "county" && countyIsFirmSeat(spec, ctx.role) ? "Oriunde" : FIRST_ROW[id];
    if (label) add(`s:${token.id}`, label, token.says);
  }
  return out;
}
