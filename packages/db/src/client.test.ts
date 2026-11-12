import { afterEach, describe, expect, it, vi } from "vitest";
import { createDb, idleTimeoutFromEnv, setDbDefaults, sharedPoolMaxFromEnv } from "./client.js";

afterEach(() => vi.unstubAllEnvs());

describe("pool idle timeout (audit P1F1)", () => {
  it("reads a positive whole number of seconds and nothing else", () => {
    expect(idleTimeoutFromEnv({ SEAP_DB_IDLE_TIMEOUT_SECONDS: "30" })).toBe(30);
    for (const value of [undefined, "", "0", "-5", "1.5", "30s", "abc"]) expect(idleTimeoutFromEnv({ SEAP_DB_IDLE_TIMEOUT_SECONDS: value })).toBeUndefined();
  });

  it("keeps postgres.js's default when unset (ingestion, workers)", async () => {
    vi.stubEnv("SEAP_DB_IDLE_TIMEOUT_SECONDS", "");
    const { sql } = createDb("postgres://u:p@127.0.0.1:1/seap_test_none");
    expect(sql.options.idle_timeout).toBeFalsy();
    await sql.end({ timeout: 0 });
  });

  it("applies the environment's value, and an explicit option over it", async () => {
    vi.stubEnv("SEAP_DB_IDLE_TIMEOUT_SECONDS", "30");
    const fromEnv = createDb("postgres://u:p@127.0.0.1:1/seap_test_none").sql;
    const explicit = createDb("postgres://u:p@127.0.0.1:1/seap_test_none", { idleTimeout: 5 }).sql;
    expect(fromEnv.options.idle_timeout).toBe(30);
    expect(explicit.options.idle_timeout).toBe(5);
    expect(fromEnv.options.max).toBe(10);
    await Promise.all([fromEnv.end({ timeout: 0 }), explicit.end({ timeout: 0 })]);
  });
});

describe("one shared pool for the web server (launch audit, 12 November 2026)", () => {
  const g = globalThis as unknown as { __seapSharedDb?: { sql: { end: (o?: { timeout?: number }) => Promise<void> } } };
  afterEach(async () => { await g.__seapSharedDb?.sql.end({ timeout: 0 }); delete g.__seapSharedDb; });

  it("reads a positive whole size and nothing else", () => {
    expect(sharedPoolMaxFromEnv({ SEAP_DB_SHARED_POOL_MAX: "14" })).toBe(14);
    for (const value of [undefined, "", "0", "-1", "1.5", "14x", "1000"]) expect(sharedPoolMaxFromEnv({ SEAP_DB_SHARED_POOL_MAX: value })).toBeUndefined();
  });

  it("gives every call without arguments the same pool of that size", async () => {
    vi.stubEnv("SEAP_DB_SHARED_POOL_MAX", "14");
    vi.stubEnv("DATABASE_URL", "postgres://u:p@127.0.0.1:1/seap_test_none");
    const a = createDb().sql, b = createDb().sql;
    expect(a).toBe(b);
    expect(a.options.max).toBe(14);
  });

  it("keeps a pool of its own for a caller with a URL or options, and shares nothing when unset (workers)", async () => {
    vi.stubEnv("SEAP_DB_SHARED_POOL_MAX", "14");
    vi.stubEnv("DATABASE_URL", "postgres://u:p@127.0.0.1:1/seap_test_none");
    const shared = createDb().sql, own = createDb(undefined, { max: 2 }).sql, url = createDb("postgres://u:p@127.0.0.1:1/seap_test_none").sql;
    expect(own).not.toBe(shared);expect(own.options.max).toBe(2);
    expect(url).not.toBe(shared);expect(url.options.max).toBe(10);
    vi.stubEnv("SEAP_DB_SHARED_POOL_MAX", "");
    const w1 = createDb().sql, w2 = createDb().sql;
    expect(w1).not.toBe(w2);
    await Promise.all([own, url, w1, w2].map((s) => s.end({ timeout: 0 })));
  });
});

describe("web defaults without the environment (12 November 2026: next dev reloaded on env changes)", () => {
  const g = globalThis as unknown as { __seapDbDefaults?: unknown; __seapSharedDb?: { sql: { end: (o?: { timeout?: number }) => Promise<void> } } };
  afterEach(async () => { await g.__seapSharedDb?.sql.end({ timeout: 0 }); delete g.__seapSharedDb; delete g.__seapDbDefaults; });

  it("uses the process defaults when the environment sets nothing, and the environment when it does", async () => {
    vi.stubEnv("SEAP_DB_SHARED_POOL_MAX", "");
    vi.stubEnv("SEAP_DB_IDLE_TIMEOUT_SECONDS", "");
    vi.stubEnv("DATABASE_URL", "postgres://u:p@127.0.0.1:1/seap_test_none");
    setDbDefaults({ idleTimeout: 30, sharedPoolMax: 14 });
    const shared = createDb().sql;
    expect(shared).toBe(createDb().sql);
    expect(shared.options.max).toBe(14);
    expect(shared.options.idle_timeout).toBe(30);
    await shared.end({ timeout: 0 }); delete g.__seapSharedDb;
    vi.stubEnv("SEAP_DB_SHARED_POOL_MAX", "20");
    expect(createDb().sql.options.max).toBe(20);
  });
});
