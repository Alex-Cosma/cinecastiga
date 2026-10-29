import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatResultValue, RESHAPED_WORDS, reshapedAnswer, resultDifferences } from "./ResultComparison";
import ScopeConditions from "./ScopeConditions";
import { comparableMethodologies, type MonitoringScope } from "../../lib/monitoring-shared";

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
  it("lists no false changes when the answer's version moved (distribution-1 → distribution-2): only the methodology says it", () => {
    const [before, after] = comparableMethodologies({ version: "monitoring-1" }, { version: "monitoring-1", answer: { question: "distribution-2", conditions: {} } }, "distribution");
    expect(reshapedAnswer(before, after)).toEqual({ from: "distribution-1", to: "distribution-2" });
    expect(reshapedAnswer(after, after)).toBeNull();
    // The reader sees the new shape in words, never the engine's slug.
    for (const version of ["distribution-2", "fact_check-2", "trend-2"]) expect(RESHAPED_WORDS[version]).toMatch(/^[a-zăâîșț ,]+$/);
    // distribution-2 names its fields: the position among the others, the group.
    const v2 = (more: number) => ({ block: "distribution", distribution: { version: 2, position: { more, same: 0, fewer: 29 - more }, group: { others: 29 } } });
    expect(resultDifferences(v2(0), v2(1)).map((row) => [row.context, row.field])).toEqual([
      ["Distribuția riscului · Poziția în grup", "Cu mai multe criterii"], ["Distribuția riscului · Poziția în grup", "Cu mai puține criterii"],
    ]);
  });
  it("names the map records whose authority has no county in Romanian", () => {
    const before = { block: "map", counties: [{ county: "Buzău", value: 1 }], unknown: { value: 60, count: 2 } };
    const after = { block: "map", counties: [{ county: "Buzău", value: 1 }], unknown: { value: 40, count: 1 } };
    expect(resultDifferences(before, after).map(row => [row.context, row.field])).toEqual([
      ["Fără județ cunoscut", "Valoare înregistrată"], ["Fără județ cunoscut", "Număr de înregistrări"],
    ]);
  });
  it("names a trend's groups in Romanian and counts their members, not records", () => {
    const before = { block: "trend", composition: { all: { count: 5, valueA: 1, valueB: 500 } } };
    const after = { block: "trend", composition: { all: { count: 6, valueA: 1, valueB: 565 } } };
    expect(resultDifferences(before, after).map(row => [row.context, row.field])).toEqual([
      ["Totalurile grupei · Toate", "Număr în grupă"], ["Totalurile grupei · Toate", "Valoare în al doilea an"],
    ]);
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
  it("lists a changed answer version, and nothing for a run stored before versions existed", () => {
    const before = { version: "monitoring-1", refresh: { version: "v1" } };
    const after = { ...before, answer: { question: "trend-1", conditions: {} } };
    expect(resultDifferences(...comparableMethodologies(before, after, "trend"))).toEqual([]);
    const bumped = { ...before, answer: { question: "trend-2", conditions: { kind: "kind-2" } } };
    expect(resultDifferences(...comparableMethodologies(before, bumped, "trend")).map(row => [row.context, row.field, row.before, row.after])).toEqual([
      ["Versiunea răspunsului", "Calculul întrebării", "trend-1", "trend-2"],
      // D1 declares the kind (answer-core.ts KEY_VERSIONS): the condition is named by its label.
      ["Versiunea răspunsului · Condiții cu versiune proprie", "Tipul instituției", "kind-1", "kind-2"],
    ]);
  });
});

describe("a watch's selection from an answer's sources", () => {
  it("names a distribution bar's criteria, so a watch on one bar does not read as the whole group", () => {
    const spec = { block: "distribution", measure: "value", filters: { authorityId: 2145000, authorityName: "Comuna Rusetu" }, peers: { similar: true } };
    const markup = renderToStaticMarkup(createElement(ScopeConditions, { scope: { spec, options: { scope: { criteria: 2 } } } as unknown as MonitoringScope }));
    expect(markup).toContain("Criterii de risc");
    expect(markup).toContain("Doar profilurile cu 2 criterii");
    expect(markup).toContain("urmărim doar selecția");
  });

  it("names a network watch's fixed group once, with its year and the partners fixed (F4n-members-watch)", () => {
    const spec = { block: "network", measure: "value", filters: { authorityId: 2144364, authorityName: "MUNICIPIUL BUZAU" }, network: { partners: "new", since: 2025 } };
    const members = { kind: "network-group", role: "supplier", group: "new", ids: ["1", "2", "3"], frozenAt: "2026-10-29T10:00:00Z" };
    const markup = renderToStaticMarkup(createElement(ScopeConditions, { scope: { spec, options: { members } } as unknown as MonitoringScope }));
    expect(markup).toContain("Noi din 2025 · 3 firme fixate la 29.10.2026");
    expect(markup).not.toContain("Partenerii");
  });
});
