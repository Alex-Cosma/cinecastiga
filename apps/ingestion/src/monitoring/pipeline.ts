export const MONITORING_STAGES = ["normalize", "reconcile", "ted-mart", "marts", "flags", "flag-marts", "radiografie", "coverage"] as const;
export type MonitoringStage = typeof MONITORING_STAGES[number];

/** Sequential by design: these builders depend on earlier separately committed stages. */
export async function executeMonitoringStages(stages: Record<MonitoringStage, () => Promise<unknown>>, log: (message: string) => void = () => {}) {
  const reports: Record<string, unknown> = {};
  for (const name of MONITORING_STAGES) {
    log(`monitoring refresh: ${name}`);
    reports[name] = await stages[name]();
    if (name === "normalize" && Number((reports[name] as { quarantined?: number } | undefined)?.quarantined ?? 0) > 0) {
      throw new Error("Normalization quarantined records; resolve them before publishing a monitoring checkpoint");
    }
  }
  return reports;
}
