import { describe, expect, it } from "vitest";
import { excludedSubclasses, subclassesWords, wholeDomainCode } from "./subclasses";

describe("the subclasses a domain leaves out (Z2-25)", () => {
  it("shortens the pill", () => {
    expect(subclassesWords("fără 3 subclase (vezi limitele)")).toBe("−3 subclase");
    expect(subclassesWords("fără o subclasă (vezi limitele)")).toBe("−1 subclasă");
    expect(subclassesWords("fără 21 de subclase (vezi limitele)")).toBe("−21 subclase");
    expect(subclassesWords("doar spitale")).toBeNull();
  });
  it("reads them from the answer's caveat, with ș and ț", () => {
    expect(excludedSubclasses(["Sursă: …", "Din „medicamente” nu sunt numărate: Dale de cauciuc (33682000-4); Reactivi \u015fi produse de contrast (33696000-5)."]))
      .toEqual([{ name: "Dale de cauciuc", code: "33682000-4" }, { name: "Reactivi și produse de contrast", code: "33696000-5" }]);
    expect(excludedSubclasses(["Sursă: …"])).toEqual([]);
  });
  it("counts the domain whole by its one code", () => {
    expect(wholeDomainCode(["top 10 furnizori", "Produse farmaceutice (33600000-6)", "fără 3 subclase (vezi limitele)"])).toBe("33600000-6");
    expect(wholeDomainCode(["A (45233000-9) + B (45221000-2)"])).toBeNull();
    expect(wholeDomainCode(["A (45233000-9) +2 CPV"])).toBeNull();
  });
});
