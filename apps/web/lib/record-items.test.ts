import { describe, expect, it } from "vitest";
import { formatQuantity, itemsSum, lineTotal, productsTitle, trimDecimal } from "./record-items";

describe("a direct acquisition's products", () => {
  it("writes quantities with a thousands separator and without stored zeros (bug z7-6)", () => {
    expect(formatQuantity("16100.000")).toBe("16.100");
    expect(formatQuantity("1.500")).toBe("1,5");
    expect(formatQuantity("90")).toBe("90");
    expect(formatQuantity(null)).toBe("—");
    expect(trimDecimal("2.30")).toBe("2.3");
  });
  it("multiplies each line exactly, to the ban", () => {
    expect(lineTotal("15", "2.30")).toBe("34.50");
    expect(lineTotal("90.000", "1.0000")).toBe("90");
    expect(lineTotal("3", "0.335")).toBe("1.01");
    expect(lineTotal("18", "8.90")).toBe("160.20");
    expect(lineTotal(null, "2")).toBeNull();
    expect(lineTotal("x", "2")).toBeNull();
  });
  it("adds the lines and compares them with the closing value", () => {
    const items = [{ quantity: "15", unitPriceRon: "2.30" }, { quantity: "10", unitPriceRon: "42" }, { quantity: null, unitPriceRon: "1" }];
    expect(itemsSum(items, "454.50")).toEqual({ sum: "454.50", counted: 2, lines: 3, note: "Egală cu valoarea de închidere." });
    expect(itemsSum(items, "500").note).toBe("Diferă de valoarea de închidere cu 45,50 lei.");
    expect(itemsSum(items, null).note).toBeNull();
  });
  it("names an acquisition without a title after its first products (Z7-17)", () => {
    expect(productsTitle(["CEAPA, KG", "Morcovi kg", "LAMAI ,KG", ...Array.from({ length: 31 }, (_, i) => `Produs ${i}`)])).toBe("Ceapa, morcovi, lamai și încă 31 de produse");
    expect(productsTitle(["Paine", "Lapte 1 L"])).toBe("Paine și lapte 1 l");
    expect(productsTitle(["SOLUTIE PARDOSELI 5L", "Detergent", "Saci", "Mop"])).toBe("Solutie pardoseli 5l, detergent, saci și încă un produs");
    expect(productsTitle(["", null, "kg"])).toBeNull();
  });
});
