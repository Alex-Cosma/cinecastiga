import { describe, expect, it } from "vitest";
import { pupilRadius } from "../app/harta/dots";
import { COUNTIES } from "./counties";
import { countyKey, figure, mapMetric, parseMapSelection, schoolArea, schoolCountyArea, sumByInstitution, type MapRow, type MapSchool } from "./map-capita-shared";
import institutions from "./reference/local-institutions-2026.json";
import reference from "./reference/schools-me-2025.json";
import geo from "./reference/uat-geo.json";

describe("/harta schools: which figure (owner, 8 November 2026)", () => {
  it("is lei per pupil only with 2025 alone; any other choice of years is the total", () => {
    expect(mapMetric({ kind: "schools", years: ["2025"] })).toBe("perPupil");
    for (const years of ["all", ["2024"], ["2024", "2025"], ["2025", "2026"]] as const) {
      expect(mapMetric({ kind: "schools", years: years === "all" ? "all" : [...years] })).toBe("value");
    }
    const s = parseMapSelection(new URLSearchParams("kind=schools&level=uat&county=cluj&sub=1"));
    expect(s.kind).toBe("schools");
    // "Cu instituțiile lor" belongs to the town halls alone.
    expect(s.withInstitutions).toBe(false);
  });
});

describe("/harta schools: arithmetic", () => {
  const schools: MapSchool[] = [
    { code: "A", name: "Școala A", county: "cluj", siruta: 54975, pupils: 500 },
    { code: "B", name: "Grădinița B", county: "cluj", siruta: 54975, pupils: 100 },
    { code: "C", name: "Școala C", county: "cluj", siruta: 55687, pupils: 0 },
  ];
  // Identities: A has two (its own CIF and a school merged into it in 2025), B one, C one.
  const rows: MapRow[] = [
    { a: 0, y: "2025", src: "da", c: "15", v: 300_000, n: 10 },
    { a: 1, y: "2025", src: "da", c: "09", v: 200_000, n: 4 },
    { a: 1, y: "2024", src: "da", c: "09", v: 900_000, n: 4 },
    { a: 2, y: "2025", src: "contracts", c: "45", v: 100_000, n: 1 },
    { a: 3, y: "2025", src: "da", c: "30", v: 50_000, n: 2 },
  ];
  const members = [[0, 1], [2], [3]];
  const sums = sumByInstitution(rows, 4, { years: ["2025"], cpv: "all", dataset: "all" });

  it("sums a school's identities (the merged school's too) and divides by its pupils", () => {
    const a = schoolArea(schools[0]!, members[0]!, sums, true, "7");
    expect(a).toMatchObject({ key: "A", value: 500_000, pupils: 500, perPupil: 1_000, records: 14, gap: null, siruta: 54975, entityId: "7" });
    expect(figure(a, "perPupil")).toBe(1_000);
  });

  it("keeps a school without pupils in the value, without a figure per pupil", () => {
    expect(schoolArea(schools[2]!, members[2]!, sums, true, null)).toMatchObject({ value: 50_000, pupils: null, perPupil: null, gap: "no_pupils" });
    expect(schoolArea(schools[2]!, members[2]!, sums, false, null)).toMatchObject({ value: 50_000, perPupil: null, gap: null });
  });

  it("a county: every school in the value, lei per pupil over the schools with pupils", () => {
    const county = schoolCountyArea("cluj", "Cluj", schools.map((x, i) => ({ x, members: members[i]! })), sums, true);
    expect(county).toMatchObject({ value: 650_000, pupils: 600, institutions: 3, buyers: 3, gap: null });
    expect(county.perPupil).toBeCloseTo(600_000 / 600, 6);
    const none = schoolCountyArea("cluj", "Cluj", [{ x: schools[2]!, members: members[2]! }], sums, true);
    expect(none).toMatchObject({ pupils: null, perPupil: null, gap: "no_pupils", value: 50_000 });
  });

  it("draws a larger school as a larger circle, capped", () => {
    expect(pupilRadius(3000)).toBeGreaterThan(pupilRadius(300));
    expect(pupilRadius(9000)).toBe(pupilRadius(3000));
    expect(pupilRadius(0)).toBe(3);
  });
});

describe("/harta schools: the reference list (lib/reference/schools-me-2025.json)", () => {
  const list = reference.schools as unknown as [string, string, string, number, number, string[]][];
  const uats = new Map((geo.uats as [number, string, string, string][]).map(([siruta, , county]) => [siruta, county]));
  const counties = new Set(COUNTIES.map(countyKey));

  it("places every school in a UAT of its county, București by sector", () => {
    for (const [code, , county, siruta] of list) {
      expect(counties.has(county), code).toBe(true);
      expect(uats.get(siruta), code).toBe(county);
    }
    expect(list.filter((x) => x[2] === "bucuresti").every((x) => x[3] !== 179132)).toBe(true);
  });

  it("links each school by at least one CIF, never one CIF to two schools", () => {
    const seen = new Set<string>();
    for (const [code, , , , pupils, cuis] of list) {
      expect(cuis.length, code).toBeGreaterThan(0);
      expect(pupils).toBeGreaterThanOrEqual(0);
      for (const cui of cuis) { expect(cui).toMatch(/^[1-9]\d{1,9}$/); expect(seen.has(cui), cui).toBe(false); seen.add(cui); }
    }
  });

  // Some schools in the network carry their town hall's CIF: the list leaves those out (build_reference.py, every
  // administration of the Ministry of Finance's list) and map-schools.ts skips any identity named a town hall. Here, the
  // administrations this repository knows by CIF (those with institutions on the map).
  it("never links a school by the CIF of a town hall or county council the map knows", () => {
    const administrations = new Set(Object.keys(institutions.parents));
    for (const [code, , , , , cuis] of list) for (const cui of cuis) expect(administrations.has(cui), `${code} ${cui}`).toBe(false);
  });

  it("holds no universities, crèches, children's palaces or inspectorates", () => {
    for (const [, name] of list) expect(name).not.toMatch(/^universit|^cre[sșş][aăe]|palatul copiilor|inspectoratul/i);
  });
});
