import { describe, expect, it } from "vitest";
import { leiExact, leiRounded } from "./lei";

describe("lei: amounts to the leu, the exact one with bani", () => {
  it("rounds half up to the leu on the decimal string", () => {
    expect(leiRounded("12345.4")).toBe("12.345 lei");
    expect(leiRounded("12345.5")).toBe("12.346 lei");
    expect(leiRounded("12345")).toBe("12.345 lei");
    expect(leiRounded(999.99)).toBe("1.000 lei");
    expect(leiRounded("9007199254740993.75")).toBe("9.007.199.254.740.994 lei");
    expect(leiRounded("-0.4")).toBe("0 lei");
    expect(leiRounded("abc")).toBeNull();
    expect(leiRounded(null)).toBeNull();
    expect(leiRounded("12345.4", false)).toBe("12.345");
  });
  it("gives the exact amount only when it has bani", () => {
    expect(leiExact("12345.4")).toBe("12.345,40 lei");
    expect(leiExact("12345.40")).toBe("12.345,40 lei");
    expect(leiExact("12345.00")).toBeNull();
    expect(leiExact("12345")).toBeNull();
    expect(leiExact("2499651305.2034")).toBe("2.499.651.305,20 lei");
    expect(leiExact("10.005")).toBe("10,01 lei");
    expect(leiExact("10.001")).toBeNull();
  });
});

describe("lei: another currency", () => {
  it("keeps the contract's currency", () => {
    expect(leiRounded("1500.75", "EUR")).toBe("1.501 EUR");
    expect(leiExact("1500.75", "EUR")).toBe("1.500,75 EUR");
  });
});
