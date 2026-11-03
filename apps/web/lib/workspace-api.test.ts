import { describe, it, expect } from "vitest";
import { workspaceOrigin } from "./workspace-api";

// Production, 3 November 2026: behind Caddy the request URL is internal (http://web:3000), so every
// workspace write from https://cinecastiga.ro was refused as foreign.
describe("workspace origin", () => {
  const req = (origin: string | null) => new Request("http://web:3000/api/contracte/1/files", { method: "POST", headers: origin ? { origin } : {} });
  it("accepts the public origin behind the proxy and refuses another site", () => {
    expect(() => workspaceOrigin(req("https://cinecastiga.ro"), "https://cinecastiga.ro")).not.toThrow();
    expect(() => workspaceOrigin(req("https://example.org"), "https://cinecastiga.ro")).toThrow("nu provine");
    expect(() => workspaceOrigin(req(null), "https://cinecastiga.ro")).not.toThrow();
  });
  it("compares with the request itself when no public origin is configured", () => {
    expect(() => workspaceOrigin(req("http://web:3000"), undefined)).not.toThrow();
    expect(() => workspaceOrigin(req("https://cinecastiga.ro"), undefined)).toThrow("nu provine");
  });
});
