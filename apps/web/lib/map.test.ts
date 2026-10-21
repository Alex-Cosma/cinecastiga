import { describe, expect, it } from "vitest";
import { countyMap, foldCounty } from "./map.js";
import { COUNTIES } from "./counties.js";

describe("county map labels (audit F39)", () => {
  it("uses the same diacritised spelling as the other county lists", () => {
    const labels = countyMap.shapes.map((shape) => shape.label);
    expect(labels).toContain("Argeș");
    expect(labels).toContain("Bacău");
    expect(labels).toContain("București");
    expect(labels).toContain("Maramureș");
    expect(labels).not.toContain("Arges");
    expect([...labels].sort()).toEqual([...COUNTIES].sort());
  });
  it("keeps the fold join key unchanged", () => {
    for (const shape of countyMap.shapes) expect(foldCounty(shape.label)).toBe(shape.key);
  });
});
