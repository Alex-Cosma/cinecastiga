import { describe, expect, it } from "vitest";
import { scoreProfile, type ProfileMeasures } from "./score.js";

/*
 * The risk score of one profile from its measures (rf-2026.20, owner
 * decisions of 3 November 2026). The SQL that measures the profiles is
 * covered by normalize/marts.integration.test.ts; the strengths and the
 * family formula by packages/db/src/profile-flags.test.ts.
 */
const measures = (over: Partial<ProfileMeasures>): ProfileMeasures => ({
  eid: "1", role: "authority", n: 100, v: 1_000_000, regime: "classic", utility: false, inhouse: false,
  above: null, groups: [], round: null, december: null, concentration: null, dependence: null, capacity: [],
  ...over,
});
const group = (partner: string, total: number, n = 2, ceiling = 100_000) =>
  ({ partner, total, n, ceiling, annex2Share: 0, association: false, massSupplier: false });
const firm = { eid: "9", role: "supplier" as const, regime: null };

describe("scoreProfile", () => {
  it("scores 0 with no parts when nothing counts", () => {
    expect(scoreProfile(measures({}))).toEqual({ eid: "1", role: "authority", score: 0, scoreRaw: 0, codes: [], parts: {}, note: null });
  });

  it("combines families and gives each criterion its points and facts", () => {
    const s = scoreProfile(measures({
      groups: [group("7", 200_000), group("8", 100_000)], // weights 1 (2× the ceiling) and 0 (1×): 20% → 3
      round: { o: 30, e: 2 }, // θ = 31/3: log2 = 3.37 → 3
      concentration: { share: 0.9, rawShare: 0.92, partner: "7" },
      december: { years: 6, top2: 2.5, flagged: [{ y: 2024, pct: 0.61 }] },
    }));
    expect(s.codes).toEqual(["da_split", "da_round", "da_year_end", "da_concentration"]);
    expect(s.parts["da_round"]).toMatchObject({ x: 3, n: 30, expected: 2 });
    expect(s.parts["da_split"]).toMatchObject({ x: 3, groups: 1, partners: 1, share: 0.2 });
    // avoid = min(4, 3 + 0.4 · 3); relation = 2 (cap); calendar = 1.25 × (2.5·6/8 − 1)/1.5 = 0.729
    const left = (1 - 0.2 * 4) * (1 - 0.2 * 2) * (1 - 0.2 * (1.25 * (2.5 * 6 / 8 - 1) / 1.5));
    expect(s.scoreRaw).toBeCloseTo(100 * (1 - left), 6);
    expect(Object.values(s.parts).reduce((a, p) => a + Number(p["pts"]), 0)).toBe(s.score);
  });

  it("weighs a firm's above-ceiling sales by decision B", () => {
    const spread = scoreProfile(measures({ ...firm, above: { n: 16, events: 16, value: 800_000, top2: 0.3, partners: 14 } }));
    expect(spread.parts["da_above_ceiling"]).toMatchObject({ x: 1.5, events: 16, partners: 14 });
    expect(spread.score).toBe(30);
    const close = scoreProfile(measures({ ...firm, above: { n: 16, events: 16, value: 800_000, top2: 0.9, partners: 2 } }));
    expect(close.parts["da_above_ceiling"]).toMatchObject({ x: 3 });
    const utility = scoreProfile(measures({ ...firm, utility: true, above: { n: 10, events: 10, value: 16_000, top2: 0.3, partners: 10 } }));
    expect(utility.score).toBeLessThan(10);
  });

  it("reads capture: a dependent firm beyond its capacity", () => {
    const s = scoreProfile(measures({
      ...firm, n: 12, v: 5_590_000,
      dependence: { share: 0.98, partnerShare: 0.1, partner: "3" },
      capacity: [{ year: 2024, ratio: 8, turnover: 500_000, turnoverYear: 2023, value: 4_000_000, employees: 1, implausible: false, young: false, zeroStaff: false }],
    }));
    expect(s.parts["da_dependence"]).toMatchObject({ x: 3, capture: true });
    expect(s.parts["da_capacity"]).toMatchObject({ year: 2024, ratio: 8 });
    expect(s.score).toBeGreaterThanOrEqual(68);
  });

  it("keeps capacity alone at 'slab' and gives the institution's own firm no score", () => {
    const cap = [{ year: 2024, ratio: 40, turnover: 10_000, turnoverYear: 2024, value: 400_000, employees: 2, implausible: false, young: false, zeroStaff: false }];
    expect(scoreProfile(measures({ ...firm, capacity: cap })).score).toBe(30);
    const own = scoreProfile(measures({ ...firm, inhouse: true, capacity: cap, round: { o: 40, e: 1 } }));
    expect(own).toMatchObject({ score: 0, codes: [], note: "inhouse" });
  });

  it("holds the avoidance and relationship criteria at 1 under the gate", () => {
    const s = scoreProfile(measures({ n: 8, v: 300_000, round: { o: 8, e: 0 }, concentration: { share: 0.95, rawShare: 0.95, partner: "2" } }));
    expect(s.parts["da_round"]?.["x"]).toBe(1);
    expect(s.parts["da_concentration"]?.["x"]).toBe(1);
  });

  it("notes the regime of an association or a private buyer", () => {
    expect(scoreProfile(measures({ regime: "association", round: { o: 8, e: 0 } })).note).toBe("association");
    expect(scoreProfile(measures({ regime: "private_buyer" })).note).toBe("private_buyer");
  });
});
