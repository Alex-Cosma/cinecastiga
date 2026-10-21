import { describe, expect, it } from "vitest";
import { sharedRepresentativePairs } from "./shared-representatives";

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
});
