import { describe, expect, it } from "vitest";
import { countyAreas, uatAreas, BUCHAREST_SIRUTA } from "./map-capita";
import type { MapSelection } from "./map-capita-shared";
import catalog from "./reference/population-rpl2021.json";

const unit = (name: string, county: string) => catalog.units.find((u) => u.name === name && u.county === county)!;
const sfantu = unit("MUNICIPIUL SFÂNTU GHEORGHE", "COVASNA");
const sector1 = unit("BUCUREȘTI SECTORUL 1", "MUNICIPIUL BUCUREȘTI");
const city = catalog.units.find((u) => u.siruta === BUCHAREST_SIRUTA)!;
const covasna = catalog.counties.find((c) => c.key === "covasna")!;
const all: MapSelection = { level: "county", county: null, years: "all", cpv: "all", dataset: "all", kind: "local_admin", withInstitutions: false };

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

describe("/harta with the institutions (owner, 8 November 2026)", () => {
  // Their institutions sit where their administration does: the council's DGASPC at the county, Sfântu Gheorghe's
  // company in its UAT, the city hall's transport company with the city, Sector 1's service in the sector.
  const subs = {
    ...data,
    institutions: [
      ...data.institutions,
      { ...data.institutions[1]!, id: "5", parent: 1 },
      { ...data.institutions[0]!, id: "6", parent: 0 },
      { ...data.institutions[2]!, id: "7", parent: 2 },
      { ...data.institutions[3]!, id: "8", parent: 3 },
    ],
    rows: [
      ...data.rows,
      { a: 4, y: "2025", src: "contracts" as const, c: "85", v: 500_000, n: 1 },
      { a: 5, y: "2025", src: "da" as const, c: "90", v: 250_000, n: 3 },
      { a: 6, y: "2025", src: "contracts" as const, c: "34", v: 9_000_000, n: 1 },
      { a: 7, y: "2024", src: "da" as const, c: "45", v: 100_000, n: 1 },
    ],
  };
  const withInst = { ...all, withInstitutions: true };

  it("leaves them out unless asked: the figures stay the administrations' own", () => {
    expect(countyAreas(subs, all)).toEqual(countyAreas(data, all));
    expect(uatAreas(subs, { ...all, level: "uat", county: "bucuresti" }, "bucuresti")).toEqual(uatAreas(data, { ...all, level: "uat", county: "bucuresti" }, "bucuresti"));
  });

  it("adds them to their county or UAT, over the same population, and says their part", () => {
    const c = countyAreas(subs, withInst).find((a) => a.key === "covasna")!;
    expect(c).toMatchObject({ denominator: sfantu.population, value: 4_750_000, subValue: 750_000, institutions: 4, buyers: 4 });
    expect(c.perCapita).toBeCloseTo(4_750_000 / sfantu.population);
    const { areas, city: hall } = uatAreas(subs, { ...withInst, level: "uat", county: "bucuresti" }, "bucuresti");
    expect(hall).toMatchObject({ value: 26_000_000, subValue: 9_000_000 });
    // Every year: Sector 1's service adds its 2024 row; with 2025 alone it has none, its sector's figure unchanged.
    expect(areas.find((a) => a.key === String(sector1.siruta))).toMatchObject({ value: 2_100_000, subValue: 100_000, institutions: 2 });
    const only2025 = uatAreas(subs, { ...withInst, level: "uat", county: "bucuresti", years: ["2025"] }, "bucuresti").areas;
    expect(only2025.find((a) => a.key === String(sector1.siruta))).toMatchObject({ value: 2_000_000, subValue: 0 });
    expect(areas.filter((a) => a.gap === "no_admin")).toHaveLength(5);
  });
});
