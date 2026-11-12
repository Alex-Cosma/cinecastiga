import { afterEach, describe, expect, it, vi } from "vitest";
import { dbDefaults } from "@seap/db";
import { register, WEB_DB_DEFAULTS } from "./instrumentation";

const g = globalThis as unknown as { __seapDbDefaults?: unknown };
afterEach(() => { vi.unstubAllEnvs(); delete g.__seapDbDefaults; });

describe("server start (audit P1F1; launch audit, 12 November 2026)", () => {
  it("gives the web server's pools a 30 s idle timeout and one shared pool of 14, without touching the environment", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const before = { ...process.env };
    await register();
    expect(dbDefaults()).toEqual(WEB_DB_DEFAULTS);
    // `next dev` reloads every page when the environment changes under it.
    expect(process.env).toEqual(before);
  });

  it("leaves the edge runtime alone", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await register();
    expect(dbDefaults()).toEqual({});
  });
});
