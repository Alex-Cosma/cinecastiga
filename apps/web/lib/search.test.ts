import { describe, expect, it } from "vitest";
import { matchedRegistryName } from "./search";

describe("the ONRC name that explains a search hit (a renamed firm, 1 November 2026)", () => {
  it("names the registry name when the typed words are not in the SICAP name", () => {
    expect(matchedRegistryName("strategic connect", "PSIHO POLIGRAF", ["STRATEGIC CONNECT S.R.L."])).toBe("STRATEGIC CONNECT S.R.L.");
    expect(matchedRegistryName("strateg", "PSIHO POLIGRAF", ["STRATEGIC CONNECT S.R.L."])).toBe("STRATEGIC CONNECT S.R.L.");
  });
  it("says nothing when the SICAP name holds the words, or for a CUI", () => {
    expect(matchedRegistryName("psiho", "PSIHO POLIGRAF", ["STRATEGIC CONNECT S.R.L."])).toBeUndefined();
    expect(matchedRegistryName("40363501", "PSIHO POLIGRAF", ["STRATEGIC CONNECT S.R.L."])).toBeUndefined();
    expect(matchedRegistryName("connect", "CENTRUL MEDICAL CONECT", undefined)).toBeUndefined();
  });
});
