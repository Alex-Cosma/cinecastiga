import { PROFILE_FLAG_CODES, SCORE_BAND_MIN, SCORE_MIN_DAS, scoreBand, scoreOfCriteria, scorePoints, splitGroupRecurring, type ProfileFlagRole } from "@seap/db";
import { describe, expect, it } from "vitest";
import { RISK_BAND_MIN, RISK_CRITERIA, RISK_MIN_DAS, riskBand, riskFact, riskHistoric, riskLabel, riskNoScoreReason, riskPoints, riskScoreText, riskSplitRecurring } from "./risk-score";

describe("risk score on the pages", () => {
  it("is the nightly build's criteria, bands and points", () => {
    expect(RISK_CRITERIA).toEqual(PROFILE_FLAG_CODES);
    expect(RISK_BAND_MIN).toEqual(SCORE_BAND_MIN);
    expect(RISK_MIN_DAS).toBe(SCORE_MIN_DAS);
    for (const s of [0, 1, 9, 10, 20, 39, 40, 67, 68, 100]) expect(riskBand(s)).toBe(scoreBand(s));
    for (const g of [{ total: 200, n: 2, ceiling: 100, cpvClass: "3314" }, { total: 110, n: 12, ceiling: 100 }, { total: 130, n: 12, ceiling: 100 },
      { total: 50, n: 30, ceiling: 100, cpvClass: " 4521" }, { total: 500, n: 3, ceiling: 100, cpvClass: null }])
      expect(riskSplitRecurring(g)).toBe(splitGroupRecurring(g));
    const cases: [ProfileFlagRole, Record<string, number>][] = [
      ["authority", { da_split: 1.51, da_round: 1.17 }], ["authority", { da_split: 2.51, da_concentration: 2.24 }],
      ["authority", { da_split: 3, da_year_end: 1, da_round: 1.81, da_concentration: 2.15 }], ["supplier", { da_dependence: 2, da_capacity: 1.5 }],
    ];
    for (const [role, x] of cases) {
      const pts = scorePoints(role, x);
      const parts = Object.fromEntries(Object.entries(x).map(([k, v]) => [k, { x: v, pts: pts[k as keyof typeof pts] ?? 0 }]));
      const score = Math.round(scoreOfCriteria(role, x));
      const points = riskPoints(parts, score);
      expect(points).toEqual(pts);
      expect(Object.values(points).reduce((a, b) => a + (b ?? 0), 0)).toBe(score);
    }
  });

  it("splits an older profile without stored points by its own weight", () => {
    // rf-2026.18: score 100 × (1 − Π (1 − 0.6 · x / 3)); { da_split: 1.51, da_round: 1.17 } → 47.
    const points = riskPoints({ da_split: { x: 1.51 }, da_round: { x: 1.17 } }, 47);
    expect((points.da_split ?? 0) + (points.da_round ?? 0)).toBe(47);
    expect(points.da_split).toBeGreaterThan(points.da_round ?? 0);
  });

  it("reads as a score out of 100 with the band", () => {
    expect(riskScoreText(73)).toBe("73 din 100");
    expect(riskLabel(73)).toBe("risc · pronunțat");
    expect(riskLabel(47)).toBe("risc · moderat");
    expect(riskLabel(20)).toBe("risc · slab");
    expect(riskLabel(0)).toBe("fără semnal în scor");
    expect(riskLabel(9)).toBe("fără semnal în scor");
  });

  it("reads a profile without records for 24 months as historic (rf-2026.22, S8)", () => {
    const today = new Date("2026-11-05T12:00:00Z");
    expect(riskHistoric("2024-11-04 10:00:00+02", today)).toBe(true);
    expect(riskHistoric("2024-11-05", today)).toBe(false);
    expect(riskHistoric("2026-10-01", today)).toBe(false);
    expect(riskHistoric(null, today)).toBe(false);
  });

  it("says why a profile with signals has no score (rf-2026.22)", () => {
    expect(riskNoScoreReason({ nDas: 7, scoreNote: null, score: 0 })).toBe("Sub 10 achiziții directe: semnalele se văd, dar nu fac un scor.");
    expect(riskNoScoreReason({ nDas: 300, scoreNote: "private_buyer", score: 0 })).toMatch(/^Cumpărător privat/);
    expect(riskNoScoreReason({ nDas: 300, scoreNote: null, score: 0 })).toBe("Tiparele găsite aduc sub 10 puncte: fără semnal în scor.");
    expect(riskNoScoreReason({ nDas: 300, scoreNote: null, score: 24 })).toBeNull();
  });

  it("says the facts behind each criterion tersely", () => {
    expect(riskFact("da_split", { x: 1.51, groups: 3, share: 0.09, rawShare: 0.1275, partners: 2 })).toBe("3 grupuri · 13% din valoare");
    expect(riskFact("da_split", { x: 1.2, groups: 62, share: 0.1, rawShare: 0.22, partners: 4 }, "supplier")).toBe("62 de grupuri · 22% din valoare · la 4 instituții");
    expect(riskFact("da_split", { x: 1.2, groups: 62, share: 0.1, rawShare: 0.22, partners: 4 }, "authority")).toBe("62 de grupuri · 22% din valoare");
    expect(riskFact("da_round", { x: 2.24, n: 103, expected: 11.6 })).toBe("103 achiziții la 96–100% din plafon · așteptat ~12");
    expect(riskFact("da_year_end", { x: 1, years: [{ y: 2021, pct: 0.49 }], zs: 2 })).toBe("decembrie: 2021 (49% din an)");
    expect(riskFact("da_year_end", { x: 1, years: [], zs: 2 })).toBe("decembrie peste instituțiile de același tip");
    expect(riskFact("da_concentration", { x: 1, share: 0.64, rawShare: 0.7 })).toBe("64% din valoare la un singur furnizor, fără achiziția lui cea mai mare");
    expect(riskFact("da_dependence", { x: 3, share: 0.92, partnerShare: 0.3, capture: true })).toBe("92% din vânzări la o singură instituție, 30% din achizițiile ei directe · peste capacitatea firmei");
    expect(riskFact("da_above_ceiling", { x: 1, n: 2, value: 670168, share: 0.003, partners: 1 })).toMatch(/^2 achiziții peste plafon · .+ \(sub 1% din valoare\)$/);
    expect(riskFact("da_above_ceiling", { x: 1, n: 5, value: 670168, share: 0.1, partners: 3 }, "supplier")).toMatch(/^5 achiziții peste plafon · .+ \(10% din valoare\) · la 3 instituții$/);
    expect(riskFact("da_capacity", { x: 2, year: 2022, ratio: 4.3, turnover: 120000, value: 516000, young: true }))
      .toMatch(/^2022: achiziții directe de 4,3× cifra de afaceri \(.+\) · firmă nouă$/);
    expect(riskFact("da_capacity", { x: 1, year: 2023, ratio: null, turnover: 4000, value: 300000, implausible: true }))
      .toMatch(/^2023: cifră de afaceri .+, .+ în achiziții directe$/);
    expect(riskFact("da_capacity", { x: 1, year: 2021, ratio: 0.8, turnover: 900000, value: 600000, zeroStaff: true }))
      .toMatch(/^2021: 0 angajați, .+ în achiziții directe$/);
  });
});
