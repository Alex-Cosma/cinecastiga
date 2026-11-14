import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Term, { tipOpensBelow, tipPlace } from "./Term";

describe("a floating (?) that would open past the top of the screen opens below its row (S4t-tip-above)", () => {
  it("opens above while it fits under the screen's top or the sticky header", () => {
    // „Ponderile” at 320 px: the strip scrolled to y 40, a 120 px definition would start at −86.
    expect(tipOpensBelow(40, 120, 0)).toBe(true);
    // Under the 58 px header: the definition would start at 30, behind it.
    expect(tipOpensBelow(156, 120, 58)).toBe(true);
    expect(tipOpensBelow(300, 120, 58)).toBe(false);
    // Exactly at the edge still fits; a header scrolled away (a negative bottom) counts as the screen's top.
    expect(tipOpensBelow(184, 120, 58)).toBe(false);
    expect(tipOpensBelow(130, 120, -20)).toBe(false);
    // Not measured yet (hidden): never flipped.
    expect(tipOpensBelow(10, 0, 0)).toBe(false);
  });
});

describe("every (?) is placed from its own \"?\" (14 November 2026: some opened at the top of a whole section)", () => {
  const phone = { width: 390, height: 844 }, desktop = { width: 1280, height: 800 };
  const at = (left: number, top: number) => ({ left, top, bottom: top + 24 });

  it("opens above the \"?\", starting a little before it", () => {
    expect(tipPlace(at(300, 500), { width: 340, height: 100 }, desktop, 58)).toEqual({ left: 288, top: 394, maxHeight: null });
  });

  it("stays 16 px inside the screen's sides", () => {
    // A "?" at the right edge of a phone: the box moves left, not off the screen.
    expect(tipPlace(at(360, 500), { width: 358, height: 100 }, phone, 58).left).toBe(16);
    expect(tipPlace(at(1250, 500), { width: 360, height: 100 }, desktop, 58).left).toBe(1280 - 360 - 16);
    // A "?" at the very left: never before the 16 px gutter.
    expect(tipPlace(at(4, 500), { width: 200, height: 100 }, phone, 58).left).toBe(16);
  });

  it("opens below when the sticky header or the screen's top would cut it", () => {
    expect(tipPlace(at(100, 120), { width: 200, height: 100 }, phone, 58)).toEqual({ left: 88, top: 150, maxHeight: null });
  });

  it("with room on neither side, takes the side with more and scrolls inside it", () => {
    // Under the header, 700 px of text on a 700 px screen: 474 px below vs 116 above.
    expect(tipPlace(at(100, 180), { width: 200, height: 700 }, { width: 390, height: 700 }, 58)).toEqual({ left: 88, top: 210, maxHeight: 700 - 16 - 204 - 6 });
    // Near the bottom: more room above, the box starts under the header.
    expect(tipPlace(at(100, 600), { width: 200, height: 700 }, { width: 390, height: 700 }, 58)).toEqual({ left: 88, top: 58, maxHeight: 600 - 6 - 58 });
  });

  it("renders closed as a manual popover, and the CSS floats it over everything at the text's width", () => {
    const html = renderToStaticMarkup(createElement(Term, { tip: true, title: "Ponderile", text: "Cota fiecărui canal." }));
    expect(html).toContain('class="term term-tip"');
    expect(html).not.toContain("term-shown");
    expect(html).toMatch(/class="term-def" role="tooltip" tabindex="-1" popover="manual"/);
    const css = readFileSync(new URL("../app/guide.css", import.meta.url), "utf8");
    expect(css).toContain(".term-tip>.term-def{display:none;position:fixed;inset:auto;z-index:70;width:max-content;max-width:min(360px,calc(100vw - 32px));");
    expect(css).toContain(".term-tip.term-shown>.term-def{display:block}");
    // No page moves a (?) on its own any more: the old per-page anchors are gone.
    expect(css).not.toContain("term-below");
  });
});
