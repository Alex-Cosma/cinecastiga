import { describe, expect, it } from "vitest";
import { FLAG_META, FLAG_ORDER, flagLabel } from "./flags";
import { riskEvidenceLine } from "./risk-presentation";
import { RISK_CRITERIA } from "./risk-score";
import { CASE_RECORD_CODES } from "./signal-case";
import { caseUnitWords, firstMonthAge, firstMonthWords } from "./signal-case-words";
import { RECORDED_ID_CODES } from "./signal-evidence";
import { firstMonth } from "./signal-mirror";

/*
 * "Contracte în prima lună de la înființare" and its reverse on the institution (rf-2026.24; owner, 13 November
 * 2026): what the pages say from the evidence the build stores (apps/ingestion/src/flags/first-month.ts).
 */
const firm = {
  total: 284501.3, count: 71, buyers: 20, buyers_all: 1168, registered_on: "2023-08-02", first_award_on: "2023-08-08", last_award_on: "2023-09-01",
  age_days: 6, window_days: 30, top_buyer: 2146783, top_buyer_total: 71913.6, closest_value: 61455.8, closest_ceiling: 270120, near_ceiling: false,
  date_fallback_count: 0, source_ids: ["1", "2"],
};
const single = {
  total: 890000, count: 1, buyers: 1, buyers_all: 1, registered_on: "2023-10-05", first_award_on: "2023-10-27", last_award_on: "2023-10-27",
  age_days: 22, window_days: 30, top_buyer: 2129807, top_buyer_total: 890000, closest_value: 890000, closest_ceiling: 900400, near_ceiling: true,
  older_firm: 31, older_firm_name: "FIRMA VECHE SRL", older_firm_same_buyer: true, date_fallback_count: 0, source_ids: ["3"],
};
const buyer = {
  total: 890000, count: 1, firm_total: 890000, firm_buyers: 1, buyers_all: 1, registered_on: "2023-10-05", first_award_on: "2023-10-27",
  last_award_on: "2023-10-27", age_days: 22, window_days: 30, closest_value: 890000, closest_ceiling: 900400, near_ceiling: true, source_ids: ["3"],
};
const input = (evidence: Record<string, unknown>, partnerName: string | null = null) => ({ id: "1", partnerId: partnerName ? "9" : null, partnerName, period: "2023", evidence, records: [] });

