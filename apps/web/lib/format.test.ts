import { describe, it, expect } from "vitest";
import { formatRon, formatInt, formatRonFull } from "./format.js";

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
