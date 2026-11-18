import { describe, expect, it } from "vitest";
import { underIncludedEssential, underLeftOutEssential } from "./essential-words";

describe("the left-out line of „Adunate, trec de plafon” in Esențial (owner, 18 November 2026)", () => {
  it("says what the list leaves out, without the score", () => {
    expect(underLeftOutEssential(5848)).toBe("5.848 de cazuri sub 1,2× plafonul nu sunt în listă.");
    expect(underLeftOutEssential(12)).toBe("12 cazuri sub 1,2× plafonul nu sunt în listă.");
    expect(underLeftOutEssential(1)).toBe("Un caz sub 1,2× plafonul nu e în listă.");
  });
  it("says what a link with sub=1 brought in, without the score", () => {
    expect(underIncludedEssential(5848)).toBe("Sunt incluse și cele 5.848 de cazuri sub 1,2× plafonul.");
    expect(underIncludedEssential(1)).toBe("Este inclus și cazul sub 1,2× plafonul.");
  });
});
