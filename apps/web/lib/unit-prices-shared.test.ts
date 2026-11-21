import { describe, expect, it } from "vitest";
import { axisPos, buyersWord, formatQuantity, formatRatio, formatUnitPrice, largestOf, leadHref, leadsCount, leadsWord, priceHref, ratioWords, sentenceCase } from "./unit-prices-shared";

describe("unit prices: the strip and the words", () => {
  it("puts half and double at the same distance from the median, and clamps beyond the axis", () => {
    expect(axisPos(1)).toBe(33.33);
    expect(axisPos(2) - axisPos(1)).toBeCloseTo(axisPos(1) - axisPos(0.5), 1);
    expect(axisPos(8)).toBe(100);
    expect(axisPos(30)).toBe(100);
    expect(axisPos(0.1)).toBe(0);
  });

  it("never rounds a lead's multiple up past what it is", () => {
    expect(formatRatio(4.73)).toBe("4,7×");
    expect(formatRatio(1.999)).toBe("1,9×");
    expect(ratioWords(2.04)).toBe("de 2,0 ori mediana");
  });

  it("reads prices, quantities and counts in Romanian", () => {
    expect(formatUnitPrice(35)).toBe("35,00");
    expect(formatUnitPrice(0.152)).toBe("0,152");
    expect(formatQuantity(2510, "lei/kg")).toBe("2.510 kg");
    expect(formatQuantity(1330, "lei/top")).toBe("1.330 topuri");
    expect(formatQuantity(1, "lei/top")).toBe("1 top");
    expect(leadsWord(19)).toBe("19 prețuri peste dublu");
    expect(leadsWord(21, true)).toBe("21 de prețuri peste dublul medianei");
    expect(leadsWord(1)).toBe("un preț peste dublu");
    expect(leadsWord(0)).toBe("niciun preț peste dublu");
    expect(leadsCount(1656)).toBe("1.656 peste dublu");
    expect(buyersWord(442)).toBe("442 de instituții");
    expect(buyersWord(16)).toBe("16 instituții");
  });

  it("says which leads have a dot when not all do", () => {
    expect(largestOf(14, 195)).toBe("cele mai mari 14 din 195");
    expect(largestOf(40, 1250)).toBe("cele mai mari 40 din 1.250");
    expect(largestOf(12, 12)).toBeNull();
    expect(largestOf(0, 0)).toBeNull();
  });

  it("opens a sentence with a capital, diacritics included", () => {
    expect(sentenceCase(leadsWord(0))).toBe("Niciun preț peste dublu");
    expect(sentenceCase("șapte")).toBe("Șapte");
    expect(sentenceCase(leadsCount(12))).toBe("12 peste dublu");
  });

  it("keeps the default order out of the address and pins one institution in one year", () => {
    const state = { year: null, group: null, product: null, county: null, order: "lei" as const };
    expect(priceHref(state)).toBe("/preturi");
    expect(priceHref(state, { order: "multiplu", county: "Cluj" })).toBe("/preturi?judet=Cluj&ordine=multiplu");
    expect(leadHref("lapte", "", 2019, { authorityId: "2134596", year: 2019 })).toBe("/preturi/lapte?an=2019&deschis=2134596-2019#institutie-2134596-2019");
  });
});

describe("the median beside a strip (UX audit Z6-40)", () => {
  it("is one number for a year, a range said as such across years", async () => {
    const { medianWords, priceYearLabel, priceYearWithLeads } = await import("./unit-prices-shared");
    expect(medianWords(2.97, 2.97, "lei/kg", 2019)).toEqual({ label: "mediana 2019", value: "2,97\u00a0lei/kg" });
    expect(medianWords(2.97, 6.55, "lei/kg", null)).toEqual({ label: "mediana, de la an la an", value: "2,97–6,55\u00a0lei/kg" });
    expect(medianWords(3, 3, "lei/kg", null).label).toBe("mediana");
    expect(priceYearLabel(2025, 0)).toBe("2025 · prea puține date");
    expect(priceYearLabel(2019, 217)).toBe("2019");
    expect(priceYearWithLeads({ 2018: 148, 2019: 217, 2025: 0, 2026: 0 })).toBe(2019);
  });
});
