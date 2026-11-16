import { describe, expect, it } from "vitest";
import { baniDecimal, signalLei } from "./signal-money";

describe("a signal's sums in bani (UX audit bug)", () => {
  it("rounds a derived sum's long fraction half up to two decimals, exactly", () => {
    expect(signalLei("2499651305.2034")).toBe("2.499.651.305,20 lei");
    expect(signalLei("2054695062.7711")).toBe("2.054.695.062,77 lei");
    expect(signalLei("21308192.454999999949807603005800")).toBe("21.308.192,45 lei");
    expect(baniDecimal("8920048.4550")).toBe("8920048.46");
    expect(baniDecimal("0.995")).toBe("1.00");
    expect(baniDecimal("-3.456")).toBe("-3.46");
  });
  it("keeps a value of two decimals or fewer as stored", () => {
    expect(signalLei("5401738.1")).toBe("5.401.738,10 lei");
    expect(signalLei("187819006.44")).toBe("187.819.006,44 lei");
    expect(signalLei("71704744")).toBe("71.704.744 lei");
    expect(signalLei(694139.25)).toBe("694.139,25 lei");
    expect(signalLei(null)).toBeNull();
    expect(signalLei("abc")).toBeNull();
  });
});
