import { describe, expect, it } from "vitest";
import { countryIso2, normCountry } from "./foreign.js";

// Data audit F26: stored country codes of the 12 split foreign firms on the
// local snapshot of 1 October (SHIELD FIRE UK/GB, Sinopharm HK/HKG, NAFFCO
// AU/AUS, Kazatomprom KZ/KAZ, Civil Engineering Institute MK/MKD, Euro-Asfalt
// BA/BIH, Acruta & Tapia PE/PER).
describe("countryIso2", () => {
  it("names the same country for each spelling the sources store", () => {
    for (const [a, b] of [["UK", "GB"], ["HKG", "HK"], ["AUS", "AU"], ["KAZ", "KZ"], ["MKD", "MK"], ["BIH", "BA"], ["PER", "PE"], ["GBR", "GB"], ["DEU", "DE"]])
      expect(countryIso2(a)).toBe(countryIso2(b));
    expect(countryIso2(" uk ")).toBe("GB");
    expect(countryIso2("ROU")).toBe("RO");
  });
  it("keeps different countries apart and never matches an unknown spelling", () => {
    expect(countryIso2("CA")).not.toBe(countryIso2("RO"));
    expect(countryIso2("IE")).not.toBe(countryIso2("UK"));
    expect(countryIso2("BE")).not.toBe(countryIso2("US"));
    for (const s of ["XYZ", "ITALY", "", null, undefined, "G1"]) expect(countryIso2(s)).toBeNull();
  });
  it("leaves the stored keys and normCountry as they were", () => {
    expect(normCountry("UK")).toBe("UK");
    expect(normCountry("HKG")).toBe("HKG");
  });
});
