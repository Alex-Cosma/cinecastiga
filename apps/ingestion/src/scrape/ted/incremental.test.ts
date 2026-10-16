import { ScrapeError } from "@seap/scraper-clients";
import type { DbSql } from "@seap/db";
import { describe, expect, it } from "vitest";
import {
  createTedIncrementalClient,
  planTedWindow,
  runTedIncremental,
  TED_INCREMENTAL_DEFAULTS,
  tedIncrementalConfig,
  tedRequester,
  type TedRequestMeter,
} from "./incremental.js";

describe("TED incremental configuration", () => {
  it("is off unless explicitly enabled and validates its bounds", () => {
    expect(tedIncrementalConfig({}).enabled).toBe(false);
    expect(tedIncrementalConfig({ TED_INCREMENTAL: "true" }).enabled).toBe(false);
    const on = tedIncrementalConfig({ TED_INCREMENTAL: " ON ", TED_INCREMENTAL_MAX_REQUESTS: "", TED_INCREMENTAL_MAX_MINUTES: "5" });
    expect(on).toMatchObject({ enabled: true, maxRequests: TED_INCREMENTAL_DEFAULTS.maxRequests, maxRuntimeMs: 300_000, overlapDays: 3 });
    expect(() => tedIncrementalConfig({ TED_INCREMENTAL_MAX_REQUESTS: "0" })).toThrow(/between/);
    expect(() => tedIncrementalConfig({ TED_INCREMENTAL_DELAY_MS: "10" })).toThrow(/between/);
  });
});

describe("TED incremental window", () => {
  const cfg = { overlapDays: 3, maxDaysPerRun: 14 };
  it("re-searches the overlap and stops at yesterday", () => {
    expect(planTedWindow("2026-10-14", "2026-10-16", cfg)).toEqual({ start: "2026-10-12", end: "2026-10-15" });
  });
  it("is empty once the watermark reached yesterday", () => {
    expect(planTedWindow("2026-10-15", "2026-10-16", cfg)).toBeNull();
    expect(planTedWindow("2026-10-20", "2026-10-16", cfg)).toBeNull();
  });
  it("bounds a long backlog to a few days per run", () => {
    expect(planTedWindow("2026-06-30", "2026-10-16", cfg)).toEqual({ start: "2026-06-28", end: "2026-07-14" });
    expect(planTedWindow("2026-12-30", "2027-01-10", { overlapDays: 0, maxDaysPerRun: 2 })).toEqual({ start: "2026-12-31", end: "2027-01-01" });
  });
});

describe("TED requester", () => {
  const status = (s: number | null) => new ScrapeError("x", "https://ted.europa.eu/x", s, 1);
  const setup = (overrides: { maxRequests?: number; retryAfterMs?: number | null; deadline?: number } = {}) => {
    const meter: TedRequestMeter = { requests: 0, retryAfterMs: null };
    const sleeps: number[] = [];
    const request = tedRequester({
      cfg: { maxRequests: overrides.maxRequests ?? 10, maxRetryAfterMs: 60_000 },
      meter, deadline: overrides.deadline ?? 1_000_000, now: () => 0,
      sleep: async (ms) => { sleeps.push(ms); },
    });
    const call = (outcomes: (number | null | "ok")[]) => request(async () => {
      meter.requests += 1;
      const next = outcomes.shift();
      if (next === "ok") return "ok";
      meter.retryAfterMs = overrides.retryAfterMs ?? null;
      throw status(next ?? null);
    });
    return { meter, sleeps, call };
  };

  it("stops quietly on a 429 asking for a long wait: one request, no sleep", async () => {
    const t = setup({ retryAfterMs: 120_000 });
    await expect(t.call([429, "ok"])).rejects.toThrow(/429.*120s.*next night/);
    expect(t.meter.requests).toBe(1);
    expect(t.sleeps).toEqual([]);
  });

  it("honours a short Retry-After once, then gives up", async () => {
    const ok = setup({ retryAfterMs: 2_000 });
    await expect(ok.call([429, "ok"])).resolves.toBe("ok");
    expect(ok.sleeps).toEqual([2_000]);
    const twice = setup({ retryAfterMs: 2_000 });
    await expect(twice.call([429, 429, "ok"])).rejects.toThrow(/deferred/);
    expect(twice.meter.requests).toBe(2);
  });

  it("does not wait past the run deadline", async () => {
    const t = setup({ retryAfterMs: 30_000, deadline: 10_000 });
    await expect(t.call([429, "ok"])).rejects.toThrow(/deferred/);
    expect(t.sleeps).toEqual([]);
  });

  it("retries one transient failure, fails on client errors, and respects the request budget", async () => {
    const transient = setup();
    await expect(transient.call([503, "ok"])).resolves.toBe("ok");
    await expect(setup().call([null, null, "ok"])).rejects.toThrow();
    await expect(setup().call([404, "ok"])).rejects.toBeInstanceOf(ScrapeError);
    const bounded = setup({ maxRequests: 1 });
    await expect(bounded.call([503, "ok"])).rejects.toThrow(/request budget/);
    expect(bounded.meter.requests).toBe(1);
  });
});

describe("TED incremental kill switch", () => {
  it("makes no request and no database access when disabled", async () => {
    const meter: TedRequestMeter = { requests: 0, retryAfterMs: null };
    let fetched = 0;
    const client = createTedIncrementalClient(TED_INCREMENTAL_DEFAULTS, meter, {
      userAgent: "test", fetch: async () => { fetched += 1; throw Error("network"); },
    });
    const sql = new Proxy(() => {}, { get: () => { throw Error("db"); }, apply: () => { throw Error("db"); } }) as unknown as DbSql;
    const outcome = await runTedIncremental({ sql, client, meter, config: TED_INCREMENTAL_DEFAULTS });
    expect(outcome.status).toBe("disabled");
    expect(fetched).toBe(0);
    expect(meter.requests).toBe(0);
  });

  it("meters every HTTP attempt and records Retry-After from the response", async () => {
    const meter: TedRequestMeter = { requests: 0, retryAfterMs: null };
    const client = createTedIncrementalClient({ ...TED_INCREMENTAL_DEFAULTS, delayMs: 0 }, meter, {
      userAgent: "test", fetch: async () => new Response("slow down", { status: 429, headers: { "retry-after": "7" } }),
    });
    await expect(client.http.getText("https://ted.europa.eu/en/notice/1-2026/xml")).rejects.toMatchObject({ status: 429 });
    expect(meter).toEqual({ requests: 1, retryAfterMs: 7_000 });
  });
});
