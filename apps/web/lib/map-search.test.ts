import { describe, expect, it } from "vitest";
import { searchMap, townHallPlace, uatName } from "./map-search";

describe("searchMap (/harta's search, UX audit Z4-01)", () => {
  it("finds a town by the start of its name, with its county, and its hospital", () => {
    const r = searchMap("Cisn");
    expect(r.places[0]).toMatchObject({ siruta: 143735, name: "Cisnădie", kind: "oraș", county: "sibiu", countyName: "Sibiu" });
    expect(r.institutions.find((i) => i.kind === "hospitals")).toMatchObject({ county: "sibiu", place: "Cisnădie, Sibiu" });
  });
  it("ignores diacritics and lists sectors in their order", () => {
    expect(searchMap("ramnicu s").places[0]?.name).toBe("Râmnicu Sărat");
    expect(searchMap("sector").places.slice(0, 3).map((p) => p.name)).toEqual(["Sectorul 1", "Sectorul 2", "Sectorul 3"]);
  });
  it("opens București as a whole first", () => {
    expect(searchMap("bucuresti").places[0]).toMatchObject({ siruta: 179132, county: "bucuresti" });
  });
  it("waits for two letters, and three for institutions", () => {
    expect(searchMap("c")).toEqual({ places: [], institutions: [] });
    expect(searchMap("ci").institutions).toEqual([]);
  });
});

describe("townHallPlace and uatName (the comparison's way to the map, UX audit Z4-26, Z4-34, Z4-39)", () => {
  it("reads a town hall's name in its county", () => {
    expect(townHallPlace("Orasul Cisnadie", "Sibiu")).toEqual({ county: "sibiu", siruta: 143735 });
    expect(townHallPlace("Orasul Zarnesti (Primaria Orasului Zarnesti)", "Brasov")?.siruta).toBe(40492);
    expect(townHallPlace("MUNICIPIUL BUCURESTI", "Bucuresti")).toEqual({ county: "bucuresti", siruta: null });
  });
  it("names no place for what is not a town hall", () => {
    expect(townHallPlace("DIRECTIA DE ASISTENTA SOCIALA SIBIU", "Sibiu")).toBeNull();
    expect(townHallPlace("Orasul Cisnadie", "Cluj")).toBeNull();
  });
  it("names a UAT as the map does", () => {
    expect(uatName(151870)).toBe("Roșiori de Vede");
    expect(uatName(null)).toBeNull();
  });
});
