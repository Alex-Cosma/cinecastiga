import { describe, expect, it } from "vitest";
import { RISK_CRITERIA } from "./risk-score";
import { SIGNAL_GUIDANCE, signalSentence, signalShare } from "./signal-guidance";

describe("the entity page's signal rows (variant A, 4 November 2026)", () => {
  it("say what to check and how it may be explained for every criterion of the score", () => {
    for (const code of new Set([...RISK_CRITERIA.authority, ...RISK_CRITERIA.supplier])) {
      expect(SIGNAL_GUIDANCE[code].check.length, code).toBeGreaterThan(10);
      expect(SIGNAL_GUIDANCE[code].explain.length, code).toBeGreaterThan(10);
    }
  });

  it("write what was found as a sentence, from the score's parts", () => {
    expect(signalSentence("da_split", { x: 3, groups: 4, rawShare: 0.153 }, "authority"))
      .toBe("De 4 ori, aceeași firmă a câștigat în același an mai multe achiziții directe pentru același fel de lucru. Luate pe rând sunt sub plafon; adunate, îl depășesc. Împreună: 15% din bani.");
    expect(signalSentence("da_split", { x: 1, groups: 1, share: 0.02 }, "supplier"))
      .toMatch(/^O dată, aceeași instituție a cumpărat de la firmă/);
    expect(signalSentence("da_round", { x: 2, n: 16, expected: 5.8 }, "authority"))
      .toBe("16 achiziții s-au oprit la 96–100% din plafon. După restul achizițiilor directe și media națională, ne-am aștepta la vreo 6.");
    expect(signalSentence("da_round", { x: 1, n: 1 }, "authority")).toBe("1 achiziție s-a oprit la 96–100% din plafon.");
    expect(signalSentence("da_above_ceiling", { x: 2, n: 3, value: 1_300_000, share: 0.08 }, "authority"))
      .toMatch(/^3 achiziții directe au trecut de plafon: cu valoarea estimată sau cu suma finală, chiar și cu TVA\. Împreună: .+, 8% din bani\.$/);
    expect(signalSentence("da_year_end", { x: 1, years: [{ y: 2022, pct: 0.41 }, { y: 2024, pct: 0.38 }] }, "authority"))
      .toBe("În 2022, decembrie a adus 41%; în 2024, decembrie a adus 38% din achizițiile directe ale anului.");
  });

  it("fall back (null) when the part lacks the numbers, and draw a share only where one exists", () => {
    expect(signalSentence("da_split", { x: 1 }, "authority")).toBeNull();
    expect(signalSentence("da_capacity", { x: 1 }, "supplier")).toBeNull();
    expect(signalShare("da_above_ceiling", { x: 1, share: 0.08 })).toBe(0.08);
    expect(signalShare("da_round", { x: 1, n: 3 })).toBeNull();
  });
});
