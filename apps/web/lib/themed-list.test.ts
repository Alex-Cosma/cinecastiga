import { describe, expect, it } from "vitest";
import { clampLeft, placeVertical, stepEnabled, typeaheadIndex, type ListItem } from "./themed-list";

const items: ListItem[] = [
  { value: "", label: "Toate județele" },
  { value: "arges", label: "Argeș" },
  { value: "iasi", label: "Iași" },
  { value: "ilfov", label: "Ilfov", disabled: true },
  { value: "salaj", label: "Sălaj" },
];

describe("the themed dropdown list (owner, 12 November 2026)", () => {
  it("opens below its control when a comfortable list fits there", () => {
    expect(placeVertical(100, 140, 800, 336)).toEqual({ side: "below", top: 146, maxHeight: 336 });
  });

  it("is cut to the room below when that is still comfortable", () => {
    expect(placeVertical(400, 440, 700, 336)).toEqual({ side: "below", top: 446, maxHeight: 246 });
  });

  it("opens above a control near the bottom of the screen", () => {
    expect(placeVertical(600, 640, 700, 336)).toEqual({ side: "above", bottom: 106, maxHeight: 336 });
  });

  it("stays inside the screen on the right and on the left", () => {
    expect(clampLeft(40, 240, 390)).toBe(40);
    expect(clampLeft(300, 240, 390)).toBe(142);
    expect(clampLeft(-20, 240, 390)).toBe(8);
  });

  it("reaches a row by its first letters, diacritics aside, and skips a row that cannot be chosen", () => {
    expect(typeaheadIndex(items, "s", 0)).toBe(4);
    expect(typeaheadIndex(items, "i", 0)).toBe(2);
    expect(typeaheadIndex(items, "i", 2)).toBe(2);
    expect(typeaheadIndex(items, "il", 0)).toBe(-1);
    expect(typeaheadIndex(items, "x", 0)).toBe(-1);
  });

  it("walks past a row that cannot be chosen and stops at the ends", () => {
    expect(stepEnabled(items, 2, 1)).toBe(4);
    expect(stepEnabled(items, 4, -1)).toBe(2);
    expect(stepEnabled(items, 4, 1)).toBe(4);
    expect(stepEnabled(items, 0, -1)).toBe(0);
  });
});
