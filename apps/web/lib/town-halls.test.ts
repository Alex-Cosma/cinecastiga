import { describe, expect, it } from "vitest";
import { matchUnits, unitDetail, unitName } from "./town-halls";

/* „Ce a cumpărat primăria ta?” (owner, 13 November 2026): every UAT by its name, with its diacritics. */
describe("town halls by their locality", () => {
  it("names a unit as people write it", () => {
    expect(unitName({ name: "ORAȘ CISNĂDIE", kind: "city" })).toBe("Cisnădie");
    expect(unitName({ name: "MUNICIPIUL CLUJ-NAPOCA", kind: "municipality" })).toBe("Cluj-Napoca");
    expect(unitName({ name: "BUCUREȘTI SECTORUL 3", kind: "sector" })).toBe("Sectorul 3");
    expect(unitName({ name: "MUNICIPIUL BUCUREȘTI", kind: "municipality" })).toBe("București");
  });

  it("finds a locality without diacritics, and tells same-named communes apart by county", () => {
    const [cisnadie] = matchUnits("cisna");
    expect(cisnadie && unitDetail(cisnadie)).toBe("Primăria Orașului Cisnădie · județul Sibiu");
    expect(matchUnits("ciresu").map(unitDetail)).toEqual(expect.arrayContaining(["Primăria Comunei Cireșu · județul Brăila", "Primăria Comunei Cireșu · județul Mehedinți"]));
    expect(matchUnits("sector 3").map(unitDetail)[0]).toBe("Primăria Sectorului 3 · București");
    expect(matchUnits("bucuresti").map(unitDetail)[0]).toBe("Primăria Municipiului București");
    expect(matchUnits("sector").map(unitName)).toEqual(["Sectorul 1", "Sectorul 2", "Sectorul 3", "Sectorul 4", "Sectorul 5", "Sectorul 6"]);
    expect(matchUnits("c")).toEqual([]);
  });
});
