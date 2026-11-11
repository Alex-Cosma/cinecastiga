import { describe, expect, it } from "vitest";
import { axisPos, buyersWord, formatQuantity, formatRatio, formatUnitPrice, largestOf, leadHref, leadTicksPath, leadsCount, leadsWord, priceHref, ratioWords, sentenceCase } from "./unit-prices-shared";

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

  it("draws every lead once as a tick inside the strip", () => {
    expect(leadTicksPath([])).toBe("");
    // 2× sits at 55,56 % of the axis: to a quarter of a percent, once for both.
    expect(leadTicksPath([2, 2.001])).toBe("M55.5 0V1");
    // Beyond eight times the tick stays inside the right edge; a multiple that is not positive is dropped.
    expect(leadTicksPath([30, 0, -1])).toBe("M99.75 0V1");
    expect(leadTicksPath([4, 2])).toBe("M55.5 0V1M77.75 0V1");
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
