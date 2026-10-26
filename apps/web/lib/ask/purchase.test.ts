import { describe, expect, it } from "vitest";
import { DA_PLAFOND_RON } from "./predicates";
import {
  codeKinds, divisionKind, kindApplies, kindLeftOutNote, kindMeetsDomain, NAMED_PROCEDURE_TYPES, PROCEDURE_ORDER, PROCEDURE_TYPES, PROCEDURE_WORDS,
  prefixKinds, PURCHASE_KIND_ORDER, valueBound, valueRangeIndex, VALUE_RANGES, valueWords,
} from "./purchase";
import { DA_CEILING_RON, PROCEDURES, PURCHASE_KINDS } from "./spec";

// F3, the common selection (plan §3, §4.1; stat final §3.1, §3.3, §3.6; kit §4).

describe("the purchase kind, from the CPV code", () => {
  it("puts every division of the catalogue in one kind: works 45, services 50–98, goods 03–44 and 48", () => {
    // The divisions of marts.cpv_tree (local copy, 26 Oct 2026: every code of the marts is in one of them).
    const divisions = ["03", "09", "14", "15", "16", "18", "19", "22", "24", "30", "31", "32", "33", "34", "35", "37", "38", "39", "41", "42", "43", "44",
      "45", "48", "50", "51", "55", "60", "63", "64", "65", "66", "70", "71", "72", "73", "75", "76", "77", "79", "80", "85", "90", "92", "98"];
    const byKind = Object.fromEntries(PURCHASE_KIND_ORDER.map((kind) => [kind, divisions.filter((d) => divisionKind(d) === kind)]));
    expect(byKind.lucrari).toEqual(["45"]);
    expect(byKind.servicii).toEqual(divisions.filter((d) => d >= "50"));
    expect(byKind.produse).toEqual([...divisions.filter((d) => d < "45"), "48"]);
    expect(divisions.every((d) => divisionKind(d) !== null)).toBe(true);
    expect([divisionKind("46"), divisionKind("47"), divisionKind("4"), divisionKind("")]).toEqual([null, null, null, null]);
    expect([...PURCHASE_KIND_ORDER].sort()).toEqual([...PURCHASE_KINDS].sort());
  });

  it("reads a prefix's kinds, a one-digit prefix every division under it", () => {
    expect([...prefixKinds("45233")]).toEqual(["lucrari"]);
    expect([...prefixKinds("33600000")]).toEqual(["produse"]);
    expect([...prefixKinds("4")].sort()).toEqual(["lucrari", "produse"]);
    expect([...prefixKinds("5")]).toEqual(["servicii"]);
  });

  it("combines with a domain: an empty intersection leaves the kind out (kit §5.3)", () => {
    expect(kindMeetsDomain("lucrari", [])).toBe(true);
    expect(kindMeetsDomain("lucrari", ["45233"])).toBe(true);
    expect(kindMeetsDomain("produse", ["45233"])).toBe(false);
    // "iluminat" (migration 0080): codes in all three kinds, each one stays.
    for (const kind of PURCHASE_KIND_ORDER) expect(kindMeetsDomain(kind, ["34993", "349285", "45316", "50232"])).toBe(true);
    expect(kindApplies("servicii", { cpv: { prefixes: ["336"] } })).toBe(false);
    expect(kindApplies("servicii", undefined)).toBe(true);
    expect(kindLeftOutNote("produse", "asfaltare")).toBe("„asfaltare” nu are coduri de produse: am numărat domeniul întreg, fără tipul ales.");
  });

  it("knows a code's kinds in the builder, never a word's", () => {
    expect(codeKinds("45")).toEqual(new Set(["lucrari"]));
    expect(codeKinds("33600000-6")).toEqual(new Set(["produse"]));
    expect(codeKinds("asfaltare")).toBeNull();
    expect(codeKinds(undefined)).toBeNull();
  });
});

describe("the procedure declared in SEAP", () => {
  it("names three procedures and leaves every other type to „Alte proceduri”", () => {
    expect([...PROCEDURE_ORDER].sort()).toEqual([...PROCEDURES].sort());
    expect(PROCEDURE_TYPES.deschisa).toEqual(["Licitatie deschisa", "Licitatie deschisa accelerata"]);
    expect(NAMED_PROCEDURE_TYPES).toEqual(["Licitatie deschisa", "Licitatie deschisa accelerata", "Procedura simplificata", "Negociere fara publicare prealabila"]);
    // The contracts' noun in each of the sentence's forms (stat final §1).
    expect(PROCEDURE_WORDS.negociere_fara_publicare.the).toBe("contractele negociate fără publicare");
    expect(PROCEDURE_WORDS.deschisa.of).toBe("contractelor din licitații deschise");
    expect(PROCEDURE_WORDS.altele.via).toBe("alte proceduri");
  });
});

describe("the size of the whole purchase", () => {
  it("has four ranges that add up to the total: the lower bound in, the upper one out", () => {
    expect(VALUE_RANGES.map((r) => r.label)).toEqual(["Sub 10.000 lei", "10.000–100.000", "100.000–1 mil.", "Peste 1 mil. lei"]);
    for (let i = 1; i < VALUE_RANGES.length; i++) expect(VALUE_RANGES[i]!.purchaseValueMin).toBe(VALUE_RANGES[i - 1]!.purchaseValueMax);
    expect(VALUE_RANGES[0]!.purchaseValueMin).toBeUndefined();
    expect(VALUE_RANGES.at(-1)!.purchaseValueMax).toBeUndefined();
    expect(valueRangeIndex({ purchaseValueMin: 1_000_000 })).toBe(3);
    expect(valueRangeIndex({ purchaseValueMin: 50_000, purchaseValueMax: 250_000 })).toBe(-1);
  });

  it("says a range in the kit's words, exactly", () => {
    expect(valueWords({ purchaseValueMin: 1_000_000 })).toBe("de peste 1 mil. lei");
    expect(valueWords({ purchaseValueMax: 10_000 })).toBe("sub 10.000 lei");
    expect(valueWords({ purchaseValueMin: 10_000, purchaseValueMax: 100_000 })).toBe("între 10.000 și 100.000 lei");
    expect(valueWords({ purchaseValueMin: 100_000, purchaseValueMax: 1_000_000 })).toBe("între 100.000 și 1 mil. lei");
    expect(valueWords({})).toBeNull();
    // A bound typed in stays whole; round millions and billions are short.
    expect([valueBound(1_250_000), valueBound(2_500_000), valueBound(1_000_000_000), valueBound(999)]).toEqual(["1.250.000", "2,5 mil.", "1 mld.", "999"]);
  });

  it("uses the engine's analysis ceiling for direct acquisitions", () => {
    expect(DA_CEILING_RON).toBe(DA_PLAFOND_RON);
  });
});
