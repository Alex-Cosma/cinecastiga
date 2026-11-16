import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMs, perimeterPath, startAtTop, tracePaths } from "./outline";

/*
 * The outline family (UX audit motion pass, 16 November 2026): the trace round a large target that holds its
 * explanation (M-01; owner, 15 November 2026 for the signal tags), the selection drawn once (M-03), the arrival (M-09),
 * the save at work (M-08).
 */
describe("the trace round a target that holds its explanation", () => {
  it("is four mirrored quarters from the middle of the top and bottom edges to the middle of the sides", () => {
    const [topRight, topLeft, bottomRight, bottomLeft] = tracePaths(200, 22);
    expect(topRight).toBe("M100 0.5H195A4.5 4.5 0 0 1 199.5 5V11");
    expect(topLeft).toBe("M100 0.5H5A4.5 4.5 0 0 0 0.5 5V11");
    expect(bottomRight).toBe("M100 21.5H195A4.5 4.5 0 0 0 199.5 17V11");
    expect(bottomLeft).toBe("M100 21.5H5A4.5 4.5 0 0 1 0.5 17V11");
  });

  it("keeps its corners inside a small tag and takes a pill's round ends", () => {
    expect(tracePaths(40, 6)[0]).toBe("M20 0.5H37A2.5 2.5 0 0 1 39.5 3V3");
    // A pill (border-radius 999px): the ends are half circles.
    expect(tracePaths(60, 20, 999)[0]).toBe("M30 0.5H50A9.5 9.5 0 0 1 59.5 10V10");
  });

  it("closes in exactly the wait before the explanation (--hold), and is whole at once without motion", () => {
    const globals = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
    expect(globals).toContain("--hold: 1000ms");
    const css = readFileSync(new URL("./outline.css", import.meta.url), "utf8");
    expect(css).toContain(".term-holding .tag-trace path { stroke-dashoffset: 0; transition: stroke-dashoffset var(--hold) var(--ease-hold); }");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.tag-trace path, \.term-hold-line \.term-words::before \{ transition: none !important; \}/);
    // No instant border change on hover: the trace is the hover.
    expect(readFileSync(new URL("../../app/intreaba/builder/filters-kit.css", import.meta.url), "utf8")).not.toContain(".qb-tag-tip:hover");
  });
});

describe("time tokens", () => {
  it("reads ms and s, and falls back on anything else", () => {
    expect(parseMs(" 1000ms", 5)).toBe(1000);
    expect(parseMs(".2s", 5)).toBe(200);
    expect(parseMs("", 5)).toBe(5);
    expect(parseMs("fast", 5)).toBe(5);
  });
});

describe("a selection drawn from the top of its area", () => {
  it("restarts a closed polygon at its highest point", () => {
    expect(startAtTop("M0 10L5 0L10 10Z")).toBe("M5 0L10 10L0 10Z");
    expect(startAtTop("M0,10 L5,2 L10,10 L5,20 Z")).toBe("M5 2L10 10L5 20L0 10Z");
  });

  it("leaves curves, relative commands and several rings as they are", () => {
    expect(startAtTop("M0 10C1 2 3 4 5 6Z")).toBe("M0 10C1 2 3 4 5 6Z");
    expect(startAtTop("m0 10l5 -10l5 10z")).toBe("m0 10l5 -10l5 10z");
    expect(startAtTop("M0 10L5 0L10 10ZM20 10L25 0L30 10Z")).toBe("M0 10L5 0L10 10ZM20 10L25 0L30 10Z");
  });

  it("already at the top: unchanged", () => {
    expect(startAtTop("M5 0L10 10L0 10Z")).toBe("M5 0L10 10L0 10Z");
  });
});

describe("the piece that turns round a button at work", () => {
  it("is one closed outline clockwise from the middle of the top edge", () => {
    expect(perimeterPath(100, 40, 8)).toBe("M50 0.75H92A7.25 7.25 0 0 1 99.25 8V32A7.25 7.25 0 0 1 92 39.25H8A7.25 7.25 0 0 1 0.75 32V8A7.25 7.25 0 0 1 8 0.75Z");
  });
});
