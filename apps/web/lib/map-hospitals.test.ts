import { describe, expect, it } from "vitest";
import { packDots, pathCentroid } from "../app/harta/dots";
import { COUNTIES } from "./counties";
import { countyKey, figure, hospitalArea, hospitalCountyArea, mapMetric, parseMapSelection, sumByInstitution, type MapHospital, type MapRow } from "./map-capita-shared";
import reference from "./reference/hospitals-cnas-2025.json";
import geo from "./reference/uat-geo.json";

const CITY = 179132;

describe("/harta hospitals: which figure (owner, 8 November 2026)", () => {
  it("is lei per bed only with 2025 alone; any other choice of years is the total; town halls stay per inhabitant", () => {
    expect(mapMetric({ kind: "hospitals", years: ["2025"] })).toBe("perBed");
    for (const years of ["all", ["2024"], ["2024", "2025"], ["2025", "2026"]] as const) {
      expect(mapMetric({ kind: "hospitals", years: years === "all" ? "all" : [...years] })).toBe("value");
    }
    expect(mapMetric({ kind: "local_admin", years: ["2025"] })).toBe("perCapita");
    expect(parseMapSelection(new URLSearchParams("kind=hospitals&level=uat&county=cluj")).kind).toBe("hospitals");
  });
});

describe("/harta hospitals: arithmetic", () => {
  const hospitals: MapHospital[] = [
    { code: "A", name: "Spitalul A", county: "cluj", siruta: 54975, beds: 100 },
    { code: "B", name: "Spitalul B", county: "cluj", siruta: 54975, beds: 300 },
    { code: "C", name: "Spitalul C", county: "cluj", siruta: null, beds: null },
  ];
  // Identities: A has two (a renamed hospital), B one, C one.
  const rows: MapRow[] = [
    { a: 0, y: "2025", src: "contracts", c: "33", v: 1_000_000, n: 2 },
    { a: 1, y: "2025", src: "da", c: "33", v: 500_000, n: 3 },
    { a: 2, y: "2025", src: "contracts", c: "45", v: 6_000_000, n: 1 },
    { a: 2, y: "2024", src: "contracts", c: "45", v: 9_000_000, n: 1 },
    { a: 3, y: "2025", src: "da", c: "33", v: 400_000, n: 4 },
  ];
  const members = [[0, 1], [2], [3]];
  const only2025 = { years: ["2025"], cpv: "all", dataset: "all" } as const;
  const sums = sumByInstitution(rows, 4, { ...only2025, years: ["2025"] });

  it("sums a hospital's identities and divides by its beds", () => {
    const a = hospitalArea(hospitals[0]!, members[0]!, sums, true, "11");
    expect(a).toMatchObject({ key: "A", value: 1_500_000, beds: 100, perBed: 15_000, records: 5, gap: null, siruta: 54975, entityId: "11" });
    expect(figure(a, "perBed")).toBe(15_000);
  });

  it("keeps a hospital without beds in the value, with the gap no_beds only when lei per bed is asked", () => {
    expect(hospitalArea(hospitals[2]!, members[2]!, sums, true, null)).toMatchObject({ value: 400_000, beds: null, perBed: null, gap: "no_beds" });
    expect(hospitalArea(hospitals[2]!, members[2]!, sums, false, null)).toMatchObject({ value: 400_000, perBed: null, gap: null });
  });

  it("divides a county by the beds of its hospitals with beds, over their value only; the total counts every hospital", () => {
    const county = hospitalCountyArea("cluj", "Cluj", hospitals.map((h, i) => ({ h, members: members[i]! })), sums, true);
    expect(county).toMatchObject({ value: 7_900_000, beds: 400, institutions: 3, buyers: 3, gap: null });
    expect(county.perBed).toBeCloseTo(7_500_000 / 400, 6);
    const none = hospitalCountyArea("x", "X", [{ h: hospitals[2]!, members: [3] }], sums, true);
    expect(none).toMatchObject({ beds: null, perBed: null, gap: "no_beds", value: 400_000 });
  });
});

describe("/harta hospitals: CNAS's list as linked on 8 November 2026", () => {
  const all = [...reference.hospitals, ...reference.outside] as { code: string; county: string; siruta: number | null; beds: number | null; cuis: string[] }[];
  const counties = new Set(COUNTIES.map(countyKey));
  const uats = new Map((geo.uats as [number, string, string, string][]).map(([siruta, , county]) => [siruta, county]));

  it("has every hospital once, with CUIs, a county and a town of that county (București's for the capital's)", () => {
    expect(new Set(all.map((h) => h.code)).size).toBe(all.length);
    expect(new Set(all.flatMap((h) => h.cuis)).size).toBe(all.flatMap((h) => h.cuis).length);
    for (const h of all) {
      expect(h.cuis.length, h.code).toBeGreaterThan(0);
      for (const cui of h.cuis) expect(cui, h.code).toMatch(/^\d{2,10}$/);
      expect(counties.has(h.county), h.code).toBe(true);
      expect(h.siruta === CITY ? ["bucuresti", "ilfov"].includes(h.county) : uats.get(h.siruta ?? -1) === h.county, `${h.code} ${h.siruta}`).toBe(true);
    }
  });

  it("holds CNAS's 2025 beds: 369 hospitals with beds (two sections with their hospital, one military clinic unlinked)", () => {
    expect(reference.hospitals.length).toBe(369);
    expect(reference.hospitals.every((h) => (h.beds ?? 0) > 0)).toBe(true);
    expect(reference.hospitals.reduce((s, h) => s + (h.beds ?? 0), 0)).toBe(130_286);
    expect(reference.outside.every((h) => h.beds === null)).toBe(true);
  });
});

describe("/harta hospitals: drawing", () => {
  it("finds a shape's centre from the geometry's paths", () => {
    expect(pathCentroid("M0 0l10 0 0 10-10 0z")).toEqual([5, 5]);
    const [x, y] = pathCentroid("M10 10l4 0 0 2-4 0zM0 0l0 0z")!;
    expect(x).toBeCloseTo(12); expect(y).toBeCloseTo(11);
  });

  it("packs a town's circles around it without overlap, the same way every time", () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ key: `h${i}`, ax: 50, ay: 50, r: 1 + (i % 5) }));
    const a = packDots(items, 0.5), b = packDots(items, 0.5);
    expect([...a]).toEqual([...b]);
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const [x1, y1] = a.get(items[i]!.key)!, [x2, y2] = a.get(items[j]!.key)!;
        expect(Math.hypot(x2 - x1, y2 - y1)).toBeGreaterThan(items[i]!.r + items[j]!.r - 0.01);
      }
    }
  });
});
