import { describe, expect, it } from "vitest";
import { GLOSSARY } from "./glossary";
import { tipLines } from "./tip-text";

describe("an explanation with points", () => {
  it("reads a line break as a new line and „– ” as a point", () => {
    expect(tipLines("Un rând.\n– Primul punct.\n–  Al doilea.\n\nAlt rând.")).toEqual([
      { point: false, text: "Un rând." }, { point: true, text: "Primul punct." }, { point: true, text: "Al doilea." }, { point: false, text: "Alt rând." },
    ]);
    expect(tipLines("Un singur paragraf – cu o liniuță în el.")).toEqual([{ point: false, text: "Un singur paragraf – cu o liniuță în el." }]);
  });

  it("the score's explanation leads with what it is not, then one rule on a line", () => {
    const lines = tipLines(GLOSSARY["scor-risc"].text);
    expect(lines[0]).toEqual({ point: false, text: "Nu este o probabilitate de corupție. Arată cât de pronunțate sunt tiparele din achizițiile directe." });
    expect(lines.slice(1).every((line) => line.point)).toBe(true);
    expect(lines.slice(1).map((line) => line.text)).toContain("10–39 slab · 40–67 moderat · 68 și peste pronunțat.");
  });
});
