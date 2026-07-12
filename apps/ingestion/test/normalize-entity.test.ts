import { describe, expect, it } from "vitest";
import { canonicalCui, cuiIsValid } from "../src/normalize/cui.js";
import {
  foldDiacritics,
  normalizeName,
  parseEntityString,
} from "../src/normalize/name.js";

describe("cuiIsValid", () => {
  it("accepts the two real records", () => {
    expect(cuiIsValid("21255449")).toBe(true); // INGRID supplier
    expect(cuiIsValid("29074847")).toBe(true); // Grădinița PP nr. 4 (public inst.)
  });
  it("accepts a real winner CUI and a short state CUI", () => {
    expect(cuiIsValid("16020748")).toBe(true); // URBAN TEAM SRL (from contracts)
  });
  it("rejects a wrong check digit", () => {
    expect(cuiIsValid("21255448")).toBe(false);
    expect(cuiIsValid("29074840")).toBe(false);
  });
  it("rejects non-numeric / out-of-range", () => {
    expect(cuiIsValid("")).toBe(false);
    expect(cuiIsValid("1")).toBe(false);
    expect(cuiIsValid("12345678901")).toBe(false); // 11 digits
    expect(cuiIsValid("ABC")).toBe(false);
  });
});

describe("canonicalCui", () => {
  it("strips RO prefix — same entity with or without it", () => {
    const withRo = canonicalCui("RO21255449");
    const bare = canonicalCui("21255449");
    expect(withRo).toEqual({ cui: "21255449", valid: true });
    expect(bare).toEqual({ cui: "21255449", valid: true });
    expect(withRo.cui).toBe(bare.cui); // dedup to one key
  });
  it("strips whitespace/punctuation and leading zeros", () => {
    expect(canonicalCui(" ro 21255449 ").cui).toBe("21255449");
    expect(canonicalCui("0021255449").cui).toBe("21255449");
  });
  it("flags a foreign/garbage id as invalid but keeps the value", () => {
    const r = canonicalCui("DE811569869");
    expect(r.valid).toBe(false);
    expect(r.cui).not.toBe(""); // not discarded — caller routes to name/id tier
  });
  it("flags a 13-digit CNP-shaped value as invalid (don't merge on it)", () => {
    expect(canonicalCui("1920616123457").valid).toBe(false);
  });
  it("handles null/empty", () => {
    expect(canonicalCui(null)).toEqual({ cui: "", valid: false });
    expect(canonicalCui("RO")).toEqual({ cui: "", valid: false });
  });
});

describe("foldDiacritics", () => {
  it("folds both cedilla and comma-below variants identically", () => {
    expect(foldDiacritics("Școala")).toBe("scoala"); // comma-below ș U+0219
    expect(foldDiacritics("Şcoala")).toBe("scoala"); // cedilla ş U+015F
    expect(foldDiacritics("reparaţii")).toBe("reparatii"); // cedilla ţ
    expect(foldDiacritics("Grădiniță")).toBe("gradinita");
  });
});

describe("normalizeName", () => {
  it("splits legal form off a company name", () => {
    const r = normalizeName("S.C. INGRID S.R.L.");
    expect(r.normalized).toBe("ingrid"); // SC marker dropped, SRL → legalForm
    expect(r.legalForm).toBe("srl");
  });
  it("keeps ordinal + locality for public institutions (identity!)", () => {
    const a = normalizeName("Gradinita PP nr. 4 Lugoj");
    const b = normalizeName("Gradinita PP nr. 5 Lugoj");
    expect(a.normalized).toBe("gradinita pp nr 4 lugoj");
    expect(a.legalForm).toBeNull();
    expect(a.normalized).not.toBe(b.normalized); // nr 4 ≠ nr 5 → distinct
  });
  it("does not strip ambiguous short tokens from names", () => {
    // "CN" (Colegiul Național) must survive — it's not a legal form here.
    expect(normalizeName("Colegiul National CN Mihai Eminescu").normalized).toContain(
      "cn",
    );
  });
});

describe("parseEntityString", () => {
  it("parses a supplier string with RO prefix", () => {
    expect(parseEntityString("RO21255449 S.C. INGRID S.R.L.")).toEqual({
      cuiRaw: "RO21255449",
      name: "S.C. INGRID S.R.L.",
    });
  });
  it("parses an authority string without prefix", () => {
    expect(parseEntityString("29074847 Gradinita PP nr. 4 Lugoj")).toEqual({
      cuiRaw: "29074847",
      name: "Gradinita PP nr. 4 Lugoj",
    });
  });
  it("treats a non-CUI-led string as all name", () => {
    expect(parseEntityString("Primăria Comunei Vama")).toEqual({
      cuiRaw: null,
      name: "Primăria Comunei Vama",
    });
  });
});
