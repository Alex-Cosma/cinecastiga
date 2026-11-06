import { describe, expect, it } from "vitest";
import { countyAreas, uatAreas, BUCHAREST_SIRUTA } from "./map-capita";
import type { MapSelection } from "./map-capita-shared";
import catalog from "./reference/population-rpl2021.json";

const unit = (name: string, county: string) => catalog.units.find((u) => u.name === name && u.county === county)!;
const sfantu = unit("MUNICIPIUL SFÂNTU GHEORGHE", "COVASNA");
const sector1 = unit("BUCUREȘTI SECTORUL 1", "MUNICIPIUL BUCUREȘTI");
const city = catalog.units.find((u) => u.siruta === BUCHAREST_SIRUTA)!;
const covasna = catalog.counties.find((c) => c.key === "covasna")!;
const all: MapSelection = { level: "county", county: null, years: "all", cpv: "all", dataset: "all", kind: "local_admin" };

// Covasna: one town hall and the county council; București: the city hall and Sector 1's town hall.
const data = {
  institutions: [
    { id: "1", county: "Covasna", siruta: sfantu.siruta, level: "local" as const },
    { id: "2", county: "Covasna", siruta: null, level: "county" as const },
    { id: "3", county: "Bucuresti", siruta: BUCHAREST_SIRUTA, level: "local" as const },
    { id: "4", county: "Bucuresti", siruta: sector1.siruta, level: "local" as const },
  ],
  rows: [
    { a: 0, y: "2025", src: "da" as const, c: "45", v: 1_000_000, n: 10 },
    { a: 1, y: "2025", src: "contracts" as const, c: "45", v: 3_000_000, n: 2 },
    { a: 2, y: "2025", src: "contracts" as const, c: "45", v: 17_000_000, n: 1 },
    { a: 3, y: "2025", src: "da" as const, c: "33", v: 2_000_000, n: 4 },
  ],
  source: "rollup" as const,
  councils: new Set(["Covasna"]),
};

describe("/harta counties (owner, 6 November 2026)", () => {
  it("divide a county's town halls and council by the population of the UATs whose town hall is identified", () => {
    const c = countyAreas(data, all).find((a) => a.key === "covasna")!;
    expect(c).toMatchObject({ population: covasna.population, denominator: sfantu.population, value: 4_000_000, institutions: 2, buyers: 2, gap: null });
    expect(c.perCapita).toBeCloseTo(4_000_000 / sfantu.population);
    expect(c.coverage).toBeCloseTo(sfantu.population / covasna.population);
  });

  it("divide București (city hall and sectors) by the whole city, covered whole", () => {
    const b = countyAreas(data, all).find((a) => a.key === "bucuresti")!;
    expect(b).toMatchObject({ denominator: city.population, value: 19_000_000, coverage: 1 });
  });

  it("keep the city hall apart from the sectors on București's UATs, over the city's population", () => {
    const { areas, city: hall } = uatAreas(data, { ...all, level: "uat", county: "bucuresti" }, "bucuresti");
    expect(areas.find((a) => a.key === String(sector1.siruta))).toMatchObject({ value: 2_000_000, denominator: sector1.population, gap: null });
    expect(areas.filter((a) => a.gap === "no_admin")).toHaveLength(5);
    expect(hall).toMatchObject({ value: 17_000_000, denominator: city.population });
  });
});
