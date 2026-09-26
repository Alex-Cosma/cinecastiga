import { describe, expect, it } from "vitest";
import { executeMonitoringStages, MONITORING_STAGES, type MonitoringStage } from "./pipeline.js";

function fixture(run: (name: MonitoringStage) => Promise<unknown>) {
  return Object.fromEntries(MONITORING_STAGES.map(name => [name, () => run(name)])) as Record<MonitoringStage, () => Promise<unknown>>;
}
describe("coordinated monitoring refresh", () => {
  it("waits for each dependency and records every completed stage", async () => {
    const visited: string[] = [];
    let active = false;
    const report = await executeMonitoringStages(fixture(async name => {
      expect(active).toBe(false); active = true;
      await Promise.resolve(); visited.push(name); active = false;
      return name === "normalize" ? { quarantined: 0 } : { complete: true };
    }));
    expect(visited).toEqual(MONITORING_STAGES);
    expect(Object.keys(report)).toEqual(MONITORING_STAGES);
  });
  it("stops after a failed builder without attempting dependent publication stages", async () => {
    const visited: string[] = [];
    await expect(executeMonitoringStages(fixture(async name => {
      visited.push(name); if (name === "ted-mart") throw new Error("fixture failure");
    }))).rejects.toThrow("fixture failure");
    expect(visited).toEqual(["normalize", "reconcile", "ted-mart"]);
  });
  it("does not publish a normalization run which quarantined new records", async () => {
    const visited: string[] = [];
    await expect(executeMonitoringStages(fixture(async name => {
      visited.push(name); return { quarantined: 1 };
    }))).rejects.toThrow("quarantined records");
    expect(visited).toEqual(["normalize"]);
  });
});
