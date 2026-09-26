import { describe, expect, it, vi } from "vitest";
import { sameTedLotIdentities, tryReplaceTedAmounts } from "../src/normalize/ted-load.js";
import { replayErrorDetails, replayRetryable, retryReplayTransaction, runReplayQueue } from "../src/normalize/ted-replay.js";
import type { CoreDb } from "../src/normalize/context.js";

describe("selective TED replay safety", () => {
  it("permits only the identical unique lot set for the F03 amount-only path", () => {
    expect(sameTedLotIdentities(["A", "B"], ["B", "A"])).toBe(true);
    expect(sameTedLotIdentities([], [])).toBe(true);
    expect(sameTedLotIdentities(["A", "B"], ["A", "C"])).toBe(false);
    expect(sameTedLotIdentities(["A"], ["A", "B"])).toBe(false);
    expect(sameTedLotIdentities(["A", "B"], ["A", "A"])).toBe(false);
    expect(sameTedLotIdentities(["A", "A"], ["A", "A"])).toBe(false);
  });
  it("falls back before any mutation if existing identities or cardinality differ", async () => {
    const mutate = vi.fn(() => { throw new Error("must not write"); });
    const tx = { select: () => ({ from: () => ({ where: async () => [{ id: 1n, lotId: "A" }] }) }),
      insert: mutate, update: mutate, delete: mutate } as unknown as CoreDb;
    expect(await tryReplaceTedAmounts(tx, 1n, [{ tedNoticeId: 1n, lotId: "B" }])).toBe(false);
    expect(await tryReplaceTedAmounts(tx, 1n, [])).toBe(false);
    expect(mutate).not.toHaveBeenCalled();
  });
  it("falls back before mutation when an existing contract date differs", async () => {
    const mutate = vi.fn(() => { throw new Error("must not write"); });
    const tx = { select: () => ({ from: () => ({ where: async () => [{ id: 1n, lotId: "A", contractDate: new Date("2026-01-01Z") }] }) }),
      insert: mutate, update: mutate, delete: mutate } as unknown as CoreDb;
    expect(await tryReplaceTedAmounts(tx, 1n, [{ tedNoticeId: 1n, lotId: "A", contractDate: new Date("2026-02-01Z") }], true)).toBe(false);
    expect(await tryReplaceTedAmounts(tx, 1n, [{ tedNoticeId: 1n, lotId: "A", contractDate: null }], true)).toBe(false);
    expect(mutate).not.toHaveBeenCalled();
  });
  it("bounds concurrency and awaits every notice before returning", async () => {
    let active = 0, peak = 0;
    const done: number[] = [];
    await runReplayQueue([1, 2, 3, 4, 5, 6], 2, async (id) => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 2));
      done.push(id); active--;
    });
    expect(peak).toBe(2);
    expect(active).toBe(0);
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("stops scheduling after failure, settles active work and resumes remaining notices", async () => {
    const committed = new Set<number>();
    const started: number[] = [];
    await expect(runReplayQueue([1, 2, 3, 4], 2, async (id) => {
      started.push(id);
      await new Promise((r) => setTimeout(r, id === 1 ? 1 : 5));
      if (id === 1) throw new Error("bad source");
      committed.add(id);
    })).rejects.toThrow("bad source");
    expect(started).toEqual([1, 2]);
    expect([...committed]).toEqual([2]);
    await runReplayQueue([1, 2, 3, 4].filter((id) => !committed.has(id)), 2, async (id) => { committed.add(id); });
    expect([...committed].sort()).toEqual([1, 2, 3, 4]);
  });
  it("retries rolled-back deadlocks/serialization failures, including wrapped errors, with a finite bound", async () => {
    expect(replayRetryable({ cause: { code: "40P01" } })).toBe(true);
    expect(replayRetryable({ code: "40001" })).toBe(true);
    expect(replayRetryable({ code: "08006" })).toBe(false);
    let attempts = 0;
    const wait = vi.fn(async () => {});
    expect(await retryReplayTransaction(async () => {
      if (++attempts < 3) throw { cause: { code: "40P01" } };
      return "committed";
    }, wait)).toBe("committed");
    expect(attempts).toBe(3);
    expect(wait.mock.calls).toHaveLength(2);
    attempts = 0;
    await expect(retryReplayTransaction(async () => { attempts++; throw { code: "40001" }; }, wait)).rejects.toEqual({ code: "40001" });
    expect(attempts).toBe(4);
  });
  it("reports SQLSTATE and constraint without leaking wrapper SQL or bound values", () => {
    const details = replayErrorDetails({ message: "Failed query: SECRET SQL", params: ["SECRET"],
      cause: { code: "40P01", message: "deadlock detected", detail: "SECRET key values", constraint_name: "some_key" } });
    expect(details).toEqual({ code: "40P01", constraint: "some_key", message: "deadlock detected" });
    expect(JSON.stringify(details)).not.toContain("SECRET");
  });
  it("rejects unbounded concurrency before starting any task", async () => {
    const run = vi.fn(async () => {});
    await expect(runReplayQueue([1], 5, run)).rejects.toThrow("1..4");
    expect(run).not.toHaveBeenCalled();
  });
});
