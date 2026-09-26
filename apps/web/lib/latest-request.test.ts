import { describe, expect, it, vi } from "vitest";
import { createLatestRequest } from "./latest-request";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

describe("entity table request races", () => {
  it("aborts the older transport and never publishes its late result", async () => {
    const latest = createLatestRequest(), first = deferred<string>(), second = deferred<string>();
    const commit = vi.fn(), fail = vi.fn();
    let signal!: AbortSignal;
    latest.run((s) => { signal = s; return first.promise; }, commit, fail);
    latest.run(() => second.promise, commit, fail);
    expect(signal.aborted).toBe(true);
    second.resolve("current filters"); await flush();
    first.resolve("old filters"); await flush();
    expect(commit.mock.calls).toEqual([["current filters"]]);
    expect(fail).not.toHaveBeenCalled();
  });
  it("a late error cannot replace the current result or end its loading state", async () => {
    const latest = createLatestRequest(), first = deferred<string>(), second = deferred<string>();
    const commit = vi.fn(), fail = vi.fn();
    latest.run(() => first.promise, commit, fail);
    latest.run(() => second.promise, commit, fail);
    first.reject(new Error("old failure")); await flush();
    expect(commit).not.toHaveBeenCalled(); expect(fail).not.toHaveBeenCalled();
    second.reject(new Error("current failure")); await flush();
    expect(fail).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: "current failure" }));
  });
  it("unmount cleanup prevents updates, and cleaning an old effect never aborts a newer one", async () => {
    const latest = createLatestRequest(), first = deferred<string>(), second = deferred<string>();
    const commit = vi.fn(), fail = vi.fn();
    const cancelFirst = latest.run(() => first.promise, commit, fail);
    let secondSignal!: AbortSignal;
    const cancelSecond = latest.run((s) => { secondSignal = s; return second.promise; }, commit, fail);
    cancelFirst(); expect(secondSignal.aborted).toBe(false);
    cancelSecond(); expect(secondSignal.aborted).toBe(true);
    first.resolve("old"); second.resolve("unmounted"); await flush();
    expect(commit).not.toHaveBeenCalled(); expect(fail).not.toHaveBeenCalled();
  });
});
