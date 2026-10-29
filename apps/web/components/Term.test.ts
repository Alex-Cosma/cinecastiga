import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Term, { tipOpensBelow } from "./Term";

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

  it("starts above, as the kit draws it, and the CSS has the flipped place", () => {
    const html = renderToStaticMarkup(createElement(Term, { tip: true, title: "Ponderile", text: "Cota fiecărui canal." }));
    expect(html).toContain('class="term term-tip"');
    expect(html).not.toContain("term-below");
    const css = readFileSync(new URL("../app/guide.css", import.meta.url), "utf8");
    expect(css).toContain(".term-tip.term-below>.term-def{top:calc(100% + 6px);bottom:auto}");
  });
});
