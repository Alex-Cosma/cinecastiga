import { describe, expect, it } from "vitest";
import { onrcRegistration } from "./firm-registry.js";

// Formats on the 2026-07-08 ONRC snapshot (4,197,473 numbers, all parsed):
// Jcc/n/yyyy with a one- or two-digit office, and Jyyyy + 6-digit sequence + 3 digits.
describe("ONRC registration numbers (plan F5)", () => {
  it("reads the year and sequence of both formats, for companies, PFAs and cooperatives", () => {
    expect(onrcRegistration("J12/345/2004")).toEqual({ year: 2004, sequence: 345 });
    expect(onrcRegistration("J1/100/2012")).toEqual({ year: 2012, sequence: 100 });
    expect(onrcRegistration("F12/661/2014")).toEqual({ year: 2014, sequence: 661 });
    expect(onrcRegistration("C01/1/2007")).toEqual({ year: 2007, sequence: 1 });
    expect(onrcRegistration("J2024000123408")).toEqual({ year: 2024, sequence: 123 });
    expect(onrcRegistration("J1990000001127")).toEqual({ year: 1990, sequence: 1 });
    expect(onrcRegistration("F2026034688009")).toEqual({ year: 2026, sequence: 34688 });
  });

  it("orders a same-year tie by the sequence as a number, not as text", () => {
    // "J12/99/2015" sorts after "J05/100/2015" as text; 100 is the later registration.
    expect(onrcRegistration("J05/100/2015")!.sequence).toBeGreaterThan(onrcRegistration("J12/99/2015")!.sequence);
  });

  it("reads nothing from other shapes", () => {
    for (const value of ["", "J12/345", "J12/345/04", "X12/345/2004", "J202400012340", "J20240001234081", "RO12345678"])
      expect(onrcRegistration(value)).toBeNull();
  });
});
