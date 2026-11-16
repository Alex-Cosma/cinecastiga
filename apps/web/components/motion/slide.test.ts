import { describe, expect, it } from "vitest";
import { cssMs, fromBox, marked } from "./slide";

// UX audit M-07: a tab's fill starts on the tab left and travels to the chosen one.
describe("slide", () => {
  it("reads CSS times in either unit (approved.css writes .26s, globals.css 260ms)", () => {
    expect(cssMs("260ms", 1)).toBe(260);
    expect(cssMs(" .26s", 1)).toBeCloseTo(260);
    expect(cssMs("", 160)).toBe(160);
    expect(cssMs("fast", 160)).toBe(160);
  });
  it("puts the new box on the old one from its top-left corner", () => {
    expect(fromBox({ left: 10, top: 20, width: 50, height: 30 }, { left: 110, top: 20, width: 100, height: 30 })).toBe("translate(-100px, 0px) scale(0.5000, 1.0000)");
  });
  it("counts an attribute as a mark unless absent or false", () => {
    expect(marked("page")).toBe(true);
    expect(marked("true")).toBe(true);
    expect(marked("false")).toBe(false);
    expect(marked(null)).toBe(false);
  });
});
