import { describe, expect, it } from "vitest";
import { ONRC_BIRTH_YEAR_MIN, ONRC_PLACEHOLDER_BIRTH_DATES, ONRC_REPRESENTATIVE_MIN_AGE } from "@seap/db";
import { sharedRepresentativePairs } from "./shared-representatives";
import * as display from "./format";

describe("sharedRepresentativePairs (audit F32)", () => {
  it("never links firms through a placeholder, legal-person or name-only row", () => {
    const rows = [
      // person_key without a birth date is "name||locality"
      { entity_id: "10", person_key: "fara reprezentant||", person_name: "FARA REPREZENTANT", birth_date: null },
      { entity_id: "11", person_key: "fara reprezentant||", person_name: "FARA REPREZENTANT", birth_date: null },
      { entity_id: "10", person_key: "bns insolvency ipurl||", person_name: "BNS INSOLVENCY IPURL", birth_date: null },
      { entity_id: "11", person_key: "bns insolvency ipurl||", person_name: "BNS INSOLVENCY IPURL", birth_date: null },
      { entity_id: "10", person_key: "naciadi camelia||loc. constanta", person_name: "NACIADI CAMELIA", birth_date: null },
      { entity_id: "11", person_key: "naciadi camelia||loc. constanta", person_name: "NACIADI CAMELIA", birth_date: null },
    ];
    expect(sharedRepresentativePairs(rows)).toEqual([]);
  });

  it("links every pair of members that share a solid identity, ordered by entity id", () => {
    const key = "popescu ion|1970-01-02|loc. iasi";
    const rows = [
      { entity_id: "100", person_key: key, person_name: "POPESCU ION", birth_date: "1970-01-02" },
      { entity_id: "9", person_key: key, person_name: "POPESCU ION", birth_date: "1970-01-02" },
      { entity_id: "9", person_key: key, person_name: "POPESCU ION", birth_date: "1970-01-02" },
      { entity_id: "50", person_key: "popescu ion|1971-03-04|loc. iasi", person_name: "POPESCU ION", birth_date: "1971-03-04" },
    ];
    expect(sharedRepresentativePairs(rows)).toEqual([
      { a: "9", b: "100", personKey: key, name: "POPESCU ION" },
    ]);
  });

  it("never links namesakes through a placeholder or implausible birth date (audit F37)", () => {
    const rows = [
      // a common name under the 1910-01-01 placeholder, birth locality "-"
      { entity_id: "10", person_key: "exemplu maria|1910-01-01|-", person_name: "EXEMPLU MARIA", birth_date: "1910-01-01", snapshot_date: "2026-07-08" },
      { entity_id: "11", person_key: "exemplu maria|1910-01-01|-", person_name: "EXEMPLU MARIA", birth_date: "1910-01-01", snapshot_date: "2026-07-08" },
      { entity_id: "10", person_key: "fictiv ion|1910-10-10|.", person_name: "FICTIV ION", birth_date: "1910-10-10", snapshot_date: "2026-07-08" },
      { entity_id: "11", person_key: "fictiv ion|1910-10-10|.", person_name: "FICTIV ION", birth_date: "1910-10-10", snapshot_date: "2026-07-08" },
      { entity_id: "10", person_key: "substitut ana|1900-01-01|-", person_name: "SUBSTITUT ANA", birth_date: "1900-01-01", snapshot_date: "2026-07-08" },
      { entity_id: "11", person_key: "substitut ana|1900-01-01|-", person_name: "SUBSTITUT ANA", birth_date: "1900-01-01", snapshot_date: "2026-07-08" },
      { entity_id: "10", person_key: "x y|2074-09-30|", person_name: "X Y", birth_date: "2074-09-30", snapshot_date: "2026-07-08" },
      { entity_id: "11", person_key: "x y|2074-09-30|", person_name: "X Y", birth_date: "2074-09-30", snapshot_date: "2026-07-08" },
    ];
    expect(sharedRepresentativePairs(rows)).toEqual([]);
    // a real date in 1910 still identifies
    const real = rows.slice(0, 2).map((r) => ({ ...r, person_key: "exemplu maria|1910-01-02|-", birth_date: "1910-01-02" }));
    expect(sharedRepresentativePairs(real)).toEqual([{ a: "10", b: "11", personKey: "exemplu maria|1910-01-02|-", name: "EXEMPLU MARIA" }]);
  });

  it("uses the same rule as the displayed label", () => {
    expect(display.ONRC_PLACEHOLDER_BIRTH_DATES).toEqual(ONRC_PLACEHOLDER_BIRTH_DATES);
    expect(display.ONRC_BIRTH_YEAR_MIN).toBe(ONRC_BIRTH_YEAR_MIN);
    expect(display.ONRC_REPRESENTATIVE_MIN_AGE).toBe(ONRC_REPRESENTATIVE_MIN_AGE);
  });
});
