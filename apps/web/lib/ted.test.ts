import { describe, expect, it } from "vitest";
import { competitionLabel, entityCountryLabel, formatTedAmount, TED_LABEL, tedPagination, tedAmountHeadline, tedCoverageNote } from "./ted";

describe("TED evidence presentation", () => {
  it("preserves exact decimals above the safe integer boundary and original currencies", () => {
    expect(formatTedAmount("9007199254740993.12345", "EUR")).toBe("9.007.199.254.740.993,12345 EUR");
    expect(formatTedAmount("0.00", "RON")).toBe("0 RON");
    expect(formatTedAmount(".5000", "RON")).toBe("0,5 RON");
    expect(formatTedAmount("-0.5", "USD")).toBe("−0,5 USD");
  });
  it("does not silently assume RON or turn missing into zero", () => {
    expect(formatTedAmount("19.5", null)).toContain("monedă neprecizată");
    expect(formatTedAmount(null, "RON")).toBe("—");
  });
  it("shows known framework/range values without treating them as an award total", () => {
    const details = { version: 2 as const, amounts: [{ kind: "payable" as const, value: "100", currency: "EUR", source: "PayableAmount" }],
      tenders: [], resultIds: [], missingTenderIds: [], framework: true, matchEligible: false };
    expect(tedAmountHeadline({ awardedValue: null, currency: null, amountKind: "framework_offer", amountDetails: details })).toBe("100 EUR");
    expect(tedAmountHeadline({ awardedValue: null, currency: null, amountKind: "tender_range", amountDetails: { ...details,
      amounts: [{ kind: "tender_lower", value: "0", currency: "RON", source: "LowerTenderAmount" },
        { kind: "tender_upper", value: "100", currency: "RON", source: "HigherTenderAmount" }] } })).toBe("Minim 0 RON · Maxim 100 RON");
  });
  it("keeps malformed and excessive URL pages within the actual result set", () => {
    expect(tedPagination(Infinity, 60, 100).page).toBe(1);
    expect(tedPagination(NaN, 60, 100).offset).toBe(0);
    expect(tedPagination(999999999, 60, 100)).toEqual({ page: 2, pageSize: 60, totalPages: 2, offset: 60 });
    expect(tedPagination(1.5, Infinity, 0)).toEqual({ page: 1, pageSize: 50, totalPages: 1, offset: 0 });
  });
  it("distinguishes unknown competition from multiple bidders and possible from confirmed links", () => {
    expect(competitionLabel(null)).toBe("Număr de oferte necunoscut");
    expect(competitionLabel(0)).toBe("0 oferte primite");
    expect(competitionLabel(1)).toBe("1 ofertă primită");
    expect(TED_LABEL["possible-match"]?.title).toContain("posibilă");
  });
  it("does not call an entity with a foreign marker and country RO either foreign or Romanian (audit F26)", () => {
    expect(entityCountryLabel(true, "RO")).toBe("țară de verificat");
    expect(entityCountryLabel(true, " ro ")).toBe("țară de verificat");
    expect(entityCountryLabel(true, "CA")).toBe("firmă străină · Canada");
    expect(entityCountryLabel(true, null)).toBe("firmă străină");
    expect(entityCountryLabel(false, "DE")).toBeNull();
  });
  it("states the TED publication period and that SEAP runs later (audit F29)", () => {
    const obs = (dataset: "da" | "contracts" | "ted", date_from: string | null, date_to: string | null) =>
      ({ dataset, calculated_at: "2026-10-02 02:54:13+00", observation: { available: "1", missing_date: "0", missing_cpv: "0", date_from, date_to } });
    // Local snapshot of 1 Oct 2026 (marts.data_coverage).
    const snapshot = { observations: [obs("da", "2018-04-02", "2026-09-25"), obs("contracts", "2000-01-06", "2026-09-25"), obs("ted", "2018-01-03", "2026-06-30")] };
    const note = tedCoverageNote(snapshot);
    expect(note).toContain("Publicații TED preluate: 03.01.2018 – 30.06.2026");
    expect(note).toContain("după 30.06.2026 nu sunt încă preluate");
    expect(note).toContain("Datele SEAP din aplicație ajung până la 25.09.2026");
    // TED as current as SEAP: no shorter-period warning.
    expect(tedCoverageNote({ observations: [obs("da", "2018-04-02", "2026-06-30"), obs("ted", "2018-01-03", "2026-06-30")] }))
      .not.toContain("Datele SEAP");
    // No inventory: never invent a period.
    expect(tedCoverageNote(null)).toContain("nu este încă inventariată");
    expect(tedCoverageNote({ observations: [obs("ted", null, null)] })).toContain("nu este încă inventariată");
  });
});
