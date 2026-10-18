export const MONITORING_STAGES = ["normalize", "money-quality", "identity-repair", "identity-quality", "reconcile", "ted-mart", "marts", "flags", "flag-marts", "transactions", "radiografie", "coverage"] as const;
export type MonitoringStage = typeof MONITORING_STAGES[number];
export type RefreshScope = "daily" | "full";
/** Production ceiling for records left in quarantine while publication continues
 * (owner decision, 18 October 2026). Each record stays out of core with its last
 * good version and is retried on every run; more at once points to a parser or
 * source-format change, which still stops the run. */
export const MAX_QUARANTINED_RECORDS = 20;

/** Sequential by design: these builders depend on earlier separately committed stages. */
export async function executeMonitoringStages(stages: Record<MonitoringStage, () => Promise<unknown>>, log: (message: string) => void = () => {}, options: {
  scope?: RefreshScope;
  onStage?: (name: MonitoringStage) => Promise<void>;
  maxQuarantined?: number;
} = {}) {
  const reports: Record<string, unknown> = {};
  for (const name of MONITORING_STAGES) {
    if (options.scope === "daily" && (name === "flags" || name === "flag-marts")) continue;
    await options.onStage?.(name);
    log(`monitoring refresh: ${name}`);
    reports[name] = await stages[name]();
    const quarantined = name === "normalize" ? Number((reports[name] as { quarantined?: number } | undefined)?.quarantined ?? 0) : 0;
    if (quarantined > (options.maxQuarantined ?? 0)) {
      throw new Error("Normalization quarantined records; resolve them before publishing a monitoring checkpoint");
    }
    if (quarantined) log(`normalize: ${quarantined} quarantined records left out of this publication; they are retried on the next run`);
  }
  return reports;
}
