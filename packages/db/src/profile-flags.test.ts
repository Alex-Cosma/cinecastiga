import { describe, expect, it } from "vitest";
import {
  FIRM_DUTY, PROFILE_FLAG_CODES, SCORE_FAMILY, familyStrength, familyStrengths, firmDutyCap, ramp, scoreBand, scoreCountCap,
  scoreOf, scoreOfCriteria, scorePoints, scoreValueCap, splitGroupRecurring, splitGroupWeight, strengthAbove, strengthCapacity,
  strengthConcentration, strengthDependence, strengthRound, strengthSplit, strengthYearEnd,
} from "./profile-flags.js";

// Values from the audit's simulation on the local copy (3 November 2026).
describe("risk score (rf-2026.22)", () => {
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
    expect(familyStrengths("supplier", { da_capacity: 3, da_round: 0.5 }).capacity).toBe(2.25); // a trace lifts it gradually
    // rf-2026.22 (S9c): capacity alone counts half, so 1.6× and 535× no longer sit at the same 30.
    expect(Math.round(scoreOfCriteria("supplier", { da_capacity: 2 }))).toBe(20);
    expect(Math.round(scoreOfCriteria("supplier", { da_capacity: 1 }))).toBe(10);
    expect(familyStrengths("supplier", { da_capacity: 2, da_round: 0.5 }).capacity).toBe(1.5);
  });

  it("reproduces the audit's profiles", () => {
    // Geo Draft: split 1.5 (firm duty), round 3, capacity 3
    expect(Math.round(scoreOfCriteria("supplier", { da_split: 1.5, da_round: 3, da_capacity: 3 }))).toBe(89);
    // rf-2026.22 (B7): the buyer-duty cap holds the whole family when its sales are spread over many institutions.
    expect(familyStrengths("supplier", { da_split: 1.5, da_round: 3 }, { dutyCap: firmDutyCap(0.3) }).avoid).toBe(1.5);
    expect(Math.round(scoreOfCriteria("supplier", { da_split: 1.5, da_round: 3, da_capacity: 3 }, { dutyCap: firmDutyCap(0.3) }))).toBe(72);
    expect(familyStrengths("authority", { da_split: 3, da_round: 3 }, { dutyCap: 1.5 }).avoid).toBe(4); // institutions: no duty cap
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

  it("bands the displayed score at 0–9 · 10–39 · 40–67 · 68–100 (rf-2026.22, S9b)", () => {
    expect(scoreBand(0)).toBe("none");
    expect(scoreBand(9)).toBe("none");
    expect(scoreBand(10)).toBe("slab");
    expect(scoreBand(20)).toBe("slab");
    expect(scoreBand(39)).toBe("slab");
    expect(scoreBand(40)).toBe("moderat");
    expect(scoreBand(67)).toBe("moderat");
    expect(scoreBand(68)).toBe("puternic");
  });

  it("caps the evidence by the count, and the sums also by the value (rf-2026.22, S4a)", () => {
    expect(scoreCountCap(10)).toBe(1);
    expect(scoreCountCap(20)).toBe(2);
    expect(scoreCountCap(30)).toBe(3);
    expect(scoreCountCap(12)).toBeCloseTo(1.2); // Verostar's frequencies stay near 1
    expect(scoreValueCap(12, 5_590_000)).toBe(3); // Verostar's sums
    expect(scoreValueCap(10, 1_000_000)).toBe(2); // no step from 1 to 3 at 1M
    expect(scoreValueCap(10, 940_000)).toBeCloseTo(1.88);
    expect(scoreValueCap(10, 750_000)).toBeCloseTo(1.5);
    expect(scoreValueCap(25, 100_000)).toBeCloseTo(2.5); // the count, when higher
    expect(scoreValueCap(4, 2_000_000)).toBe(1); // under 5 DAs only the count
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
    expect(firmDutyCap(0.3)).toBe(FIRM_DUTY.cap);
    expect(firmDutyCap(0.7)).toBeCloseTo(2.25);
    expect(firmDutyCap(0.8)).toBe(3);
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
    expect(splitGroupWeight({ ...base, total: 130, n: 172 })).toBe(0); // food receipts: recurring supply (rf-2026.22, S5)
    expect(splitGroupWeight({ ...base, total: 200, n: 2, cpvClass: "3369" })).toBe(0); // medical supplies (S5)
    expect(splitGroupWeight({ ...base, total: 200, n: 11, cpvClass: "3912" })).toBeCloseTo(200 / 11 / 25); // 11 orders: still a group
    expect(splitGroupRecurring({ total: 200, n: 2, ceiling: 100, cpvClass: "3314" })).toBe("medical");
    expect(splitGroupRecurring({ total: 110, n: 12, ceiling: 100 })).toBe("small_orders");
    expect(splitGroupRecurring({ total: 130, n: 12, ceiling: 100 })).toBe(null); // the mean is 10.8% of the ceiling
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
    // rf-2026.22 (B5): at least 0.5 expected; level 2 from 5 records, level 3 from 8.
    expect(strengthRound(3, 0, true)).toBe(1); // three at the ceiling, none expected: level 1, not 2
    expect(strengthRound(9, 0, true)).toBeCloseTo(Math.log2(10 / 1.5)); // Grădinița Voinicel: 2.74, not 3
    expect(strengthRound(7, 0, true)).toBe(2);
  });

  it("measures December, concentration, dependence and capacity", () => {
    expect(strengthYearEnd(1)).toBe(0);
    expect(strengthYearEnd(1.75)).toBeCloseTo(0.625);
    expect(strengthYearEnd(2.5)).toBe(1.25);

    expect(strengthConcentration(0.49, true)).toBe(0);
    expect(strengthConcentration(0.55, true)).toBeCloseTo(0.5);
    expect(strengthConcentration(0.75, true)).toBe(2);
    expect(strengthConcentration(0.95, false)).toBe(1);

    expect(strengthDependence(0.69, 1, true)).toBe(0);
    expect(strengthDependence(0.80, 0, true)).toBeCloseTo(0.335, 2); // a small part of the institution: 0.5, reached gradually
    expect(strengthDependence(0.90, 0, true)).toBe(0.5);
    expect(strengthDependence(0.90, 0.05, true)).toBe(1);
    expect(strengthDependence(0.90, 0.10, true)).toBeCloseTo(4 / 3); // rf-2026.22 (S2): no capture, the shares only
    expect(strengthDependence(0.90, 0.60, 1.2)).toBeCloseTo(1.2); // a count cap

    expect(strengthCapacity({ ratio: 1, implausible: false, young: false, zeroStaff: false })).toBe(0);
    expect(strengthCapacity({ ratio: 1.25, implausible: false, young: false, zeroStaff: false })).toBeCloseTo(0.5);
    expect(strengthCapacity({ ratio: 34, implausible: false, young: false, zeroStaff: false })).toBe(3);
    expect(strengthCapacity({ ratio: 3, implausible: false, young: true, zeroStaff: false })).toBe(2.5);
    expect(strengthCapacity({ ratio: null, implausible: true, young: false, zeroStaff: false })).toBe(1);
    expect(strengthCapacity({ ratio: null, implausible: false, young: false, zeroStaff: true })).toBe(1);
    expect(strengthCapacity({ ratio: 34, implausible: false, young: false, zeroStaff: false }, 1.4)).toBe(1.4); // B3: the evidence cap
    expect(ramp(5, [[1.5, 1], [3, 2], [10, 3]])).toBeCloseTo(2 + 2 / 7);
  });
});
