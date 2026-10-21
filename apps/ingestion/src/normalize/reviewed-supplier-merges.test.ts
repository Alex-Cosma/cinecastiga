import { describe, expect, it } from "vitest";
import { cuiIsValid } from "./cui.js";
import { normalizeName } from "./name.js";
import { REVIEWED_SUPPLIER_MERGES } from "./reviewed-supplier-merges.js";

// Data audit F28, owner decision of 21 October 2026: exactly these 20 key-less
// profiles (production ids) merge into the valid-CUI firm they duplicate.
const APPROVED: [string, string][] = [
  ["2277024", "2123842"], ["2276441", "2123842"], ["2276257", "2125531"], ["2277014", "2085724"],
  ["2276364", "2121221"], ["2277867", "2127928"], ["2278070", "1993244"], ["2277828", "2127831"],
  ["2278519", "2081115"], ["2278500", "2081115"], ["2277836", "2111316"], ["2277821", "2068958"],
  ["2276194", "2127802"], ["2280420", "2127802"], ["2278307", "2062018"], ["2277268", "2162616"],
  ["2276912", "2078658"], ["2277925", "2027480"], ["2278582", "2073313"], ["2276444", "2071229"],
];
// Left out as unclear: Lockheed Martin Overseas, CONSORZIO STABILE EBG,
// Drumuri si Poduri, CONI, INTRASOFT.
const UNCLEAR = ["2277839", "2276508", "2277759", "2277326", "2278216"];

describe("REVIEWED_SUPPLIER_MERGES", () => {
  it("holds exactly the approved pairs, each source once", () => {
    expect(REVIEWED_SUPPLIER_MERGES.map((r) => [r.sourceId, r.targetId]).sort()).toEqual([...APPROVED].sort());
    expect(new Set(REVIEWED_SUPPLIER_MERGES.map((r) => r.sourceId)).size).toBe(APPROVED.length);
  });
  it("never merges the unclear profiles", () => {
    for (const id of UNCLEAR) {
      expect(REVIEWED_SUPPLIER_MERGES.some((r) => r.sourceId === id || r.targetId === id)).toBe(false);
    }
  });
  it("records a normalized source name, a valid target CUI and the evidence of every row", () => {
    for (const r of REVIEWED_SUPPLIER_MERGES) {
      expect(normalizeName(r.sourceName).normalized).toBe(r.sourceName);
      expect(cuiIsValid(r.targetCui)).toBe(true);
      expect(r.evidence).toContain(r.targetCui);
      expect(r.sourceId).not.toBe(r.targetId);
    }
    // Two profiles of one firm share its target and its CUI.
    const cuiOf = new Map<string, string>();
    for (const r of REVIEWED_SUPPLIER_MERGES) {
      expect(cuiOf.get(r.targetId) ?? r.targetCui).toBe(r.targetCui);
      cuiOf.set(r.targetId, r.targetCui);
    }
  });
});
