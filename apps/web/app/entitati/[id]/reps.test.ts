import { describe, expect, it } from "vitest";
import { isFillerRep } from "./reps";

describe("the representatives' fillers", () => {
  it("tells a register filler from a person", () => {
    for (const filler of ["FARA REPREZENTANT", "FĂRĂ REPREZENTANT", "Reprezentant nespecificat", "LIPSĂ NUME REPREZENTANT", "-", "X", "NU ARE", "", null]) {
      expect(isFillerRep(filler)).toBe(true);
    }
    for (const person of ["BIRCHI ILEANA MIRELA", "FARA NICOLAE", "FARAGO EMIL", "DRAGOMIR FLORIN REPREZENTANT AL SIERRA QUADRANT SPRL"]) {
      expect(isFillerRep(person)).toBe(false);
    }
  });
});
