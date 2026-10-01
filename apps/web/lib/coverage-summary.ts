import type { AskSpec } from "./ask/spec";
import { isHistoricalProfile } from "./ask/population";

export const COVERAGE_LABELS = {
  da: "Achiziții directe",
  contracts: "Contracte prin proceduri",
  ted: "Publicații TED · separat de totaluri",
};
export type CoverageSource = keyof typeof COVERAGE_LABELS;
export interface PublicCoverage {
  sources: { dataset: CoverageSource; from: string | null; to: string | null; inventoriedAt: string }[];
  dataAt: string | null;
  riskAt: string | null;
}

/** Source dates are calendar days, publication timestamps use Romania's time zone. */
export function sourceDay(value: string | null): string {
  const day = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return day ? `${day[3]}.${day[2]}.${day[1]}` : "dată necunoscută";
}
export function publicationDay(value: string | null): string {
  if (!value || Number.isNaN(Date.parse(value))) return "dată necunoscută";
  return new Intl.DateTimeFormat("ro-RO", { timeZone: "Europe/Bucharest", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

export function coverageSources(spec?: AskSpec): CoverageSource[] {
  if (!spec) return ["da", "contracts", "ted"];
  if (isHistoricalProfile(spec)) return ["da"];
  return spec.dataset === "da" || spec.dataset === "contracts" ? [spec.dataset] : ["da", "contracts"];
}
