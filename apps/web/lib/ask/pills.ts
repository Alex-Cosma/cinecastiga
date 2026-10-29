import { namedKind, type AskSpec } from "./spec";
import type { Grounding } from "./ground";
import { isHistoricalProfile } from "./population";
import { COUNT_MEASURE_BLOCKS, leaderAxis } from "./question-ui";
import { countWords } from "./answer-text";
import { describeConditions, PROFILE_SOURCE_PILL, type ConditionLabels } from "./filters/describe";
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
  // distribution-2 counts the criteria the entity meets against its group (final distribution §1.1: "spune ce se numără").
  distribution: "criterii de risc față de grup",
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
  return spec.measure === "value_per_capita" && spec.block !== "table" ? "value" : spec.measure;
}

/**
 * `labels.entities`: names of the ids a population lists, where the caller knows them (an entity capture);
 * `labels.executedMonths`: the months a trend's answer counted; `labels.peerGroup`: a distribution's group facts.
 */
export function buildPills(spec: AskSpec, grounding: Grounding, labels: Pick<ConditionLabels, "entities" | "executedMonths" | "peerGroup"> & { scatterGroup?: number } = {}): string[] {
  const pills: string[] = [];
  // An evolution month by month says so in its first pill (F3); its other options are conditions (describe.ts).
  // The risk cloud counts its group first (scatter-2, final scatter §1): „82 de primării de comună”.
  pills.push(spec.block === "timeseries" && spec.timeseries?.grain === "month" ? "evoluție pe luni"
    : spec.block === "scatter" && labels.scatterGroup !== undefined
      ? groupNoun(labels.scatterGroup, spec.dim === "supplier" ? "supplier" : "authority", namedKind(spec.filters.authorityKind))
      : BLOCK_LABEL[spec.block]);
  const dim = DIM_LABEL[spec.dim ?? "authority"];
  // A ranking without topN is the complete one, in pages (compile.ts); a trend shows its first 10.
  if (spec.block === "table" && spec.topN == null) pills.push(dim[2]);
  else if (spec.block === "table" || spec.block === "trend") pills.push(`top ${countWords(spec.topN ?? 10, dim[0], dim[1])}`);
  if (spec.block === "entity_card") {
    pills.push(
      leaderAxis(spec) === "risk" ? "cea mai riscantă (CRI)" : "cea mai mare valoare",
    );
    pills.push(dim[1]);
  }
  if (!isHistoricalProfile(spec) && spec.block !== "fact_check") {
    const measure = shownMeasure(spec);
    // Kit §4 "Măsura": the measure in the words of the presentation line.
    pills.push(
      measure === "count"
        ? "numărul de înregistrări"
        : measure === "value_per_capita"
          ? "valoarea pe locuitor"
          : "valoarea înregistrată",
    );
  }
  pills.push(...describeConditions(spec, { grounding, entities: labels.entities, executedMonths: labels.executedMonths, peerGroup: labels.peerGroup }).pills);
  return pills;
}
