import { LOCAL_ADMIN_KIND, namedKind, type AskSpec } from "./spec";
import type { Grounding } from "./ground";
import { isHistoricalProfile } from "./population";
import { COUNT_MEASURE_BLOCKS, leaderAxis } from "./question-ui";
import { countWords } from "./answer-text";
import { describeConditions, PROFILE_SOURCE_PILL, type ConditionLabels } from "./filters/describe";
import type { FilterId } from "./filters/types";
import { groupNoun } from "./scatter-shared";

/**
 * The "am înțeles" pills — the spec, restated in plain Romanian: the shape of
 * the answer here, then every condition in the words of describeConditions.
 */
export { PROFILE_SOURCE_PILL };

const BLOCK_LABEL: Record<AskSpec["block"], string> = {
  table: "clasament",
  stat: "total",
  timeseries: "evoluție pe ani",
  map: "pe județe (hartă)",
  compare: "comparație",
  // The distribution places the entity's risk score in its group (rf-2026.18; final distribution §1.1: "spune ce se numără").
  distribution: "risc față de grup",
  // Values are recorded, not paid; the cloud plots risk against recorded value.
  breakdown: "pe domenii",
  scatter: "risc și valoare",
  // Recorded, not paid (final sankey §1): what was bought and from whom, never a "flow of money".
  sankey: "pe parteneri și domenii",
  network: "rețea de parteneri",
  // "Cine conduce?": its own short name (kit §4), not the engine's slug.
  entity_card: "locul 1",
  fact_check: "verificare",
  trend: "schimbare între ani",
};

// Kit §4: "instituții" and "instituțiile publice", the words of the sentence.
const DIM_LABEL = {
  authority: ["instituție", "instituții", "toate instituțiile publice"],
  supplier: ["furnizor", "furnizori", "toți furnizorii"],
  county: ["județ", "județe", "toate județele"],
} as const;

/** What the answer measures: elsewhere the engine ignores `measure` and answers in lei. */
function shownMeasure(spec: AskSpec): AskSpec["measure"] {
  if (!COUNT_MEASURE_BLOCKS.includes(spec.block)) return "value";
  // Per inhabitant: a ranking of institutions, and the map of the local administrations (F5, map final §3.8).
  const perCapita = spec.block === "table" || spec.block === "map" && spec.filters.authorityKind === LOCAL_ADMIN_KIND;
  return spec.measure === "value_per_capita" && !perCapita ? "value" : spec.measure;
}

/** A pill and the filter it states (null: the answer's shape, which no window changes). */
export interface PillPart { text: string; filter: FilterId | null }

/**
 * The answer's own pills, before its conditions: its shape, its list and its measure. Their number depends on the
 * spec alone (the answer head maps the server's pills to their windows from it: pill-filters.ts).
 */
export function ownPills(spec: AskSpec, labels: { scatterGroup?: number } = {}): PillPart[] {
  const pills: PillPart[] = [];
  // An evolution month by month says so in its first pill (F3); its other options are conditions (describe.ts).
  // The risk cloud counts its group first (scatter-2, final scatter §1): „82 de primării de comună”, the subject's words.
  const group = spec.block === "scatter" && labels.scatterGroup !== undefined;
  pills.push({
    text: spec.block === "timeseries" && spec.timeseries?.grain === "month" ? "evoluție pe luni"
      // entity_card (F6c): the podium by value; the first profiles by the risk score (entity_card-3, rf-2026.18).
      : spec.block === "entity_card" ? (leaderAxis(spec) === "risk" ? "primii după risc" : "locurile 1–3")
        : group ? groupNoun(labels.scatterGroup!, spec.dim === "supplier" ? "supplier" : "authority", namedKind(spec.filters.authorityKind))
          : BLOCK_LABEL[spec.block],
    filter: group ? "dim" : null,
  });
  const dim = DIM_LABEL[spec.dim ?? "authority"];
  // A ranking without topN is the complete one, in pages (compile.ts); a trend shows its first 10.
  if (spec.block === "table" && spec.topN == null) pills.push({ text: dim[2], filter: "topN" });
  else if (spec.block === "table" || spec.block === "trend") pills.push({ text: `top ${countWords(spec.topN ?? 10, dim[0], dim[1])}`, filter: "topN" });
  if (spec.block === "entity_card") {
    pills.push({ text: leaderAxis(spec) === "risk" ? "cel mai ridicat risc" : "cea mai mare valoare", filter: "rankBy" });
    pills.push({ text: dim[1], filter: "dim" });
  }
  if (!isHistoricalProfile(spec) && spec.block !== "fact_check") {
    const measure = shownMeasure(spec);
    // Kit §4 "Măsura": the measure in the words of the presentation line.
    pills.push({
      text: measure === "count"
        ? "numărul de înregistrări"
        : measure === "value_per_capita"
          ? "valoarea pe locuitor"
          : "valoarea înregistrată",
      filter: "measure",
    });
  }
  return pills;
}

/**
 * `labels.entities`: names of the ids a population lists, where the caller knows them (an entity capture);
 * `labels.executedMonths`: the months a trend's answer counted; `labels.peerGroup`: a distribution's group facts.
 */
export function buildPills(spec: AskSpec, grounding: Grounding, labels: Pick<ConditionLabels, "entities" | "executedMonths" | "peerGroup"> & { scatterGroup?: number } = {}): string[] {
  return [
    ...ownPills(spec, labels).map((pill) => pill.text),
    ...describeConditions(spec, { grounding, entities: labels.entities, executedMonths: labels.executedMonths, peerGroup: labels.peerGroup }).pills,
  ];
}
