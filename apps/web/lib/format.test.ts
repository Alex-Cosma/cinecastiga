import { describe, it, expect } from "vitest";
import { formatRon, formatInt, formatRonFull, formatExactDecimal, formatCalendarDate, onrcBirthYear, birthNote, IMPLAUSIBLE_BIRTH_DATE_LABEL, countyLabel, isAbroadCounty } from "./format.js";

describe("countyLabel", () => {
  it("never shows the SICAP „NA” placeholder for a firm registered abroad", () => {
    expect(countyLabel("NA")).toBe("firmă străină");
    expect(countyLabel(" na ")).toBe("firmă străină");
    expect(countyLabel("N/A")).toBe("firmă străină");
    expect(countyLabel("NA", "Polonia")).toBe("Polonia");
    expect(isAbroadCounty("NA")).toBe(true);
  });
  it("keeps real counties and drops empty values", () => {
    expect(countyLabel("Cluj")).toBe("Cluj");
    expect(countyLabel("Cluj", "Polonia")).toBe("Cluj");
    expect(countyLabel("Neamț")).toBe("Neamț");
    expect(countyLabel("")).toBeNull();
    expect(countyLabel(null)).toBeNull();
    expect(isAbroadCounty("Nasaud")).toBe(false);
  });
});

it("formats normalized civil dates without reinterpreting a timezone or dropping an unknown", () => {
  expect(formatCalendarDate("2026-01-01 00:15", true)).toBe("01.01.2026, 00:15");
  expect(formatCalendarDate("2025-07-16")).toBe("16.07.2025");
  expect(formatCalendarDate(null)).toBe("Dată neprecizată");
  expect(formatCalendarDate("2025-07-15T21:00:00Z")).toBe("Dată neprecizată");
});

describe("formatRon", () => {
  it("compacts billions and millions in Romanian", () => {
    expect(formatRon(21_350_585_413)).toBe("21,4 mld. lei");
    expect(formatRon(351_294_628)).toBe("351,3 mil. lei");
  });
  it("keeps small amounts as plain lei", () => {
    expect(formatRon(4200)).toContain("lei");
  });
  it("handles null and non-finite", () => {
    expect(formatRon(null)).toBe("—");
    expect(formatRon("not-a-number")).toBe("—");
  });
});

describe("formatInt / formatRonFull", () => {
  it("formats integers and null", () => {
    expect(formatInt(161557)).toContain("161");
    expect(formatInt(null)).toBe("—");
    expect(formatRonFull(null)).toBe("—");
  });
});

describe("exact source decimals", () => {
  it("groups source amounts while retaining precision beyond a JavaScript number", () => {
    expect(formatExactDecimal("10523096.15")).toBe("10.523.096,15");
    expect(formatExactDecimal("9007199254740993.012340")).toBe("9.007.199.254.740.993,012340");
    expect(formatExactDecimal("-1234567.89")).toBe("-1.234.567,89");
  });
  it("retains sub-cent shares and source decimal places", () => {
    expect(formatExactDecimal("0.00330")).toBe("0,00330");
    expect(formatExactDecimal("900400")).toBe("900.400");
    expect(formatExactDecimal("0.00")).toBe("0,00");
  });
  it("shows a one-digit money fraction in bani without changing the value (audit F39)", () => {
    // marts.signal_lookup id 31239736: total_ron::text = '5401738.1'
    expect(formatExactDecimal("5401738.1")).toBe("5.401.738,10");
    expect(formatExactDecimal("-0.5")).toBe("-0,50");
    expect(formatExactDecimal("10523096.15")).toBe("10.523.096,15");
    expect(formatExactDecimal("123456.789")).toBe("123.456,789");
    expect(formatExactDecimal("12.5", { money: false })).toBe("12,5");
  });
  it("leaves missing and invalid values unrepresented", () => {
    expect(formatExactDecimal(null)).toBe("—");
    expect(formatExactDecimal("NaN")).toBe("—");
  });
});

describe("ONRC birth years (audit F37)", () => {
  // Observed on the 2026-07-08 ONRC snapshot: 0002-06-20, 959, 1000-01-01,
  // 1900-01-01 placeholders, 2058, 2074, 4949, 9999-01-01.
  it("withholds and labels years before 1910, in the future or under 16 at the snapshot", () => {
    for (const y of [2, 959, 1000, 1900, 1909, 2011, 2022, 2058, 2074, 4949, 9999])
      expect(onrcBirthYear(y, 2026)).toEqual({ birthYear: null, birthDateImplausible: true });
  });
  it("keeps plausible years, including the boundaries", () => {
    expect(onrcBirthYear(1910, 2026)).toEqual({ birthYear: 1910, birthDateImplausible: false });
    expect(onrcBirthYear(1963, 2026)).toEqual({ birthYear: 1963, birthDateImplausible: false });
    expect(onrcBirthYear(2010, 2026)).toEqual({ birthYear: 2010, birthDateImplausible: false });
    expect(onrcBirthYear("1974", "2026")).toEqual({ birthYear: 1974, birthDateImplausible: false });
  });
  it("measures age against the snapshot year, not today", () => {
    expect(onrcBirthYear(2010, 2025).birthDateImplausible).toBe(true);
    expect(onrcBirthYear(2009, 2025).birthYear).toBe(2009);
  });
  it("labels the 1910 placeholders when the full date is known (audit F37)", () => {
    expect(onrcBirthYear(1910, 2026, "1910-01-01")).toEqual({ birthYear: null, birthDateImplausible: true });
    expect(onrcBirthYear(1910, 2026, "1910-10-10")).toEqual({ birthYear: null, birthDateImplausible: true });
    expect(onrcBirthYear(1910, 2026, "1910-03-15")).toEqual({ birthYear: 1910, birthDateImplausible: false });
    expect(birthNote({ ...onrcBirthYear(1910, 2026, "1910-01-01"), birthLocality: null })).toBe(IMPLAUSIBLE_BIRTH_DATE_LABEL);
  });
  it("does not invent a label when ONRC has no date", () => {
    expect(onrcBirthYear(null, 2026)).toEqual({ birthYear: null, birthDateImplausible: false });
    expect(birthNote({ birthYear: null, birthDateImplausible: false, birthLocality: "Cluj-Napoca" })).toBeNull();
  });
  it("renders the year or the label, never an implausible year", () => {
    expect(birthNote({ birthYear: 1963, birthLocality: "Cluj-Napoca" })).toBe("n. 1963, Cluj-Napoca");
    const note = birthNote({ ...onrcBirthYear(2074, 2026), birthLocality: null });
    expect(note).toBe(IMPLAUSIBLE_BIRTH_DATE_LABEL);
    expect(note).not.toMatch(/\d/);
  });
});
