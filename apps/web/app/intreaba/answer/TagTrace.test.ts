import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TAG_HOLD_MS } from "./RowFacts";
import { tracePaths } from "./TagTrace";

/*
 * The trace round a signal tag (owner, 15 November 2026): from the middle of the top and bottom edges out to both
 * sides, symmetric, closing in exactly one second, when the explanation opens.
 */
describe("a signal tag's trace", () => {
  it("is four mirrored quarters from the middle of the top and bottom edges to the middle of the sides", () => {
    const [topRight, topLeft, bottomRight, bottomLeft] = tracePaths(200, 22);
    expect(topRight).toBe("M100 0.5H195A4.5 4.5 0 0 1 199.5 5V11");
    expect(topLeft).toBe("M100 0.5H5A4.5 4.5 0 0 0 0.5 5V11");
    expect(bottomRight).toBe("M100 21.5H195A4.5 4.5 0 0 0 199.5 17V11");
    expect(bottomLeft).toBe("M100 21.5H5A4.5 4.5 0 0 1 0.5 17V11");
  });

  it("keeps its corners inside a small tag", () => {
    // A box shorter than two corners: the radius shrinks to half its height.
    expect(tracePaths(40, 6)[0]).toBe("M20 0.5H37A2.5 2.5 0 0 1 39.5 3V3");
  });

  it("closes in exactly the wait before the explanation, and is whole at once without motion", () => {
    expect(TAG_HOLD_MS).toBe(1000);
    const css = readFileSync(new URL("../builder/filters-kit.css", import.meta.url), "utf8");
    expect(css).toContain(".term-holding .tag-trace path{stroke-dashoffset:0;transition:stroke-dashoffset 1s ");
    expect(css).toContain("@media (prefers-reduced-motion:reduce){.tag-trace path{transition:none!important}}");
    // No instant border change on hover any more: the trace is the hover.
    expect(css).not.toContain(".qb-tag-tip:hover");
  });
});
