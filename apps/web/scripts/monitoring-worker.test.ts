import { describe, expect, it } from "vitest";
import { monitoringWorkerOptions, runMonitoringWorker, type MonitoringWorkerReport } from "./monitoring-worker";

const report: MonitoringWorkerReport = { checkpointId: "private-id", selected: 1, completed: 1, failed: 0, skipped: 0, moreMayRemain: false };
describe("isolated monitoring worker", () => {
  it("polls every minute by default and validates bounded settings", () => {
    expect(monitoringWorkerOptions([])).toEqual({ intervalMs: 60_000, limit: 100, once: false });
    expect(monitoringWorkerOptions(["--once", "--interval-seconds=5", "--limit=2"])).toEqual({ intervalMs: 5000, limit: 2, once: true });
    for (const arg of ["--send", "--limit=0", "--interval-seconds=0", "--limit=1.5"]) expect(() => monitoringWorkerOptions([arg])).toThrow();
  });
  it("waits until a check settles before polling again and stops on a signal", async () => {
    const controller = new AbortController(), sequence: string[] = [];
    let active = false, calls = 0;
    await runMonitoringWorker({ intervalMs: 60_000, limit: 100, once: false }, {
      check: async () => { expect(active).toBe(false); active = true; sequence.push("start"); await Promise.resolve(); active = false; sequence.push("complete"); if (++calls === 2) controller.abort(); return report; },
      log: () => {}, wait: async milliseconds => { expect(milliseconds).toBe(60_000); expect(active).toBe(false); sequence.push("wait"); },
    }, controller.signal);
    expect(sequence).toEqual(["start", "complete", "wait", "start", "complete"]);
  });
  it("retries failure without leaking private error context into operational logs", async () => {
    const controller = new AbortController(), events: Record<string, unknown>[] = [];
    let calls = 0;
    const result = await runMonitoringWorker({ intervalMs: 60_000, limit: 100, once: false }, {
      check: async () => { if (++calls === 1) throw new Error("secret watch title and postgres credentials"); controller.abort(); return report; },
      log: event => events.push(event), wait: async () => {},
    }, controller.signal);
    expect(calls).toBe(2); expect(result.failedLastCheck).toBe(false);
    expect(JSON.stringify(events)).not.toMatch(/secret|credentials|private-id/);
    expect(events.map(event => event.event)).toEqual(["monitoring_waiting", "monitoring_check"]);
  });
  it("reports a failed one-shot batch and does not schedule another check", async () => {
    const result = await runMonitoringWorker({ intervalMs: 60_000, limit: 100, once: true }, {
      check: async () => ({ ...report, completed: 0, failed: 1 }), log: () => {}, wait: async () => { throw new Error("unexpected timer"); },
    }, new AbortController().signal);
    expect(result.failedLastCheck).toBe(true);
  });
});