describe("contracte în prima lună de la înființare (rf-2026.24)", () => {
  it("has its two names, on the firm and on the institution, outside the score", () => {
    expect(flagLabel("da_first_month")).toBe("Contracte în prima lună de la înființare");
    expect(flagLabel("da_first_month_buyer")).toBe("Contracte cu firme în prima lună de la înființare");
    expect(FLAG_META.da_first_month!.subject).toBe("supplier");
    expect(FLAG_META.da_first_month_buyer!.subject).toBe("authority");
    expect(FLAG_ORDER).toContain("da_first_month");
    expect(FLAG_ORDER).toContain("da_first_month_buyer");
    // Informative: neither is a criterion of the risk score.
    expect([...RISK_CRITERIA.supplier, ...RISK_CRITERIA.authority] as string[]).not.toContain("da_first_month");
    expect([...RISK_CRITERIA.supplier, ...RISK_CRITERIA.authority] as string[]).not.toContain("da_first_month_buyer");
    expect(FLAG_META.da_first_month!.caveat).toContain("nu intră în scor");
    expect(FLAG_META.da_first_month_buyer!.caveat).toContain("nu intră în scor");
  });

  it("lists exactly the awards the case recorded", () => {
    for (const code of ["da_first_month", "da_first_month_buyer"]) {
      expect(RECORDED_ID_CODES.has(code)).toBe(true);
      expect(CASE_RECORD_CODES.has(code)).toBe(true);
    }
  });

  it("says the firm's case in one line: the registration, the age at the first award, what was contracted", () => {
    expect(riskEvidenceLine("da_first_month", firm)).toBe(
      "Înmatriculată la 02.08.2023; prima achiziție directă, după 6 zile. În primele 30 de zile: 284.501 lei, 71 de achiziții, de la 20 de instituții.");
    expect(riskEvidenceLine("da_first_month", single)).toBe(
      "Înmatriculată la 05.10.2023; prima achiziție directă, după 22 de zile. În primele 30 de zile: 890.000 lei, 1 achiziție, de la o singură instituție (singura din achizițiile ei directe din arhivă)."
      + " O achiziție de 890.000 lei: 98% din plafonul de 900.400 lei."
      + " Un reprezentant legal are și o firmă mai veche, FIRMA VECHE SRL, care contractase cu aceeași instituție.");
    // The day of the registration itself, and a missing day.
    expect(riskEvidenceLine("da_first_month", { ...firm, age_days: 0 })).toContain("prima achiziție directă, chiar în ziua înmatriculării.");
    expect(riskEvidenceLine("da_first_month", { ...firm, registered_on: null })).toContain("Înmatriculată la o dată neprecizată");
  });

  it("says the same fact from the institution's side", () => {
    expect(riskEvidenceLine("da_first_month_buyer", buyer)).toBe(
      "Firmă înmatriculată la 05.10.2023. La prima achiziție avea 22 de zile. În primele ei 30 de zile, instituția a contractat cu ea 890.000 lei, 1 achiziție."
      + " Instituția este singurul ei cumpărător din achizițiile directe ale arhivei. O achiziție de 890.000 lei: 98% din plafonul de 900.400 lei.");
    expect(riskEvidenceLine("da_first_month_buyer", { ...buyer, firm_total: 230000, firm_buyers: 2, near_ceiling: false, older_firm: 31, older_firm_name: "FIRMA VECHE SRL" })).toBe(
      "Firmă înmatriculată la 05.10.2023. La prima achiziție avea 22 de zile. În primele ei 30 de zile, instituția a contractat cu ea 890.000 lei, 1 achiziție."
      + " În aceeași perioadă, firma a contractat în total 230.000 lei cu 2 instituții."
      + " Un reprezentant legal al firmei are și o firmă mai veche, FIRMA VECHE SRL, care contractase cu instituția.");
  });

  it("never says 100% of the ceiling for an award under it, and says when it is over", () => {
    expect(riskEvidenceLine("da_first_month", { ...single, closest_value: 900399 })).toContain("99% din plafonul de 900.400 lei");
    expect(riskEvidenceLine("da_first_month", { ...single, closest_value: 950000 })).toContain("O achiziție de 950.000 lei: peste plafonul de 900.400 lei.");
  });

  it("reads the case for the page", () => {
    const m = firstMonth(input(single));
    expect(m).toMatchObject({ total: 890000, count: 1, buyers: 1, buyersAll: 1, registeredOn: "2023-10-05", firstAwardOn: "2023-10-27", ageDays: 22, windowDays: 30,
      closestValue: 890000, closestCeiling: 900400, nearCeiling: true, olderFirmId: "31", olderFirmName: "FIRMA VECHE SRL", olderFirmSameBuyer: true });
    // Without a known ceiling nothing is "close to the ceiling"; a missing window is the rule's 30 days.
    expect(firstMonth(input({ total: 120000, near_ceiling: false, closest_value: null }))).toMatchObject({ closestValue: null, closestCeiling: null, nearCeiling: false, windowDays: 30, ageDays: null, olderFirmId: null });
  });

  it("titles the firm's page and the institution's", () => {
    expect(firstMonthWords("da_first_month", [firstMonth(input(firm))], 1)).toEqual({
      title: "Firma a contractat 284.501 lei în primele 30 de zile de la înființare.",
      lede: "Înmatriculată la 2 august 2023; prima achiziție directă, după 6 zile. 71 de achiziții directe de la 20 de instituții.",
    });
    expect(firstMonthWords("da_first_month_buyer", [firstMonth(input(buyer, "VLAMICON CONSTRUCT S.R.L."))], 1)).toEqual({
      title: "Instituția a contractat 890.000 lei cu o firmă aflată în primele 30 de zile de la înființare.",
      lede: "VLAMICON CONSTRUCT S.R.L., înmatriculată la 5 octombrie 2023: prima achiziție, după 22 de zile.",
    });
    const two = [firstMonth(input(buyer, "A SRL")), firstMonth(input({ ...buyer, total: 110000 }, "B SRL"))];
    expect(firstMonthWords("da_first_month_buyer", two, 2)).toEqual({
      title: "Instituția a contractat cu 2 firme aflate în primele 30 de zile de la înființare.",
      lede: "În total 1 mil. lei, în achiziții directe publicate în prima lună a fiecărei firme.",
    });
    // More cases than the page shows: no sum of a part.
    expect(firstMonthWords("da_first_month_buyer", two, 60).lede).toBeNull();
    expect(firstMonthAge(0)).toBe("chiar în ziua înmatriculării");
    expect(firstMonthAge(1)).toBe("după 1 zi");
    expect(firstMonthAge(null)).toBeNull();
    expect(caseUnitWords("da_first_month_buyer", 3)).toBe("3 firme");
    expect(caseUnitWords("da_first_month", 1)).toBe("1 caz");
  });
});
