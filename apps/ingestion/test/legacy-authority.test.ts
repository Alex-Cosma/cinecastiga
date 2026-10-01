import { describe, expect, it } from "vitest";
import { legacyAuthorityResolver } from "../src/import-old/authority-identity.js";

const cluj = { _id: 1226, cui: "4305857", name: "Municipiul Cluj-Napoca" };
describe("legacy authority namespaces", () => {
  it("resolves the real Cluj archive CUI without inventing SICAP ID 4305857", () => {
    expect(legacyAuthorityResolver([cluj])("4305857 Municipiul Cluj-Napoca"))
      .toMatchObject({ kind: "cui", cui: "4305857", sicapIds: [1226] });
  });
  it("also resolves a genuine dimension ID", () => {
    expect(legacyAuthorityResolver([cluj])("1226 Municipiul Cluj-Napoca"))
      .toMatchObject({ kind: "sicap", cui: "4305857", sicapIds: [1226] });
  });
  it("uses source provenance when a CUI collides with another participant ID", () => {
    const resolve = legacyAuthorityResolver([cluj, { _id: 4305857, cui: "4233874", name: "Municipiul Buzău" }]);
    expect(resolve("4305857 Municipiul Cluj-Napoca").kind).toBe("cui");
    expect(resolve("4305857 Municipiul Buzau")).toMatchObject({ kind: "sicap", cui: "4233874" });
  });
  it("refuses two corroborated but conflicting namespaces", () => {
    const resolve = legacyAuthorityResolver([cluj, { _id: 4305857, cui: "14920794", name: cluj.name }]);
    expect(resolve("4305857 Municipiul Cluj-Napoca").kind).toBe("conflict");
    expect(resolve("RO 4305857 Municipiul Cluj-Napoca").kind).toBe("cui");
  });
  it("does not guess on name alone or uncorroborated CUI", () => {
    const resolve = legacyAuthorityResolver([cluj]);
    expect(resolve("4305857 Alta institutie").kind).toBe("unresolved");
    expect(resolve("14920794 Municipiul Cluj-Napoca").kind).toBe("unresolved");
    expect(resolve("Municipiul Cluj-Napoca").kind).toBe("unresolved");
  });
  it("allows several real participant IDs for the same fiscal identity", () => {
    expect(legacyAuthorityResolver([cluj, { ...cluj, _id: 456 }])("4305857 Municipiul Cluj-Napoca"))
      .toMatchObject({ kind: "cui", sicapIds: [1226, 456] });
  });
  it("fails closed on duplicate dimension IDs", () => {
    expect(() => legacyAuthorityResolver([cluj, cluj])).toThrow("Repeated");
  });
});
