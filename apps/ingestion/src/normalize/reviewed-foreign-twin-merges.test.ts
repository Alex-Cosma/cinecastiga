import { describe, expect, it } from "vitest";
import { countryIso2, normForeignId } from "./foreign.js";
import { normalizeName } from "./name.js";
import { REVIEWED_FOREIGN_TWIN_MERGES } from "./reviewed-foreign-twin-merges.js";

// Data audit F26 C(i), owner-approved: exactly these 6 foreign-marked entities
// with country RO (production ids) merge into their twin under a foreign country.
const APPROVED: [string, string, string][] = [
  ["2270125", "2270102", "CA"], // Candu Energy
  ["2270082", "2275287", "MD"], // Turboenergy Power
  ["2270605", "2275147", "TR"], // Koltek Musavirlik
  ["2270952", "2275637", "IT"], // T.R. Costruzioni
  ["2272875", "2279326", "PA"], // Schlumberger Logelco
  ["2273166", "2279280", "IT"], // Tirrena Scavi
];
// Synevo Romania (its id is held by a different BG firm) and the 7 foreign-marked
// RO entities without a stored foreign twin keep "țară de verificat".
const UNTOUCHED = ["2270902", "2275120", "2270122", "2270128", "2270132", "2270404", "2270511", "2271951", "2272051"];

describe("REVIEWED_FOREIGN_TWIN_MERGES", () => {
  it("holds exactly the approved pairs, each source and target once", () => {
    expect(REVIEWED_FOREIGN_TWIN_MERGES.map((r) => [r.sourceId, r.targetId, r.targetCountry]).sort()).toEqual([...APPROVED].sort());
    expect(new Set(REVIEWED_FOREIGN_TWIN_MERGES.map((r) => r.sourceId)).size).toBe(APPROVED.length);
    expect(new Set(REVIEWED_FOREIGN_TWIN_MERGES.map((r) => r.targetId)).size).toBe(APPROVED.length);
  });
  it("never touches Synevo Romania or the entities without a foreign twin", () => {
    for (const id of UNTOUCHED) {
      expect(REVIEWED_FOREIGN_TWIN_MERGES.some((r) => r.sourceId === id || r.targetId === id)).toBe(false);
    }
  });
  it("records normalized names, a normalized foreign id and a non-Romanian target country for every row", () => {
    for (const r of REVIEWED_FOREIGN_TWIN_MERGES) {
      expect(normalizeName(r.sourceName).normalized).toBe(r.sourceName);
      expect(normalizeName(r.targetName).normalized).toBe(r.targetName);
      expect(normForeignId(r.foreignId)).toBe(r.foreignId);
      expect(countryIso2(r.targetCountry)).toBe(r.targetCountry);
      expect(r.targetCountry).not.toBe("RO");
      expect(r.evidence).toContain(r.foreignId);
      expect(r.sourceId).not.toBe(r.targetId);
    }
  });
});
