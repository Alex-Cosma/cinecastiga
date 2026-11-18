import { describe, expect, it } from "vitest";
import { DEFAULT_VIEW_MODE, VIEW_MODE_KEY, parseViewMode, viewModeScript } from "./view-mode";

describe("the two ways to see the site", () => {
  it("reads only the two known values", () => {
    expect(parseViewMode("esential")).toBe("esential");
    expect(parseViewMode("complet")).toBe("complet");
    for (const value of [null, undefined, "", "light", "Complet"]) expect(parseViewMode(value)).toBeNull();
  });
  it("starts a new reader in Esențial", () => {
    expect(DEFAULT_VIEW_MODE).toBe("esential");
  });
  it("stamps <html> before paint: the stored choice, else the default, also when storage is blocked", () => {
    const run = (stored: string | null, blocked = false) => {
      const attrs: Record<string, string> = {};
      const localStorage = { getItem: (key: string) => { if (blocked) throw new Error("blocked"); return key === VIEW_MODE_KEY ? stored : null; } };
      const document = { documentElement: { setAttribute: (name: string, value: string) => { attrs[name] = value; } } };
      new Function("localStorage", "document", viewModeScript)(localStorage, document);
      return attrs["data-mode"];
    };
    expect(run("complet")).toBe("complet");
    expect(run("esential")).toBe("esential");
    expect(run(null)).toBe("esential");
    expect(run("altceva")).toBe("esential");
    expect(run(null, true)).toBe("esential");
  });
});
