import { describe, expect, it } from "vitest";
import { looksLikePerson } from "./build.js";

// „Știați că” (owner, 26 November 2026): a fact never names an entity whose name is a person's.
describe("names a fact must not carry", () => {
  it("sees a person behind a PFA, a cabinet or an individual enterprise", () => {
    for (const name of ["POPESCU ION PFA", "P.F.A. Ionescu Maria", "CABINET INDIVIDUAL DE PSIHOLOGIE X", "Ionescu Dan Întreprindere Individuală", "IONESCU D. I.I.",
      "Birou Individual de Arhitectură Y", "Persoana fizica autorizata Z", null, ""]) expect(looksLikePerson(name), String(name)).toBe(true);
  });
  it("leaves institutions and companies alone", () => {
    for (const name of ["SPITALUL JUDETEAN DE URGENTA BACAU", "COMUNA GREACA (PRIMARIA COMUNEI GREACA)", "S.C. RAJA S.A. CONSTANTA", "Euro-Asfalt", "MEDICA EXPERT SRL",
      "INSTITUTUL CLINIC FUNDENI", "Compania Nationala de Investitii"]) expect(looksLikePerson(name), name).toBe(false);
  });
});
