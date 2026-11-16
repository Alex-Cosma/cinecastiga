import { describe, expect, it } from "vitest";
import { groupSharedAdmin, peopleByFirms, peopleKey, sharedPeopleWords } from "./signal-shared-admin";

const pair = (id: string, partnerId: string, person: string, firms: number, total: number) =>
  ({ id, partnerId, partnerName: `Inst ${partnerId}`, totalRon: total, evidence: { person, n_firms: firms, combined: total, roles: ["administrator"], authority: `Inst ${partnerId}` } });

describe("the shared representatives, one row per institution (UX audit Z6-23)", () => {
  const rows = groupSharedAdmin([
    pair("1", "10", "POPESCU IONEL", 3, 500), pair("2", "10", "CHITA DAN", 2, 300), pair("3", "20", "POPESCU IONEL", 3, 900),
    pair("4", "10", "ZAHARIA CEZAR", 3, 500), pair("5", "20", "POPESCU IONEL", 3, 100),
  ]);
  it("groups the pairs by institution, the largest group first, its sum the largest pair's", () => {
    expect(rows.map((r) => [r.partnerId, r.pairs, r.largest])).toEqual([["20", 2, { id: "3", value: 900, firms: 3 }], ["10", 3, { id: "1", value: 500, firms: 3 }]]);
  });
  it("names each person once, by how many firms each represents", () => {
    expect(rows[1]!.people.map((p) => p.name)).toEqual(["POPESCU IONEL", "ZAHARIA CEZAR", "CHITA DAN"]);
    expect(peopleByFirms(rows[1]!.people).map((g) => [g.people.map((p) => p.name), g.firms])).toEqual([[["POPESCU IONEL", "ZAHARIA CEZAR"], 3], [["CHITA DAN"], 2]]);
    expect(sharedPeopleWords(4)).toBe("4 reprezentanți comuni");
    expect(sharedPeopleWords(1)).toBe("1 reprezentant comun");
    expect(peopleKey(rows[0]!.people)).toBe("POPESCU IONEL:3");
  });
});
