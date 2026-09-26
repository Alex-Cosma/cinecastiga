import { describe, expect, it } from "vitest";
import { competitionLabel, formatTedAmount, TED_LABEL, tedPagination, tedAmountHeadline } from "./ted";

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
});
