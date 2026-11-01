import { describe, expect, it } from "vitest";
import {
  PROFILE_FLAG_CODES, scoreBand, scoreOf, scorePoints, strengthAbove, strengthConcentration, strengthDependence,
  strengthRound, strengthSplit, strengthYearEnd,
} from "./profile-flags.js";

// Values from the signals investigation on the local copy (E, 1 November 2026).
describe("risk score (rf-2026.18)", () => {
  it("has no rapid criterion and the above-ceiling one for both roles", () => {
    expect(PROFILE_FLAG_CODES.authority).not.toContain("da_rapid");
    expect(PROFILE_FLAG_CODES.supplier).not.toContain("da_rapid");
    expect(PROFILE_FLAG_CODES.authority).toContain("da_above_ceiling");
    expect(PROFILE_FLAG_CODES.supplier).toContain("da_above_ceiling");
  });

  it("combines strengths so one criterion caps at 60 and level 1 alone is 20", () => {
    expect(scoreOf([])).toBe(0);
    expect(scoreOf([1])).toBeCloseTo(20);
    expect(scoreOf([3])).toBeCloseTo(60);
    expect(scoreOf([3, 3])).toBeCloseTo(84);
    expect(scoreOf([9])).toBeCloseTo(60);
  });

  it("reproduces the investigation's profiles", () => {
    expect(Math.round(scoreOf([1.51, 1.17]))).toBe(47); // firm 2110241
    expect(Math.round(scoreOf([2.51, 2.24]))).toBe(73); // Municipiul Constanța
    expect(Math.round(scoreOf([3]))).toBe(60); // Institutul Clinic Fundeni
    expect(Math.round(scoreOf([3, 1, 1.81, 2.15]))).toBe(88); // Ocolul Silvic Rășinari
  });

  it("splits the displayed score into whole points that add up to it", () => {
    expect(scorePoints({ da_split: 1.51, da_round: 1.17 })).toEqual({ da_split: 27, da_round: 20 });
    expect(scorePoints({ da_split: 2.51, da_round: 2.24 })).toEqual({ da_split: 39, da_round: 34 });
    const parts = scorePoints({ a: 3, b: 1, c: 1.81, d: 2.15 });
    expect(Object.values(parts).reduce((x, y) => x + y, 0)).toBe(88);
    expect(scorePoints({ a: 0 })).toEqual({ a: 0 });
  });

  it("bands the displayed score at 0 · 20–39 · 40–67 · 68–100", () => {
    expect(scoreBand(0)).toBe("none");
    expect(scoreBand(20)).toBe("slab");
    expect(scoreBand(39)).toBe("slab");
    expect(scoreBand(40)).toBe("moderat");
    expect(scoreBand(67)).toBe("moderat");
    expect(scoreBand(68)).toBe("puternic");
    expect(scoreBand(100)).toBe("puternic");
  });

  it("gives each criterion its level at the thresholds and 1 without the gate", () => {
    expect(strengthSplit("authority", 0, true, 0.5)).toBe(0);
    expect(strengthSplit("authority", 3, false, 0.5)).toBe(1);
    expect(strengthSplit("authority", 3, true, 0)).toBe(1);
    expect(strengthSplit("authority", 3, true, 0.10)).toBe(2);
    expect(strengthSplit("authority", 3, true, 0.25)).toBe(3);
    expect(strengthSplit("supplier", 3, true, 0.25)).toBe(2);
    expect(strengthSplit("supplier", 3, true, 0.375)).toBeCloseTo(2.5);

    expect(strengthYearEnd(0, true, 0.5)).toBe(0);
    expect(strengthYearEnd(1, false, 0.5)).toBe(1);
    expect(strengthYearEnd(1, true, 0.5)).toBe(1.5);
    expect(strengthYearEnd(2, true, 2)).toBeCloseTo(2.999);
    expect(strengthYearEnd(3, true, 0)).toBe(3);

    expect(strengthRound("supplier", 100, true, 10)).toBe(0); // exactly 10% is not more than 10%
    expect(strengthRound("supplier", 100, true, 11)).toBeGreaterThanOrEqual(1);
    expect(strengthRound("authority", 1000, true, 10)).toBe(1); // 5+ such DAs and 1%
    expect(strengthRound("supplier", 100, true, 25)).toBeCloseTo(1.99); // exactly 25% stays at level 1
    expect(strengthRound("supplier", 100, true, 26)).toBeGreaterThanOrEqual(2);
    expect(strengthRound("supplier", 100, true, 51)).toBe(3);
    expect(strengthRound("supplier", 4, true, 4)).toBe(0); // under 5 DAs

    expect(strengthConcentration(false, true, 0.95)).toBe(0);
    expect(strengthConcentration(true, true, 0.60)).toBe(1);
    expect(strengthConcentration(true, true, 0.75)).toBe(2);
    expect(strengthConcentration(true, true, 0.90)).toBe(3);

    expect(strengthDependence(true, true, 0)).toBe(1);
    expect(strengthDependence(true, true, 0.20)).toBe(2);
    expect(strengthDependence(true, true, 0.50)).toBe(3);

    expect(strengthAbove(1, true, 0.5)).toBe(0); // one record never sets a level
    expect(strengthAbove(2, true, 0)).toBe(1);
    expect(strengthAbove(3, true, 0.05)).toBe(2);
    expect(strengthAbove(4, true, 0)).toBe(2);
    expect(strengthAbove(4, true, 0.20)).toBe(3);
    expect(strengthAbove(10, true, 0)).toBe(3);
    expect(strengthAbove(5, false, 0.5)).toBe(1);
  });
});
