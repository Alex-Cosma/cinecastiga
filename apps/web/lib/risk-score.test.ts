import { PROFILE_FLAG_CODES, SCORE_BAND_MIN, SCORE_WEIGHT, scoreBand, scorePoints } from "@seap/db";
import { describe, expect, it } from "vitest";
import { RISK_BAND_MIN, RISK_CRITERIA, RISK_WEIGHT, riskBand, riskFact, riskLabel, riskPercent, riskPoints } from "./risk-score";

describe("risk score on the pages", () => {
  it("is the nightly build's formula, criteria and bands", () => {
    expect(RISK_CRITERIA).toEqual(PROFILE_FLAG_CODES);
    expect(RISK_WEIGHT).toBe(SCORE_WEIGHT);
    expect(RISK_BAND_MIN).toEqual(SCORE_BAND_MIN);
    for (const s of [0, 1, 20, 39, 40, 67, 68, 100]) expect(riskBand(s)).toBe(scoreBand(s));
    const cases: [Record<string, number>, number][] = [
      [{ da_split: 1.51, da_round: 1.17 }, 47], [{ da_split: 2.51, da_round: 2.24 }, 73],
      [{ da_split: 3, da_year_end: 1, da_round: 1.81, da_concentration: 2.15 }, 88], [{ da_split: 1 }, 20],
    ];
    for (const [x, score] of cases) {
      const parts = Object.fromEntries(Object.entries(x).map(([k, v]) => [k, { x: v }]));
      expect(riskPoints(parts, score)).toEqual(scorePoints(x));
    }
  });

  it("reads as a percentage with the band", () => {
    expect(riskPercent(73)).toBe("73%");
    expect(riskLabel(73)).toBe("risc · puternic");
    expect(riskLabel(47)).toBe("risc · moderat");
    expect(riskLabel(20)).toBe("risc · slab");
    expect(riskLabel(0)).toBe("niciun tipar găsit");
  });

  it("says the facts behind each criterion tersely", () => {
    expect(riskFact("da_split", { x: 1.51, groups: 3, share: 0.1275, annex2Share: 0 })).toBe("3 grupuri · 13% din valoare");
    expect(riskFact("da_split", { x: 2.79, groups: 62, share: 0.22, annex2Share: 0.01 })).toBe("62 de grupuri · 22% din valoare (plus 1% în CPV din Anexa 2)");
    expect(riskFact("da_round", { x: 2.24, n: 103, share: 0.309 })).toBe("103 achiziții la 96–100% din plafon (31%)");
    expect(riskFact("da_year_end", { x: 1, years: [{ y: 2021, pct: 0.49 }] })).toBe("decembrie: 2021 (49% din an)");
    expect(riskFact("da_above_ceiling", { x: 1, n: 2, value: 670168, share: 0.003 })).toMatch(/^2 achiziții peste plafon · .+ \(sub 1% din valoare\)$/);
  });
});
