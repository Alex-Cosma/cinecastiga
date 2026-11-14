import { beforeEach, describe, expect, it } from "vitest";
import { cachedRead, clearStatusCache } from "./status-cache";

let clock = 0;
const now = () => clock;
const loader = () => {
  const calls: number[] = [];
  let release: (() => void) | null = null;
  const load = (value: number, gate = false) => () => {
    calls.push(value);
    return gate ? new Promise<number>(resolve => { release = () => resolve(value); }) : Promise.resolve(value);
  };
  return { calls, load, release: () => release?.() };
};

beforeEach(() => { clearStatusCache(); clock = 1_000; });

describe("cachedRead", () => {
  it("reads once, then serves the value while it is fresh", async () => {
    const l = loader();
    expect(await cachedRead("k", 60_000, l.load(1), now)).toEqual({ value: 1, at: 1_000 });
    clock += 59_000;
    expect(await cachedRead("k", 60_000, l.load(2), now)).toEqual({ value: 1, at: 1_000 });
    expect(l.calls).toEqual([1]);
  });

  it("serves a stale value at once and replaces it in the background", async () => {
    const l = loader();
    await cachedRead("k", 60_000, l.load(1), now);
    clock += 61_000;
    expect((await cachedRead("k", 60_000, l.load(2, true), now)).value).toBe(1);
    // a second reader during the background read shares it (no second load)
    expect((await cachedRead("k", 60_000, l.load(3), now)).value).toBe(1);
    l.release();
    await new Promise(r => setTimeout(r, 0));
    expect(await cachedRead("k", 60_000, l.load(4), now)).toEqual({ value: 2, at: 62_000 });
    expect(l.calls).toEqual([1, 2]);
  });

  it("shares the first read between concurrent readers", async () => {
    const l = loader();
    const a = cachedRead("k", 60_000, l.load(1, true), now), b = cachedRead("k", 60_000, l.load(2), now);
    l.release();
    expect((await a).value).toBe(1);
    expect((await b).value).toBe(1);
    expect(l.calls).toEqual([1]);
  });

  it("keeps the old value when a background read fails, and waits once it is far too old", async () => {
    await cachedRead("k", 60_000, () => Promise.resolve(1), now);
    clock += 61_000;
    expect((await cachedRead("k", 60_000, () => Promise.reject(new Error("db")), now)).value).toBe(1);
    await new Promise(r => setTimeout(r, 0));
    expect((await cachedRead("k", 60_000, () => Promise.resolve(2), now)).value).toBe(1);
    await new Promise(r => setTimeout(r, 0));
    clock += 7 * 60_000;
    expect(await cachedRead("k", 60_000, () => Promise.resolve(3), now)).toEqual({ value: 3, at: clock });
  });

  it("lets a failed first read fail and tries again on the next", async () => {
    await expect(cachedRead("k", 60_000, () => Promise.reject(new Error("db")), now)).rejects.toThrow("db");
    expect((await cachedRead("k", 60_000, () => Promise.resolve(5), now)).value).toBe(5);
  });
});
