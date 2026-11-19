import { describe, expect, it } from "vitest";
import { profileLinks } from "./profile-links";
import type { AskSpec } from "./spec";

const spec = (filters: Record<string, unknown>): AskSpec => ({ block: "table", measure: "value", filters } as unknown as AskSpec);

describe("the profile buttons of an answer", () => {
  it("links a locality question to its town hall, once the answer names it", () => {
    const s = spec({ uatSiruta: 44818, uatName: "Municipiul Buzău (Buzău)" });
    expect(profileLinks(s, { id: "17" })).toEqual([{ id: "17", role: "authority", label: "Profilul primăriei", name: "Municipiul Buzău (Buzău)" }]);
    expect(profileLinks(s)).toEqual([]);
    expect(profileLinks(s, null)).toEqual([]);
  });

  it("links the institution and the firm a question names, the institution first", () => {
    expect(profileLinks(spec({ authorityId: 5, authorityName: "SPITALUL X" }))).toEqual([{ id: "5", role: "authority", label: "Profilul instituției", name: "SPITALUL X" }]);
    expect(profileLinks(spec({ supplierId: 9 }))).toEqual([{ id: "9", role: "supplier", label: "Profilul firmei", name: null }]);
    expect(profileLinks(spec({ authorityId: 5, supplierId: 9 })).map((l) => l.label)).toEqual(["Profilul instituției", "Profilul firmei"]);
  });

  it("has no button for a question about nobody in particular, nor for the one compared with", () => {
    expect(profileLinks(spec({ county: "buzau" }))).toEqual([]);
    expect(profileLinks(spec({ compareWithId: 3, compareWith: "ALTA" }))).toEqual([]);
    expect(profileLinks(null)).toEqual([]);
  });

  it("prefers the institution named by id over the locality", () => {
    expect(profileLinks(spec({ authorityId: 5, uatSiruta: 44818 }), { id: "17" }).map((l) => l.id)).toEqual(["5"]);
  });
});
