import { describe, expect, it } from "vitest";
import { executeMonitoringStages, MONITORING_STAGES, type MonitoringStage } from "./pipeline.js";

function fixture(run: (name: MonitoringStage) => Promise<unknown>) {
  return Object.fromEntries(MONITORING_STAGES.map(name => [name, () => run(name)])) as Record<MonitoringStage, () => Promise<unknown>>;
}
describe("coordinated monitoring refresh", () => {
  it('blocks every dependent stage if currency integrity fails, including on daily runs', async () => {
    const visited: string[] = [];
    await expect(executeMonitoringStages(fixture(async name => {
      visited.push(name);
      if (name === 'money-quality') throw Error('Currency integrity failed');
      return { quarantined: 0 };
    }), () => {}, {scope:'daily'})).rejects.toThrow('Currency integrity failed');
    expect(visited).toEqual(['normalize','money-quality']);
  });
  it.each(['daily','full'] as const)('blocks TED and publication when approved identities change (%s)',async scope=>{
    const visited:string[]=[];
    await expect(executeMonitoringStages(fixture(async name=>{
      visited.push(name);if(name==='identity-quality')throw Error('Identity requires review');return {quarantined:0};
    }),()=>{},{scope})).rejects.toThrow('Identity requires review');
    expect(visited).toEqual(['normalize','money-quality','identity-repair','identity-quality']);
  });
  it("daily runs retain risk tables and still rebuild Radiografie, coverage and statistics", async () => {
    const visited:string[]=[];
    const stages:string[]=[];
    const report=await executeMonitoringStages(fixture(async name=>{visited.push(name);return {quarantined:0};}),()=>{},
      {scope:'daily',onStage:async name=>{stages.push(name);}});
    expect(visited).toEqual(['normalize','money-quality','identity-repair','identity-quality','reconcile','ted-mart','marts','transactions','radiografie','coverage']);
    expect(stages).toEqual(visited);expect(report).not.toHaveProperty('flags');expect(report).not.toHaveProperty('flag-marts');
  });
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
    expect(visited).toEqual(["normalize", "money-quality", "identity-repair", "identity-quality", "reconcile", "ted-mart"]);
  });
  it("does not publish a normalization run which quarantined new records", async () => {
    const visited: string[] = [];
    await expect(executeMonitoringStages(fixture(async name => {
      visited.push(name); return { quarantined: 1 };
    }))).rejects.toThrow("quarantined records");
    expect(visited).toEqual(["normalize"]);
  });
});
