export const MONITORING_STAGES = ["normalize", "money-quality", "identity-repair", "identity-quality", "reconcile", "ted-mart", "marts", "flags", "flag-marts", "transactions", "radiografie", "coverage"] as const;
export type MonitoringStage = typeof MONITORING_STAGES[number];
export type RefreshScope = "daily" | "full";

/** Sequential by design: these builders depend on earlier separately committed stages. */
export async function executeMonitoringStages(stages: Record<MonitoringStage, () => Promise<unknown>>, log: (message: string) => void = () => {}, options: {
  scope?: RefreshScope;
  onStage?: (name: MonitoringStage) => Promise<void>;
} = {}) {
  const reports: Record<string, unknown> = {};
  for (const name of MONITORING_STAGES) {
    if (options.scope === "daily" && (name === "flags" || name === "flag-marts")) continue;
    await options.onStage?.(name);
    log(`monitoring refresh: ${name}`);
    reports[name] = await stages[name]();
    if (name === "normalize" && Number((reports[name] as { quarantined?: number } | undefined)?.quarantined ?? 0) > 0) {
      throw new Error("Normalization quarantined records; resolve them before publishing a monitoring checkpoint");
    }
  }
  return reports;
}
