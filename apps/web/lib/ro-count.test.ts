import { describe, expect, it } from "vitest";
import { roCount } from "./ro-count";
import { countWords } from "./ask/answer-text";
import { countWord } from "./unit-prices-shared";

describe("roCount: Romanian „de” after counts", () => {
  it("takes „de” from 20, for round hundreds, never for 0", () => {
    expect(roCount(0, "un produs", "produse")).toBe("0 produse");
    expect(roCount(1, "un produs", "produse")).toBe("un produs");
    expect(roCount(19, "un produs", "produse")).toBe("19 produse");
    expect(roCount(20, "un produs", "produse")).toBe("20 de produse");
    expect(roCount(101, "un produs", "produse")).toBe("101 produse");
    expect(roCount(200, "un produs", "produse")).toBe("200 de produse");
    expect(roCount(1215, "un produs", "produse")).toBe("1.215 produse");
  });
  it("is the one rule behind countWords and the price pages' countWord", () => {
    expect(countWords(25, "partener", "parteneri")).toBe("25 de parteneri");
    expect(countWords(1, "partener", "parteneri")).toBe("1 partener");
    expect(countWord(0, "un produs", "produse")).toBe("0 produse");
    expect(countWord(21, "un produs", "produse")).toBe("21 de produse");
  });
});
