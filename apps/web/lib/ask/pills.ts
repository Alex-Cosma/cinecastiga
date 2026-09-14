import type { AskSpec } from "./spec";
import type { Grounding } from "./ground";

/** The "am înțeles" pills — the spec, restated in plain Romanian. */

const BLOCK_LABEL: Record<AskSpec["block"], string> = {
  table: "clasament",
  stat: "total",
  timeseries: "evoluție pe ani",
  map: "pe județe (hartă)",
  compare: "comparație",
  distribution: "poziție în distribuția de risc",
  breakdown: "compoziție pe categorii",
  scatter: "risc vs volum (outlieri)",
  sankey: "fluxul banilor",
  network: "rețea de parteneri",
  entity_card: "entitate-superlativ",
  fact_check: "verificare Da/Nu",
  trend: "schimbare între ani",
};

const DIM_LABEL = {
  authority: "autorități",
  supplier: "furnizori",
  county: "județe",
} as const;

const KIND_LABEL = {
  comuna: "doar comune",
  oras_municipiu: "doar orașe/municipii",
  consiliu_judetean: "doar consilii județene",
  spital: "doar spitale",
  scoala: "doar școli/licee",
} as const;

/** Blocks whose subject is risk (CRI), not money — skip the measure pill. */
const RISK_BLOCKS: AskSpec["block"][] = ["distribution", "scatter", "compare"];

export function buildPills(spec: AskSpec, grounding: Grounding): string[] {
  const pills: string[] = [];
  pills.push(BLOCK_LABEL[spec.block]);
  if (spec.block === "table" || spec.block === "trend") {
    pills.push(`top ${spec.topN ?? 10} ${DIM_LABEL[spec.dim ?? "authority"]}`);
  }
  if (spec.block === "entity_card") {
    pills.push(
      (spec.rankBy ?? "risk") === "risk" ? "cea mai riscantă (CRI)" : "cea mai mare cheltuială",
    );
    pills.push(DIM_LABEL[spec.dim ?? "authority"]);
  }
  if (!RISK_BLOCKS.includes(spec.block) && spec.block !== "entity_card" && spec.block !== "fact_check") {
    pills.push(
      spec.measure === "count"
        ? "număr de achiziții"
        : spec.measure === "value_per_capita"
          ? "lei / cap de locuitor"
          : "Σ valoare (lei)",
    );
  }
  if (grounding.cpv && grounding.cpv.prefixes.length > 0) {
    const names = grounding.cpv.matchedNames;
    if (names.length === 0) pills.push(`CPV ${grounding.cpv.prefixes.join(", ")}`);
    else pills.push(names.length <= 2 ? names.join(" + ") : `${names[0]} +${names.length - 1} CPV`);
  }
  if (spec.filters.authorityKind) pills.push(KIND_LABEL[spec.filters.authorityKind]);
  if (grounding.authority?.nameDisplay) pills.push(grounding.authority.nameDisplay);
  if (grounding.supplier?.nameDisplay) pills.push(grounding.supplier.nameDisplay);
  if (grounding.compare?.nameDisplay) pills.push(`vs ${grounding.compare.nameDisplay}`);
  if (grounding.uat) {
    pills.push(spec.filters.uatName ?? grounding.uat.name ?? `UAT ${grounding.uat.siruta}`);
  }
  if (grounding.county?.canonical) pills.push(`județul ${grounding.county.canonical}`);
  if (grounding.admin?.personKey && grounding.admin.display)
    pills.push(`conduse de ${grounding.admin.display}`);
  if (spec.filters.yearFrom || spec.filters.yearTo) {
    const f = spec.filters.yearFrom;
    const t = spec.filters.yearTo;
    // month-granular deep links: "2022-12" instead of "2022"
    const mm = (y: number | undefined, m: number | undefined) =>
      y === undefined ? null : m ? `${y}-${String(m).padStart(2, "0")}` : String(y);
    const from = mm(f, spec.filters.monthFrom);
    const to = mm(t, spec.filters.monthTo);
    pills.push(
      spec.block === "trend"
        ? `${from ?? "?"} → ${to ?? "?"}`
        : from && to && from !== to
          ? `${from}–${to}`
          : (from ?? to)!,
    );
  } else if (!RISK_BLOCKS.includes(spec.block) && spec.block !== "entity_card") {
    pills.push("2018–2026");
  }
  if (spec.filters.singleBidder) pills.push("un singur ofertant");
  {
    const mn = spec.filters.minEmployees;
    const mx = spec.filters.maxEmployees;
    if (mn !== undefined && mx !== undefined) pills.push(`${mn}–${mx} angajați`);
    else if (mx !== undefined) pills.push(mx === 0 ? "fără angajați" : `cel mult ${mx} angajați`);
    else if (mn !== undefined) pills.push(`cel puțin ${mn} angajați`);
  }
  const ds = spec.dataset ?? "all";
  pills.push(
    ds === "contracts"
      ? "doar contracte prin proceduri"
      : ds === "da"
        ? "doar achiziții directe"
        : "toate sursele: achiziții directe + contracte prin proceduri",
  );
  return pills;
}
