import { describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import type { DrillRow } from "./ask/compile";
import { completeFindingRows, FINDING_SOURCE_LIMIT, sourceEvidence } from "./source-evidence";
import { belowExactCeiling, readRadiografieEvidence, validateRadiografieSelection } from "./radiografie-evidence";
import { readSignalEvidence } from "./signal-evidence";

describe("investigation source selections", () => {
  it("sums original decimal strings including tiny consortium allocations", () => {
    const result = sourceEvidence({ title: "Test", methodology: "test", context: {}, warnings: [],
      records: ["9007199254740993.001", "0.0033", "0.0034"].map(valueExact => ({ valueExact })) as DrillRow[] });
    expect(result.totalExact).toBe("9007199254740993.0077");
    expect(result.sourceCount).toBe(3);
  });
  it("refuses to represent a capped finding as complete", () => {
    expect(() => completeFindingRows(Array(FINDING_SOURCE_LIMIT + 1) as DrillRow[])).toThrow("Nu am salvat o captură parțială");
  });
  it("keeps missing values distinct from the sum of known values", () => {
    const result = sourceEvidence({ title: "Test", methodology: "test", context: {}, warnings: [],
      records: [{ valueExact: "0", originalValueExact: null }, { valueExact: "20.50", originalValueExact: "20.50" }] as import("./source-evidence").SourceRecord[] });
    expect(result.totalExact).toBe("20.50");
    expect(result.records[0]?.originalValueExact).toBeNull();
    expect(result.warnings.join(" ")).toContain("lipsa nu este zero");
  });
  it("keeps exact threshold boundary values without float rounding", () => {
    expect(belowExactCeiling("270119.99999999999999999", 270120)).toBe(true);
    expect(belowExactCeiling("270120.00000000000000000", 270120)).toBe(false);
    expect(belowExactCeiling("270120.00000000000000001", 270120)).toBe(false);
    expect(belowExactCeiling("1e5", 270120)).toBe(false);
  });
  it("validates stable keys without trusting a client supplied row list", () => {
    expect(validateRadiografieSelection({ type: "slicing", supplierId: "12", rows: [{ value: 1 }] })).toEqual({ type: "slicing", supplierId: "12" });
    expect(validateRadiografieSelection({ type: "pattern", patternId: "12" })).toEqual({ type: "pattern", patternId: "12" });
    expect(validateRadiografieSelection({ type: "pattern", patternId: "1 OR 1=1" })).toBeNull();
  });
  it("rejects invalid selections before reading the database", async () => {
    const sql = (() => { throw new Error("unexpected database read"); }) as unknown as DbSql;
    await expect(readSignalEvidence(sql, "1 OR 1=1")).resolves.toBeNull();
    await expect(readRadiografieEvidence(sql, "0", { type: "slicing", supplierId: "1" })).resolves.toBeNull();
    await expect(readRadiografieEvidence(sql, "1", { type: "anything", supplierId: "1" })).resolves.toBeNull();
  });
});
