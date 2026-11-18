import { describe, expect, it } from "vitest";
import { stepShown } from "./discovery-keys";

// The dialog's three starting questions in Esențial: only the first is shown (owner, 18 November 2026).
const esential = (at: number) => at === 0;
const all = () => true;

describe("the search list's arrows", () => {
  it("walk every row when all are shown, as before", () => {
    expect(stepShown(-1, true, 3, all)).toBe(0);
    expect(stepShown(0, true, 3, all)).toBe(1);
    expect(stepShown(2, true, 3, all)).toBe(2);
    expect(stepShown(1, false, 3, all)).toBe(0);
    expect(stepShown(0, false, 3, all)).toBe(-1);
  });

  it("skip the rows that are not shown", () => {
    expect(stepShown(-1, true, 3, esential)).toBe(0);
    expect(stepShown(0, true, 3, esential)).toBe(0);
    expect(stepShown(0, false, 3, esential)).toBe(-1);
    expect(stepShown(-1, true, 4, (at) => at === 2)).toBe(2);
    expect(stepShown(3, false, 4, (at) => at !== 2)).toBe(1);
  });

  it("stay in the field when no row is shown", () => {
    expect(stepShown(-1, true, 3, () => false)).toBe(-1);
    expect(stepShown(-1, false, 3, () => false)).toBe(-1);
    expect(stepShown(-1, true, 0, all)).toBe(-1);
  });
});
