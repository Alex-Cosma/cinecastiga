import { describe, expect, it } from "vitest";
import { scorePoints } from "@seap/db";
import { scoreProfile } from "./score.js";

/*
 * The risk score of one profile from its measures (rf-2026.18, owner decision
 * of 1 November 2026): strength x (0–3) per criterion, score = 100 × (1 − Π (1
 * − 0.6 · x / 3)), levels 2–3 only with 20 DAs and 500.000 lei. The SQL that
 * measures the profiles is covered by normalize/marts.integration.test.ts.
 */
type Measures = Parameters<typeof scoreProfile>[0];
const measures = (over: Partial<Measures>): Measures => ({
  eid: "1", role: "authority", n: 100, v: 1_000_000,
  split_groups: 0, v_split: 0, v_a2: 0, n_round: 0, n_above: 0, v_above: 0,
  ye_k: 0, ye_r: 0, ye_years: null,
  conc_met: false, conc_t: null, conc_partner: null,
  dep_met: false, dep_share: null, dep_rev: null, dep_partner: null,
  ...over,
});
/** Every criterion of an institution, each between its levels. */
const allFive: Partial<Measures> = {
  split_groups: 4, v_split: 250_000, v_a2: 50_000, // 20% outside Annex 2: 2 + (0.2 − 0.1) / 0.15
  n_round: 30, // 30% of 100 DAs at 96–100% of the ceiling: 2 + (0.3 − 0.25) / 0.25
  ye_k: 1, ye_r: 0.5, ye_years: [{ y: 2024, pct: 0.61 }], // one December year, the best other halfway: 1.5
  conc_met: true, conc_t: 0.9, conc_partner: "7", // 90% at one firm: 3
  n_above: 3, v_above: 60_000, // 3 cases, 6% of the value: 2
};

describe("scoreProfile", () => {
  it("scores 0 with no parts when no criterion is met", () => {
    expect(scoreProfile(measures({}))).toEqual({ eid: "1", role: "authority", score: 0, scoreRaw: 0, codes: [], parts: {} });
  });

  it("combines the strengths in the role's order, with the facts behind each", () => {
    const s = scoreProfile(measures(allFive));
    expect(s.codes).toEqual(["da_split", "da_round", "da_year_end", "da_concentration", "da_above_ceiling"]);
    expect(s.parts).toEqual({
      da_split: { x: 2.6667, groups: 4, share: 0.2, annex2Share: 0.05 },
      da_round: { x: 2.2, n: 30, share: 0.3 },
      da_year_end: { x: 1.5, years: [{ y: 2024, pct: 0.61 }] },
      da_concentration: { x: 3, share: 0.9, partnerId: "7" },
      da_above_ceiling: { x: 2, n: 3, value: 60_000, share: 0.06 },
    });
    const left = (1 - 0.2 * (2 + 0.1 / 0.15)) * (1 - 0.2 * 2.2) * (1 - 0.2 * 1.5) * (1 - 0.2 * 3) * (1 - 0.2 * 2);
    expect(s.scoreRaw).toBeCloseTo(100 * (1 - left), 10);
    expect(s.score).toBe(96);
    // The whole points the profile shows add up to the displayed score.
    const points = scorePoints(Object.fromEntries(Object.entries(s.parts).map(([c, p]) => [c, Number(p["x"])])));
    expect(Object.values(points).reduce((a, b) => a + b, 0)).toBe(s.score);
  });

  it("keeps every met criterion at strength 1 below 20 DAs or 500.000 lei", () => {
    for (const small of [{ n: 19, n_round: 6 }, { v: 499_999 }]) {
      const s = scoreProfile(measures({ ...allFive, ...small }));
      expect(Object.values(s.parts).map((p) => p["x"])).toEqual([1, 1, 1, 1, 1]);
      // Five weak patterns: 100 × (1 − 0.8⁵) = 67,2, still "moderat".
      expect(s.score).toBe(67);
    }
    expect(scoreProfile(measures({ n: 5, v: 10_000, n_round: 1 })).score).toBe(20);
  });

  it("caps one pattern at 60 and starts level 1 at 20", () => {
    const supplier = { eid: "9", role: "supplier" as const, n: 50, v: 1_000_000 };
    const dependent = scoreProfile(measures({ ...supplier, dep_met: true, dep_share: 0.97, dep_rev: 0.5, dep_partner: "3" }));
    expect(dependent).toMatchObject({ score: 60, codes: ["da_dependence"], parts: { da_dependence: { x: 3, share: 0.97, partnerShare: 0.5, partnerId: "3" } } });
    expect(dependent.scoreRaw).toBeCloseTo(60, 10);
    // Just met: dependence on an institution of which the firm holds a negligible share.
    expect(scoreProfile(measures({ ...supplier, dep_met: true, dep_share: 0.9, dep_rev: 0 })).score).toBe(20);
  });

  it("reads only the role's criteria", () => {
    const firm = scoreProfile(measures({ ...allFive, role: "supplier", dep_met: true, dep_share: 0.9, dep_rev: 0.1 }));
    expect(firm.codes).toEqual(["da_split", "da_round", "da_dependence", "da_above_ceiling"]);
    // Firms: split levels at 25% / 50% of the value, just under the ceiling from 10%.
    expect(firm.parts["da_split"]?.["x"]).toBe(1.8);
    expect(firm.parts["da_round"]?.["x"]).toBe(2.2);
    expect(firm.parts["da_dependence"]?.["x"]).toBe(1.5);
    const institution = scoreProfile(measures({ dep_met: true, dep_share: 1, dep_rev: 1 }));
    expect(institution).toMatchObject({ score: 0, codes: [] });
  });

  it("does not let one above-ceiling record or Annex 2 repeated purchases go past level 1", () => {
    expect(scoreProfile(measures({ n_above: 1, v_above: 900_000 })).score).toBe(0);
    expect(scoreProfile(measures({ n_above: 2, v_above: 900_000 })).parts["da_above_ceiling"]).toMatchObject({ x: 1, n: 2, share: 0.9 });
    expect(scoreProfile(measures({ split_groups: 12, v_split: 600_000, v_a2: 600_000 })).parts["da_split"])
      .toEqual({ x: 1, groups: 12, share: 0, annex2Share: 0.6 });
  });

  it("meets 'Chiar sub plafon' at institutions from 5 such DAs and 1%, at firms only above 10%", () => {
    const many = { n: 1000, v: 50_000_000, n_round: 10 };
    expect(scoreProfile(measures(many)).parts["da_round"]).toEqual({ x: 1, n: 10, share: 0.01 });
    expect(scoreProfile(measures({ ...many, role: "supplier" })).codes).toEqual([]);
    expect(scoreProfile(measures({ ...many, n_round: 4 })).codes).toEqual([]);
  });
});
