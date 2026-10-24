import type { AskSpec } from "./spec";
import type { Grounding } from "./ground";
import { isHistoricalProfile } from "./population";
import { COUNT_MEASURE_BLOCKS, leaderAxis } from "./question-ui";
import { countWords } from "./answer-text";
import { describeConditions, PROFILE_SOURCE_PILL } from "./filters/describe";

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
  distribution: "poziție în distribuția de risc",
  // Values are recorded, not paid; the cloud plots risk against recorded value.
  breakdown: "pe domenii",
  scatter: "risc și valoare",
  sankey: "fluxul banilor",
  network: "rețea de parteneri",
  entity_card: "entitate-superlativ",
  fact_check: "verificare Da/Nu",
  trend: "schimbare între ani",
};

const DIM_LABEL = {
  authority: ["autoritate", "autorități"],
  supplier: ["furnizor", "furnizori"],
  county: ["județ", "județe"],
} as const;

/** What the answer measures: elsewhere the engine ignores `measure` and answers in lei. */
function shownMeasure(spec: AskSpec): AskSpec["measure"] {
  if (!COUNT_MEASURE_BLOCKS.includes(spec.block)) return "value";
  return spec.measure === "value_per_capita" && spec.block !== "table" ? "value" : spec.measure;
}

export function buildPills(spec: AskSpec, grounding: Grounding): string[] {
  const pills: string[] = [];
  pills.push(BLOCK_LABEL[spec.block]);
  const dim = DIM_LABEL[spec.dim ?? "authority"];
  if (spec.block === "table" || spec.block === "trend") pills.push(`top ${countWords(spec.topN ?? 10, dim[0], dim[1])}`);
  if (spec.block === "entity_card") {
    pills.push(
      leaderAxis(spec) === "risk" ? "cea mai riscantă (CRI)" : "cea mai mare valoare",
    );
    pills.push(dim[1]);
  }
  if (!isHistoricalProfile(spec) && spec.block !== "fact_check") {
    const measure = shownMeasure(spec);
    pills.push(
      measure === "count"
        ? "număr de achiziții"
        : measure === "value_per_capita"
          ? "lei / cap de locuitor"
          : "Total (lei)",
    );
  }
  pills.push(...describeConditions(spec, { grounding }).pills);
  return pills;
}
