import { describe, expect, it } from "vitest";
import { COUNTIES } from "./counties";
import { areaOf, countyKey, MapError, mapSelectionQuery, parseMapSelection, sumByInstitution, type MapRow } from "./map-capita-shared";
import catalog from "./reference/population-rpl2021.json";
import geo from "./reference/uat-geo.json";
import romania from "../public/geo/romania.json";

const params = (q: string) => new URLSearchParams(q);

describe("/harta selection", () => {
  it("defaults to every year, division and channel of the local administrations, by county", () => {
    expect(parseMapSelection(params(""))).toEqual({ level: "county", county: null, years: "all", cpv: "all", dataset: "all", kind: "local_admin" });
  });

  it("reads several years and divisions, deduplicated and sorted, and round-trips", () => {
    const s = parseMapSelection(params("level=uat&county=satu-mare&years=2025,2024,2025&cpv=45,33&dataset=da"));
    expect(s).toEqual({ level: "uat", county: "satu-mare", years: ["2024", "2025"], cpv: ["33", "45"], dataset: "da", kind: "local_admin" });
    expect(parseMapSelection(new URLSearchParams(mapSelectionQuery(s)))).toEqual(s);
  });

  it("refuses a UAT level without a county, malformed lists and kinds the map does not count yet", () => {
    for (const q of ["level=uat", "level=uat&county=../x", "years=25", "cpv=4", "cpv=45,abc", "dataset=x", "kind=spital", "level=judet"]) {
      expect(() => parseMapSelection(params(q)), q).toThrow(MapError);
    }
  });
});

describe("/harta sums", () => {
  const rows: MapRow[] = [
    { a: 0, y: "2024", src: "da", c: "45", v: 100, n: 2 },
    { a: 0, y: "2025", src: "contracts", c: "33", v: 1000, n: 1 },
    { a: 0, y: null, src: "da", c: "45", v: 7, n: 1 },
    { a: 1, y: "2025", src: "da", c: null, v: 50, n: 5 },
  ];

  it("count undated records and records without a code only when every year and every division are chosen", () => {
    const all = sumByInstitution(rows, 2, { years: "all", cpv: "all", dataset: "all" });
    expect([...all.v]).toEqual([1107, 50]);
    const y2025 = sumByInstitution(rows, 2, { years: ["2025"], cpv: "all", dataset: "all" });
    expect([...y2025.v]).toEqual([1000, 50]);
    const works = sumByInstitution(rows, 2, { years: "all", cpv: ["45"], dataset: "all" });
    expect([...works.v]).toEqual([107, 0]);
    const da = sumByInstitution(rows, 2, { years: ["2024", "2025"], cpv: "all", dataset: "da" });
    expect([...da.v]).toEqual([100, 50]);
    expect([...da.n]).toEqual([2, 5]);
  });

  it("divide by the population, keep an unknown UAT unknown and a county without its council without a figure", () => {
    const sums = sumByInstitution(rows, 2, { years: "all", cpv: "all", dataset: "all" });
    expect(areaOf("1", "A", 100, [0, 1], sums, null)).toMatchObject({ value: 1157, perCapita: 11.57, records: 9, buyers: 2, institutions: 2, gap: null });
    expect(areaOf("2", "B", 100, [], sums, "no_admin")).toMatchObject({ value: null, perCapita: null, records: 0, buyers: 0, institutions: 0, gap: "no_admin" });
    expect(areaOf("3", "C", 100, [1], sums, "no_council")).toMatchObject({ value: 50, perCapita: null, gap: "no_council" });
    expect(areaOf("4", "D", null, [1], sums, null)).toMatchObject({ value: 50, perCapita: null, gap: "no_population" });
  });

  it("divide a county by its covered population when one is given, keeping the whole population beside it", () => {
    const sums = sumByInstitution(rows, 2, { years: "all", cpv: "all", dataset: "all" });
    expect(areaOf("5", "E", 1000, [0, 1], sums, null, 500)).toMatchObject({ population: 1000, denominator: 500, value: 1157, perCapita: 2.314 });
    expect(areaOf("6", "F", 1000, [0], sums, null, 0)).toMatchObject({ denominator: 0, perCapita: null, gap: "no_population" });
  });
});

describe("/harta geometry", () => {
  it("names the 42 counties with the keys of the county list", () => {
    expect(romania.counties.map((c) => c.key).sort()).toEqual(COUNTIES.map(countyKey).sort());
  });

  it("has a resident population for every UAT shape; București as a whole has none (its sectors are drawn)", () => {
    const population = new Set(catalog.units.map((u) => u.siruta));
    const shapes = (geo.uats as [number, string, string, string][]).map((u) => u[0]);
    expect(shapes.length).toBe(3186);
    expect(shapes.filter((s) => !population.has(s))).toEqual([]);
    expect(catalog.units.filter((u) => !shapes.includes(u.siruta)).map((u) => u.siruta)).toEqual([179132]);
  });
});
