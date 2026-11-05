import { afterEach, describe, expect, it, vi } from "vitest";
import { createDb, idleTimeoutFromEnv } from "./client.js";

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
