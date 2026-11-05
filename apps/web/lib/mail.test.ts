import { afterEach, describe, expect, it, vi } from "vitest";
import { codesToConsole, sendAuthCode } from "./mail";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("auth codes without SMTP (audit S1F4)", () => {
  it("refuses in production and never logs the code", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SMTP_HOST", "");
    vi.stubEnv("BETTER_AUTH_URL", "https://cinecastiga.ro");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendAuthCode("user@example.test", "482913")).rejects.toThrow(/SMTP_HOST/);
    const printed = [...log.mock.calls, ...error.mock.calls].flat().join(" ");
    expect(printed).not.toContain("482913");
    expect(printed).not.toContain("user@example.test");
  });

  it("prints the code on a development server", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SMTP_HOST", "");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await sendAuthCode("user@example.test", "482913");
    expect(log.mock.calls.flat().join(" ")).toContain("482913");
  });

  it("allows the console only for development or a loopback server", () => {
    expect(codesToConsole({ NODE_ENV: "development" })).toBe(true);
    expect(codesToConsole({ NODE_ENV: "test" })).toBe(true);
    // The local production preview (03-development: next start on 3100/3101).
    expect(codesToConsole({ NODE_ENV: "production", BETTER_AUTH_URL: "http://localhost:3100" })).toBe(true);
    expect(codesToConsole({ NODE_ENV: "production", BETTER_AUTH_URL: "https://cinecastiga.ro" })).toBe(false);
    expect(codesToConsole({ NODE_ENV: "production", BETTER_AUTH_URL: "http://localhost.evil.test" })).toBe(false);
    expect(codesToConsole({ NODE_ENV: "production" })).toBe(false);
  });
});
