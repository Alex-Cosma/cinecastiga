import { describe, expect, it } from "vitest";
import { formatResultValue, resultDifferences } from "./ResultComparison";

describe("human-readable monitoring result comparisons", () => {
  it("matches entity rows by identity even when a ranking changes order", () => {
    const before = { block: "table", rows: [{ entityId: "1", name: "Firma A", value: 100 }, { entityId: "2", name: "Firma B", value: 90 }], page: 0 };
    const after = { block: "table", rows: [{ entityId: "2", name: "Firma B", value: 110 }, { entityId: "1", name: "Firma A", value: 100 }], page: 1 };
    expect(resultDifferences(before, after)).toEqual([{ key: "rows/entityId:2/value", context: "Clasament · Firma B", field: "Valoare înregistrată", fieldKey: "value", before: 90, after: 110 }]);
  });
  it("handles all thirteen result shapes with named changed values", () => {
    const cases = [
      ["stat", "stat", { value: 1 }], ["table", "rows", [{ entityId: "1", name: "Firma", value: 1 }]],
      ["timeseries", "series", [{ year: 2026, value: 1 }]], ["map", "counties", [{ county: "Buzău", value: 1 }]],
      ["compare", "entities", [{ entityId: "1", name: "Firma", value: 1 }]],
      ["distribution", "distribution", { focal: { name: "Firma", cri: 1 } }],
      ["breakdown", "slices", [{ code: "45", name: "Construcții", value: 1 }]],
      ["scatter", "points", [{ entityId: "1", name: "Firma", value: 1 }]],
      ["sankey", "flows", [{ partnerId: "1", partner: "Firma", categoryCode: "45", category: "Construcții", value: 1 }]],
      ["network", "nodes", [{ entityId: "1", name: "Firma", value: 1 }]],
      ["entity_card", "card", { entityId: "1", name: "Firma", value: 1 }],
      ["fact_check", "fact", { value: 1 }], ["trend", "rowsTrend", [{ entityId: "1", name: "Firma", valueA: 1 }]],
    ] as const;
    for (const [block, key, value] of cases) {
      const before = { block, [key]: value }, after = JSON.parse(JSON.stringify(before).replace(/:1(?=[,}])/g, ":2"));
      const differences = resultDifferences(before, after);
      expect(differences.length, block).toBeGreaterThan(0);
      expect(differences.every(row => row.context.length > 0 && !row.field.includes("value")), block).toBe(true);
    }
  });
  it("separates missing, unknown and zero values and retains long exact decimals", () => {
    expect(formatResultValue(undefined, "value")).toContain("Nu figura");
    expect(formatResultValue(null, "value")).toContain("Necunoscut");
    expect(formatResultValue(0, "value")).toBe("0 lei");
    expect(formatResultValue("1234567890.123456789012345678", "value")).toBe("1.234.567.890,123456789012345678 lei");
    expect(formatResultValue(1e-7, "value")).toBe("0,0000001 lei");
    expect(formatResultValue(2026, "year")).toBe("2026");
  });
  it("compares histogram cells by coordinates and explains flag codes", () => {
    const changes = resultDifferences({ density: { cells: [[1, 2, 5], [2, 3, 8]] } }, { density: { cells: [[2, 3, 8], [1, 2, 6]] } });
    expect(changes).toHaveLength(1); expect(changes[0]?.context).toContain("Grupa valorii 1 · grupa de risc 2");
    expect(formatResultValue(["da_split"], "flags")).toBe("Posibilă fracționare sub prag");
  });
  it("makes methodology changes readable without requiring raw JSON", () => {
    const changes = resultDifferences({ refresh: { tedNormalization: 2 }, values: "Veche" }, { refresh: { tedNormalization: 3 }, values: "Nouă" });
    expect(changes.map(row => row.field)).toEqual(["Versiunea prelucrării TED", "Interpretarea valorilor"]);
  });
});
