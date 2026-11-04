import { describe, expect, it } from "vitest";
import {
  FIRM_DUTY, PROFILE_FLAG_CODES, SCORE_FAMILY, familyStrength, familyStrengths, ramp, scoreBand, scoreCap, scoreGate, scoreOf,
  scoreOfCriteria, scorePoints, splitGroupWeight, strengthAbove, strengthCapacity, strengthConcentration,
  strengthDependence, strengthRound, strengthSplit, strengthYearEnd,
} from "./profile-flags.js";

// Values from the audit's simulation on the local copy (3 November 2026).
describe("risk score (rf-2026.21)", () => {
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
    expect(familyStrengths("supplier", { da_capacity: 3, da_round: 0.5 }).capacity).toBe(2.25); // rf-2026.21: a trace lifts the cap gradually
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

  it("raises the evidence cap from 1 at 10 DAs to 3 at 30, or opens it at 5 DAs worth 1M (rf-2026.21)", () => {
    expect(scoreCap(10, 0)).toBe(1);
    expect(scoreCap(20, 0)).toBe(2);
    expect(scoreCap(30, 0)).toBe(3);
    expect(scoreCap(12, 5_590_000)).toBe(3); // Verostar
    expect(scoreCap(4, 2_000_000)).toBe(1);
    expect(scoreGate(29, 999_999)).toBe(false);
    expect(scoreGate(30, 0)).toBe(true);
  });

  it("measures above the ceiling by count and value together", () => {
    expect(strengthAbove("authority", 1, 0.5, true)).toBe(0); // one event never counts
    expect(strengthAbove("authority", 2, 0, true)).toBe(0.5); // two cases are at least 0.5 (rf-2026.21)
    expect(strengthAbove("authority", 10, 0.002, true)).toBe(0.5); // many hits, tiny share
    expect(strengthAbove("authority", 10, 0.00375, true)).toBeCloseTo(0.5); // climbing from 0.25% to level 1 at 0.5%
    expect(strengthAbove("authority", 10, 0.005, true)).toBe(1);
    expect(strengthAbove("authority", 5, 0.10, true)).toBe(3);
    expect(strengthAbove("authority", 5, 0.10, false)).toBe(1);
    expect(strengthAbove("supplier", 10, 0.002, true)).toBeCloseTo(0.1); // a firm needs the value too: 2% / 12% / 40%
    expect(strengthAbove("supplier", 9, 0.0123, true)).toBeCloseTo(0.615, 2); // OMV Petrom Marketing (was 1.29)
    expect(strengthAbove("supplier", 10, 0.12, true)).toBe(2);
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
    expect(strengthSplit("authority", 0.015, true)).toBeCloseTo(0.5); // from 1% to level 1 at 2%
    expect(strengthSplit("supplier", 0.5, true, { top2: 0.7, utility: false })).toBeCloseTo(2.25); // the cap rises 60% → 80%
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
    expect(strengthRound(4, 2.33, true)).toBeCloseTo(0, 1); // 1.5× expected: the start
    expect(strengthRound(6, 3.0, true)).toBeCloseTo(0.5); // 1.75× expected: half way to level 1
  });

  it("measures December, concentration, dependence and capacity", () => {
    expect(strengthYearEnd(1)).toBe(0);
    expect(strengthYearEnd(1.75)).toBeCloseTo(0.625);
    expect(strengthYearEnd(2.5)).toBe(1.25);

    expect(strengthConcentration(0.49, true)).toBe(0);
    expect(strengthConcentration(0.55, true)).toBeCloseTo(0.5);
    expect(strengthConcentration(0.75, true)).toBe(2);
    expect(strengthConcentration(0.95, false)).toBe(1);

    expect(strengthDependence(0.69, 1, 0, true)).toBe(0);
    expect(strengthDependence(0.80, 0, 0, true)).toBeCloseTo(0.335, 2); // a small part of the institution: 0.5, reached gradually
    expect(strengthDependence(0.90, 0, 0, true)).toBe(0.5);
    expect(strengthDependence(0.90, 0.05, 0, true)).toBe(1);
    expect(strengthDependence(0.90, 0.10, 0, true)).toBeCloseTo(4 / 3);
    expect(strengthDependence(0.90, 0.10, 0.75, true)).toBeCloseTo(4 / 3); // capture climbing: 0.75 → 1
    expect(strengthDependence(0.90, 0.10, 2.77, true)).toBe(3); // capture
    expect(strengthDependence(0.90, 0.10, 1, true)).toBe(2);

    expect(strengthCapacity({ ratio: 1, implausible: false, young: false, zeroStaff: false })).toBe(0);
    expect(strengthCapacity({ ratio: 1.25, implausible: false, young: false, zeroStaff: false })).toBeCloseTo(0.5);
    expect(strengthCapacity({ ratio: 34, implausible: false, young: false, zeroStaff: false })).toBe(3);
    expect(strengthCapacity({ ratio: 3, implausible: false, young: true, zeroStaff: false })).toBe(2.5);
    expect(strengthCapacity({ ratio: null, implausible: true, young: false, zeroStaff: false })).toBe(1);
    expect(strengthCapacity({ ratio: null, implausible: false, young: false, zeroStaff: true })).toBe(1);
    expect(ramp(5, [[1.5, 1], [3, 2], [10, 3]])).toBeCloseTo(2 + 2 / 7);
  });
});
