import { describe, expect, it } from "vitest";
import {
  parseCpvObject,
  parseCpvString,
  resolveCpv,
} from "../src/normalize/cpv.js";
import { resolveUnit, unitKey } from "../src/normalize/unit.js";

describe("parseCpvString", () => {
  it("extracts the code from a jammed LIST string", () => {
    expect(parseCpvString("15800000-6 - Diverse produse alimentare (Rev.2)").code).toBe(
      "15800000-6",
    );
  });
  it("keeps raw and returns null code for unparseable input", () => {
    expect(parseCpvString("not a cpv")).toEqual({ code: null, raw: "not a cpv" });
    expect(parseCpvString(null)).toEqual({ code: null, raw: null });
  });
});

describe("parseCpvObject", () => {
  it("uses localeKey as the clean code", () => {
    expect(
      parseCpvObject({ text: "Lucrari... (Rev.2)", localeKey: "45453000-7" }).code,
    ).toBe("45453000-7");
  });
});

describe("resolveCpv", () => {
  const catalog = new Set(["15800000-6"]);
  it("flags valid vs unknown but always keeps raw", () => {
    expect(resolveCpv({ code: "15800000-6", raw: "x" }, catalog)).toEqual({
      cpvCode: "15800000-6",
      cpvValid: true,
      cpvRaw: "x",
    });
    // Unknown code: not dropped, flagged invalid, raw retained.
    expect(resolveCpv({ code: "99999999-9", raw: "y" }, catalog)).toEqual({
      cpvCode: null,
      cpvValid: false,
      cpvRaw: "y",
    });
  });
});

describe("unit mapping", () => {
  it("canonicalizes spelling variants to one key", () => {
    expect(unitKey("Bucată")).toBe("bucata");
    expect(unitKey("BUCATA")).toBe("bucata");
    expect(unitKey("  bucata ")).toBe("bucata");
  });
  it("resolves via the map, keeps raw, null when unmapped", () => {
    const map = new Map([["bucata", { canonicalUnit: "buc", factor: "1" }]]);
    expect(resolveUnit("Bucată", map)).toEqual({
      unitRaw: "Bucată",
      unitCanonical: "buc",
      unitFactor: "1",
    });
    expect(resolveUnit("cutie cu 5 fiole", map)).toEqual({
      unitRaw: "cutie cu 5 fiole",
      unitCanonical: null,
      unitFactor: null,
    });
  });
});
