import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DbSql } from "@seap/db";

// F0a: watches and captures run later, on whatever code is deployed. What a
// newer release stored is refused with the reason, never run without the condition.
const { calls, db, state } = vi.hoisted(() => {
  const calls: { text: string; values: unknown[] }[] = [];
  const state: { watch: Record<string, unknown> } = { watch: {} };
  const db = Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("pg_try_advisory_xact_lock")) return Promise.resolve([{ locked: true }]);
    if (text.includes("select * from app.monitoring_watches where id=")) return Promise.resolve([state.watch]);
    return Promise.resolve([]);
  }, { array: (values: unknown[]) => values });
  return { calls, db, state };
});
vi.mock("@seap/db", async (original) => ({ ...await original<typeof import("@seap/db")>(),
  withMonitoringSnapshot: async (_sql: unknown, work: (q: unknown, checkpoint: unknown) => unknown) =>
    work(db, { id: "checkpoint-2", version: "2", methodology: {} }) }));
import { evaluateMonitoringWatch } from "./monitoring-engine";
import { MEMBERS_MISMATCH, MONITORING_MEMBERS_MAX, monitoringMembers, monitoringScope } from "./monitoring-input";
import { validateCaptureRequest } from "./evidence-capture-input";
import { NEWER_VERSION_QUESTION } from "./ask/spec";

const stat = { block: "stat", measure: "value", filters: { authorityId: 12 } };
const newer = { ...stat, filters: { ...stat.filters, newSince: 2024 } };
const members = { kind: "trend-group", role: "supplier", group: "new", ids: ["13", "14"], frozenAt: "2026-10-24T10:00:00Z" };
// A network's fixed group comes with F4 (read ahead); a trend's is applied since F2.
const network = { ...members, kind: "network-group", role: "authority", group: "continuing" };
const trendNew = { block: "trend", measure: "value", dim: "supplier", filters: { yearFrom: 2024, yearTo: 2025 }, trend: { change: "new" } };
const thrown = (run: () => unknown) => { try { run(); } catch (error) { return error as Error & { status?: number }; } throw new Error("did not throw"); };

describe("watches", () => {
  beforeEach(() => { calls.length = 0; });

  it("refuses to create a watch on a newer question, on a network's group, or on a group its question does not list", () => {
    expect(thrown(() => monitoringScope({ spec: newer }))).toMatchObject({ message: NEWER_VERSION_QUESTION, status: 422 });
    expect(thrown(() => monitoringScope({ spec: stat, options: { members: network } }))).toMatchObject({ message: NEWER_VERSION_QUESTION, status: 422 });
    expect(thrown(() => monitoringScope({ spec: stat, options: { members } }))).toMatchObject({ message: MEMBERS_MISMATCH, status: 422 });
    expect(thrown(() => monitoringScope({ spec: { ...trendNew, trend: { change: "up" } }, options: { members } }))).toMatchObject({ message: MEMBERS_MISMATCH, status: 422 });
    expect(thrown(() => monitoringScope({ spec: { ...trendNew, dim: "authority" }, options: { members } }))).toMatchObject({ message: MEMBERS_MISMATCH, status: 422 });
    expect(monitoringScope({ spec: stat })).toEqual({ spec: stat, options: {} });
    expect(monitoringScope({ spec: trendNew, options: { members } })).toEqual({ spec: trendNew, options: { members } });
    // F3's keys are this release's: a watch keeps them (a procedure brings the contracts, as parseSpec reads it).
    const f3 = { ...stat, dataset: "contracts", filters: { ...stat.filters, purchaseKind: "lucrari", procedure: "deschisa", purchaseValueMin: 1_000_000 } };
    expect(monitoringScope({ spec: f3 })).toEqual({ spec: f3, options: {} });
    expect(validateCaptureRequest("query", null, f3, null)).not.toHaveProperty("error");
  });

  it.each([
    [{ ...members, extra: 1 }, "Grupa urmărită conține un câmp necunoscut."],
    [{ ...members, kind: "cohort" }, "Grupa urmărită nu este validă."],
    [{ ...members, kind: "network-group", role: "county", group: "new" }, "Grupa urmărită nu este validă."],
    [{ ...members, group: "all" }, "Grupa urmărită nu este validă."],
    [{ ...members, frozenAt: "ieri" }, "Grupa urmărită nu este validă."],
    [{ ...members, ids: [] }, "Grupa urmărită nu este validă."],
    [{ ...members, ids: ["13", "1);drop"] }, "Grupa urmărită conține un identificator invalid."],
    [{ ...members, ids: Array.from({ length: MONITORING_MEMBERS_MAX + 20 }, (_, i) => String(i + 1)) }, "Grupa are 5.020 de firme (cel mult 5.000); restrânge perioada sau locul."],
  ])("parses the shape of a fixed group (%#)", (value, message) => {
    expect(thrown(() => monitoringMembers(value))).toHaveProperty("message", message);
  });

  it("reads a well-formed group of each kind", () => {
    expect(monitoringMembers({ ...members, ids: ["13", "13", "14"] })).toEqual(members);
    expect(monitoringMembers({ ...members, kind: "network-group", role: "authority", group: "continuing" })).toMatchObject({ group: "continuing" });
    expect(monitoringMembers({ ...members, role: "county", ids: ["Cluj", "Buzău"] })).toMatchObject({ ids: ["Cluj", "Buzău"] });
  });

  it.each([
    ["a key this release does not apply", { spec: newer, options: {} }],
    ["a network's fixed group", { spec: stat, options: { members: network } }],
  ])("keeps the last good result of a stored watch with %s and says why", async (_case, stored) => {
    state.watch = { id: "watch-1", paused: false, last_success_run_id: null, grounding: {}, preferences: { types: ["added"], minimumValueExact: "0", digest: false }, ...stored };
    await expect(evaluateMonitoringWatch("watch-1", undefined, db as unknown as DbSql)).rejects.toMatchObject({ message: NEWER_VERSION_QUESTION, status: 422 });
    const failure = calls.find(call => call.text.includes("set last_error="));
    expect(failure?.values[0]).toBe(NEWER_VERSION_QUESTION);
    expect(calls.some(call => /insert into app\.monitoring_runs|last_success_run_id=/.test(call.text))).toBe(false);
  });
});

describe("captures", () => {
  it("refuses to queue a newer question, which would run later without the condition", () => {
    expect(validateCaptureRequest("query", null, newer, null)).toEqual({ error: NEWER_VERSION_QUESTION });
    expect(validateCaptureRequest("query", null, stat, null)).toMatchObject({ kind: "query", spec: stat });
  });
});
