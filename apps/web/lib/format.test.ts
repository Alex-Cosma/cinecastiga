import { describe, it, expect } from "vitest";
import { formatRon, formatInt, formatRonFull, formatExactDecimal, formatCalendarDate } from "./format.js";

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
  it("leaves missing and invalid values unrepresented", () => {
    expect(formatExactDecimal(null)).toBe("—");
    expect(formatExactDecimal("NaN")).toBe("—");
  });
});
