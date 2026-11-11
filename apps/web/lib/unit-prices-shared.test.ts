import { describe, expect, it } from "vitest";
import { axisPos, buyersWord, formatQuantity, formatRatio, formatUnitPrice, leadsCount, leadsWord, ratioWords } from "./unit-prices-shared";

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
});
