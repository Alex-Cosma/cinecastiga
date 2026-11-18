import { describe, expect, it } from "vitest";
import { matchedRegistryName } from "./search";

describe("the ONRC name that explains a search hit (a renamed firm, 1 November 2026)", () => {
  it("names the registry name when the typed words are not in the SICAP name", () => {
    expect(matchedRegistryName("inventat connect", "FICTIV POLIGRAF", ["INVENTAT CONNECT S.R.L."])).toBe("INVENTAT CONNECT S.R.L.");
    expect(matchedRegistryName("inventa", "FICTIV POLIGRAF", ["INVENTAT CONNECT S.R.L."])).toBe("INVENTAT CONNECT S.R.L.");
  });
  it("says nothing when the SICAP name holds the words, or for a CUI", () => {
    expect(matchedRegistryName("fictiv", "FICTIV POLIGRAF", ["INVENTAT CONNECT S.R.L."])).toBeUndefined();
    expect(matchedRegistryName("99000017", "FICTIV POLIGRAF", ["INVENTAT CONNECT S.R.L."])).toBeUndefined();
    expect(matchedRegistryName("connect", "CENTRUL MEDICAL EXEMPLU", undefined)).toBeUndefined();
  });
});
