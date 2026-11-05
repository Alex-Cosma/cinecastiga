import { afterEach, describe, expect, it, vi } from "vitest";
import { register } from "./instrumentation";

afterEach(() => vi.unstubAllEnvs());

describe("server start (audit P1F1)", () => {
  it("gives the web server's pools a 30 s idle timeout", () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    delete process.env.SEAP_DB_IDLE_TIMEOUT_SECONDS;
    register();
    expect(process.env.SEAP_DB_IDLE_TIMEOUT_SECONDS).toBe("30");
    delete process.env.SEAP_DB_IDLE_TIMEOUT_SECONDS;
  });

  it("keeps an operator's value and leaves the edge runtime alone", () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("SEAP_DB_IDLE_TIMEOUT_SECONDS", "120");
    register();
    expect(process.env.SEAP_DB_IDLE_TIMEOUT_SECONDS).toBe("120");
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_RUNTIME", "edge");
    delete process.env.SEAP_DB_IDLE_TIMEOUT_SECONDS;
    register();
    expect(process.env.SEAP_DB_IDLE_TIMEOUT_SECONDS).toBeUndefined();
  });
});
