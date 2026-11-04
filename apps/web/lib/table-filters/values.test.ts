import { describe, expect, it } from "vitest";
import { datesChoice, monthsValue, parseAmount } from "./values";

describe("the date funnel's choice", () => {
  it("offers months only within one chosen year, and keeps the interval inside it", () => {
    expect(datesChoice({ kind: "dates", years: ["2021"], from: null, to: null })).toEqual({ years: ["2021"], from: null, to: null });
    expect(datesChoice({ kind: "dates", years: [], from: "2021-07", to: "2021-12" })).toEqual({ years: ["2021"], from: "2021-07", to: "2021-12" });
    // an interval across years (an old address) is no single year
    expect(datesChoice({ kind: "dates", years: [], from: "2020-03", to: "2021-12" }).years).toEqual([]);
    expect(monthsValue("2021", "2021-07", null)).toEqual({ kind: "dates", years: [], from: "2021-07", to: "2021-12" });
    expect(monthsValue("2021", null, "2021-06")).toEqual({ kind: "dates", years: [], from: "2021-01", to: "2021-06" });
    expect(monthsValue("2021", "2021-01", "2021-12")).toEqual({ kind: "dates", years: ["2021"], from: null, to: null });
    expect(monthsValue("2021", "2021-09", "2021-03")).toEqual({ kind: "dates", years: [], from: "2021-09", to: "2021-09" });
  });

  it("reads an amount typed the Romanian way", () => {
    expect(parseAmount("10.000")).toBe(10000);
    expect(parseAmount("10 000,50")).toBe(10000.5);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
});
