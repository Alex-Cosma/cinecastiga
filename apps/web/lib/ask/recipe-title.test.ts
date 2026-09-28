import { describe, expect, it } from "vitest";
import { copyRecipeTitle, normalizeRecipeTitle } from "./recipe-title";

describe("saved question names", () => {
  it("normalizes incidental whitespace", () => {
    expect(normalizeRecipeTitle("  Iluminat\t Buzău \n")).toBe("Iluminat Buzău");
  });
  it("numbers copies without stacking suffixes", () => {
    expect(copyRecipeTitle("Iluminat Buzău")).toBe("Iluminat Buzău — copie");
    expect(copyRecipeTitle("Iluminat Buzău — copie 2", 3)).toBe("Iluminat Buzău — copie 3");
  });
  it("leaves room for the suffix and preserves Unicode characters", () => {
    const title = copyRecipeTitle("🟢".repeat(80), 12);
    expect(title.length).toBeLessThanOrEqual(160);
    expect(title).toMatch(/ — copie 12$/);
    expect(JSON.parse(JSON.stringify(title))).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
});
