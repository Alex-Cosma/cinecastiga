import { describe, expect, it } from "vitest";
import { fillTransforms, holding } from "./drill-camera";

// UX audit M-20: the chosen domain widens to fill the bar; going up, the bar comes out of the domain that holds the level.
describe("drill camera", () => {
  const bar = [{ left: 0, width: 50 }, { left: 50, width: 30 }, { left: 80, width: 20 }];
  it("scales the bar around the chosen segment so that it fills the width", () => {
    const t = fillTransforms(bar, 1, 100);
    // the chosen one: from its left edge, moved to 0, scaled 100/30
    expect(t[1]).toBe("translateX(-50.00px) scaleX(3.3333)");
    // its neighbours keep their places relative to it (the left one goes out to the left, the right one to the right)
    expect(t[0]).toBe("translateX(-166.67px) scaleX(3.3333)");
    expect(t[2]).toBe("translateX(20.00px) scaleX(3.3333)");
    // where each one's left edge lands: left + translate; the chosen ends at 0, the next at 100 (the bar's end)
    expect(80 + 20).toBe(100);
  });
  it("leaves a bar without the chosen segment as it is", () => {
    expect(fillTransforms(bar, 5, 100)).toEqual(["none", "none", "none"]);
  });
  it("finds the domain that holds a deeper code", () => {
    expect(holding(["45", "71", null], "4523")).toBe(0);
    expect(holding(["4523", "4524"], "4524")).toBe(1);
    expect(holding(["33", "71"], "45")).toBe(-1);
  });
});
