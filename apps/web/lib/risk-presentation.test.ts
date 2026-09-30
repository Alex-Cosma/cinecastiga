import { describe, expect, it } from "vitest";
import { nearThresholdEvidence, riskEvidenceLine, signalPeriodLabel } from "./risk-presentation";

describe("distance from a procurement threshold", () => {
  it("shows the one-leu gap rather than rounding a sub-threshold value to 100%", () => {
    expect(nearThresholdEvidence({ closing: "270119", ceiling: "270120", type: "da_ceiling_goods_services" }))
      .toBe("270.119 lei — cu 1 leu sub pragul de 270.120 lei (produse / servicii).");
  });
  it("preserves decimal differences without binary floating point subtraction", () => {
    expect(nearThresholdEvidence({ closing: "270119.99", ceiling: "270120.00", type: "da_ceiling_works" }))
      .toBe("270.119,99 lei — cu 0,01 lei sub pragul de 270.120,00 lei (lucrări).");
  });
  it("preserves precision beyond JS safe integers and tiny fractions", () => {
    expect(nearThresholdEvidence({ closing: "9007199254740993.012340", ceiling: "9007199254740993.012341" }))
      .toContain("cu 0,000001 lei sub pragul");
  });
  it("handles differing scales and whole differences with trailing zeroes", () => {
    expect(nearThresholdEvidence({ closing: "270020.00", ceiling: "270120" })).toContain("cu 100 lei sub pragul");
    expect(nearThresholdEvidence({ closing: "269120", ceiling: "270120.000" })).toContain("cu 1.000 lei sub pragul");
  });
  it("does not describe equal or over-threshold legacy evidence as below", () => {
    expect(nearThresholdEvidence({ closing: "10", ceiling: "10.00" })).toContain("egală cu pragul");
    expect(nearThresholdEvidence({ closing: "11.00", ceiling: "10" })).toContain("cu 1 leu peste pragul");
  });
  it.each([{}, { closing: null, ceiling: "100" }, { closing: "1", ceiling: "0" },
    { closing: "x", ceiling: "10" }, { closing: -1, ceiling: 10 },
    { closing: 9007199254740992, ceiling: "9007199254740993" }])("keeps invalid/unknown values explicit: %j", evidence => {
    expect(nearThresholdEvidence(evidence)).toContain("nu poate fi calculată");
  });
});

describe("risk explanation limits", () => {
  it("does not invent zero employees, zero ratios or a per-employee amount when evidence is absent", () => {
    const staff = riskEvidenceLine("fin_tiny_staff", { employees: 0, total: "2000000", year: 2025 });
    expect(staff).toContain("0 salariați");
    expect(staff).not.toContain("per salariat");
    expect(riskEvidenceLine("fin_public_reliance", {})).toContain("pondere necunoscută");
    expect(riskEvidenceLine("fin_public_reliance", {})).not.toContain("NaN");
  });
  it("preserves ratios over 100% without describing them as collected revenue", () => {
    const line = riskEvidenceLine("fin_public_reliance", { ratio: 1.7, public_total: 1700000, revenue_total: 1000000, years: 2 });
    expect(line).toContain("170%");
    expect(line).toContain("Nu reprezintă ponderea încasărilor");
  });
  it("does not silently assign unknown or all-time periods to the current year", () => {
    expect(signalPeriodLabel(null)).toContain("nu este precizată");
    expect(signalPeriodLabel("all")).toContain("disponibilă la calcul");
    expect(signalPeriodLabel("2021")).toContain("2021");
  });
});
