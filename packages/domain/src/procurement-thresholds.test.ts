import { describe, expect, it } from "vitest";
import { DA_CEILING_SEED_ROWS, daCeiling, daPurchaseType } from "./procurement-thresholds.js";

describe("Romanian direct-purchase limits, excluding VAT", () => {
  it.each([
    ["2016-05-25", null, null],
    ["2016-05-26", 132_519, 441_730],
    ["2018-06-03", 132_519, 441_730],
    ["2018-06-04", 135_060, 450_200],
    ["2022-09-09", 135_060, 450_200],
    ["2022-09-10", 270_120, 900_400],
    ["2022-12-31", 270_120, 900_400],
    ["2023-01-01", 270_120, 900_400],
  ])("uses the applicable boundary on %s", (date, goods, works) => {
    expect(daCeiling(date, "03111800-9")).toBe(goods);
    expect(daCeiling(date, "45233120-6")).toBe(works);
  });

  it("uses an explicit source type before CPV inference", () => {
    expect(daCeiling("2022-09-10", "44110000-4", "Lucrari")).toBe(900_400);
    expect(daCeiling("2022-09-10", "45000000-7", "Furnizare")).toBe(270_120);
    expect(daCeiling("2022-09-10", null, "Servicii")).toBe(270_120);
    expect(daPurchaseType(null, " LUCRĂRI ")).toBe("works");
    expect(daPurchaseType("45000000-7", " ")).toBe("works");
    expect(daPurchaseType("45000000-7", "Tip necunoscut")).toBeNull();
  });

  it.each([null, "", "45", "4500000", "00000000-0", "99999999-9", "45broken", "invalid"])("keeps unknown CPV %s unclassified", (cpv) => {
    expect(daCeiling("2022-09-10", cpv)).toBeNull();
  });

  it.each([null, "", "2022", "2022-02-30", "2022-13-01", "n/a"])("keeps unknown date %s unclassified", (date) => {
    expect(daCeiling(date, "45233120-6")).toBeNull();
  });

  it("keeps construction supplies and construction work in different types", () => {
    expect(daPurchaseType("44110000-4")).toBe("goods_services");
    expect(daPurchaseType("45000000-7")).toBe("works");
    expect(daPurchaseType("71320000-7")).toBe("goods_services");
  });

  it("generates complete non-overlapping seed eras from the same definitions", () => {
    expect(DA_CEILING_SEED_ROWS).toHaveLength(6);
    for (const key of ["da_ceiling_goods_services", "da_ceiling_works"]) {
      const rows = DA_CEILING_SEED_ROWS.filter((r) => r.key === key);
      expect(rows.map((r) => r.validFrom)).toEqual(["2016-05-26", "2018-06-04", "2022-09-10"]);
      expect(rows.map((r) => r.validTo)).toEqual(["2018-06-04", "2022-09-10", null]);
    }
  });
});
