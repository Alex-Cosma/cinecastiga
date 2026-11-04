import { describe, expect, it } from "vitest";
import {
  FIRM_DUTY, PROFILE_FLAG_CODES, SCORE_FAMILY, familyStrength, familyStrengths, ramp, scoreBand, scoreGate, scoreOf,
  scoreOfCriteria, scorePoints, splitGroupWeight, strengthAbove, strengthCapacity, strengthConcentration,
  strengthDependence, strengthRound, strengthSplit, strengthYearEnd,
} from "./profile-flags.js";

// Values from the audit's simulation on the local copy (3 November 2026).
describe("risk score (rf-2026.20)", () => {
  it("has a capacity criterion for firms and every criterion in a family", () => {
    expect(PROFILE_FLAG_CODES.supplier).toContain("da_capacity");
    expect(PROFILE_FLAG_CODES.authority).not.toContain("da_capacity");
    for (const c of [...PROFILE_FLAG_CODES.authority, ...PROFILE_FLAG_CODES.supplier]) expect(SCORE_FAMILY[c]).toBeTruthy();
  });

  it("combines families, not criteria", () => {
    expect(scoreOf([])).toBe(0);
    expect(scoreOf([1])).toBeCloseTo(20);
    expect(scoreOf([3])).toBeCloseTo(60);
    expect(scoreOf([4])).toBeCloseTo(80);
    expect(scoreOf([3, 3])).toBeCloseTo(84);
    expect(familyStrength([3, 1.5], 4)).toBeCloseTo(3.6);
    expect(familyStrength([3, 3, 3], 4)).toBe(4);
    expect(familyStrength([1.25], 1.25)).toBe(1.25);
  });

  it("keeps December and capacity alone weak", () => {
    expect(Math.round(scoreOfCriteria("authority", { da_year_end: strengthYearEnd(9) }))).toBe(25);
    expect(Math.round(scoreOfCriteria("supplier", { da_capacity: 3 }))).toBe(30);
    expect(familyStrengths("supplier", { da_capacity: 3, da_round: 1 }).capacity).toBe(3);
  });

  it("reproduces the audit's profiles", () => {
    // Geo Draft: split 1.5 (firm duty), round 3, capacity 3
    expect(Math.round(scoreOfCriteria("supplier", { da_split: 1.5, da_round: 3, da_capacity: 3 }))).toBe(89);
    // Brownstone: concentrated split 3, dependence 1.22
    expect(Math.round(scoreOfCriteria("supplier", { da_split: 3, da_dependence: 1.22 }))).toBe(70);
    // Vodafone: above 0.45 only
    expect(Math.round(scoreOfCriteria("supplier", { da_above_ceiling: 0.45 }))).toBe(9);
  });

  it("splits the displayed score into whole points that add up to it, by family", () => {
    expect(scorePoints("authority", { da_split: 3, da_round: 1.5 })).toEqual({ da_split: 60, da_round: 12 });
    const parts = scorePoints("supplier", { da_split: 1.5, da_round: 3, da_capacity: 3 });
    expect(Object.values(parts).reduce((x, y) => x! + y!, 0)).toBe(89);
    expect(scorePoints("authority", { da_split: 0 })).toEqual({});
  });

  it("bands the displayed score at 0 · 1–39 · 40–67 · 68–100", () => {
    expect(scoreBand(0)).toBe("none");
    expect(scoreBand(20)).toBe("slab");
    expect(scoreBand(39)).toBe("slab");
    expect(scoreBand(40)).toBe("moderat");
    expect(scoreBand(67)).toBe("moderat");
    expect(scoreBand(68)).toBe("puternic");
  });

  it("opens the gate at 20 DAs or 5 DAs worth 1M", () => {
    expect(scoreGate(20, 0)).toBe(true);
    expect(scoreGate(12, 5_590_000)).toBe(true); // Verostar
    expect(scoreGate(4, 2_000_000)).toBe(false);
    expect(scoreGate(19, 999_999)).toBe(false);
  });

  it("measures above the ceiling by count and value together", () => {
    expect(strengthAbove("authority", 1, 0.5, true)).toBe(0); // one event never counts
    expect(strengthAbove("authority", 2, 0, true)).toBe(1);
    expect(strengthAbove("authority", 10, 0.002, true)).toBe(1); // many hits, tiny share
    expect(strengthAbove("authority", 5, 0.10, true)).toBe(3);
    expect(strengthAbove("authority", 5, 0.10, false)).toBe(1);
    expect(strengthAbove("supplier", 10, 0.002, true)).toBe(0); // a firm needs the value too
  });

  it("weighs a firm's part in the buyer's duty (decision B)", () => {
    const spread = { top2: 0.3, utility: false };
    const close = { top2: 0.9, utility: false };
    expect(strengthAbove("supplier", 16, 0.8, true, spread)).toBe(FIRM_DUTY.cap);
    expect(strengthAbove("supplier", 16, 0.8, true, close)).toBe(3);
    expect(strengthAbove("supplier", 16, 0.8, true, { top2: 0.3, utility: true })).toBeCloseTo(0.9);
    expect(strengthSplit("supplier", 0.5, true, spread)).toBe(FIRM_DUTY.cap);
    expect(strengthSplit("supplier", 0.5, true, close)).toBe(3);
    expect(strengthSplit("authority", 0.20, true)).toBe(3);
    expect(strengthSplit("authority", 0.08, true)).toBe(2);
    expect(strengthSplit("authority", 0.01, true)).toBe(0);
  });

  it("weighs repeated-purchase groups by overrun and purchase size", () => {
    const base = { role: "authority" as const, ceiling: 100, annex2Share: 0, association: false, massSupplier: false };
    expect(splitGroupWeight({ ...base, total: 200, n: 2 })).toBe(1);
    expect(splitGroupWeight({ ...base, total: 120, n: 3 })).toBe(0); // at 1.2× the ceiling
    expect(splitGroupWeight({ ...base, total: 130, n: 172 })).toBeCloseTo(0.025); // food receipts
    expect(splitGroupWeight({ ...base, total: 200, n: 2, annex2Share: 0.6 })).toBe(0);
    expect(splitGroupWeight({ ...base, total: 200, n: 2, association: true })).toBe(0.5);
    expect(splitGroupWeight({ ...base, total: 200, n: 2, massSupplier: true })).toBe(0.5);
    expect(splitGroupWeight({ ...base, role: "supplier", total: 200, n: 2, massSupplier: true })).toBe(1);
  });

  it("reads prices just under the ceiling as bunching", () => {
    expect(strengthRound(2, 0, true)).toBe(0); // fewer than 3
    expect(strengthRound(73, 108.3, true)).toBe(0); // Orange: fewer than expected
    expect(strengthRound(81, 0, true)).toBe(3); // Geo Draft
    expect(strengthRound(10, 0.6, true)).toBeCloseTo(Math.log2(11 / 1.6));
    expect(strengthRound(10, 0.6, false)).toBe(1);
  });

  it("measures December, concentration, dependence and capacity", () => {
    expect(strengthYearEnd(1)).toBe(0);
    expect(strengthYearEnd(1.75)).toBeCloseTo(0.625);
    expect(strengthYearEnd(2.5)).toBe(1.25);

    expect(strengthConcentration(0.59, true)).toBe(0);
    expect(strengthConcentration(0.75, true)).toBe(2);
    expect(strengthConcentration(0.95, false)).toBe(1);

    expect(strengthDependence(0.69, 1, 0, true)).toBe(0);
    expect(strengthDependence(0.80, 0, 0, true)).toBeCloseTo(0.67, 2);
    expect(strengthDependence(0.90, 0.10, 0, true)).toBeCloseTo(1.5);
    expect(strengthDependence(0.90, 0.10, 2.77, true)).toBe(3); // capture
    expect(strengthDependence(0.90, 0.10, 1, true)).toBe(2);

    expect(strengthCapacity({ ratio: 1, implausible: false, young: false, zeroStaff: false })).toBe(0);
    expect(strengthCapacity({ ratio: 34, implausible: false, young: false, zeroStaff: false })).toBe(3);
    expect(strengthCapacity({ ratio: 3, implausible: false, young: true, zeroStaff: false })).toBe(2.5);
    expect(strengthCapacity({ ratio: null, implausible: true, young: false, zeroStaff: false })).toBe(1);
    expect(strengthCapacity({ ratio: null, implausible: false, young: false, zeroStaff: true })).toBe(1);
    expect(ramp(5, [[1.5, 1], [3, 2], [10, 3]])).toBeCloseTo(2 + 2 / 7);
  });
});
