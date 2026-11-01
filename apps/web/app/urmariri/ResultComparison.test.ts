import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { entityNames, formatResultValue, RESHAPED_WORDS, reshapedAnswer, resultDifferences } from "./ResultComparison";
import { answerCore } from "../../lib/ask/answer-core";
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
    for (const version of ["distribution-2", "fact_check-2", "trend-2", "entity_card-2", "scatter-2", "distribution-3", "entity_card-3", "scatter-3"]) expect(RESHAPED_WORDS[version]).toMatch(/^[a-zăâîșț ,]+$/);
    // distribution-2 names its fields: the position among the others, the group.
    const v2 = (more: number) => ({ block: "distribution", distribution: { version: 2, position: { more, same: 0, fewer: 29 - more }, group: { others: 29 } } });
    expect(resultDifferences(v2(0), v2(1)).map((row) => [row.context, row.field])).toEqual([
      ["Distribuția riscului · Poziția în grup", "Cu mai multe tipare"], ["Distribuția riscului · Poziția în grup", "Cu mai puține tipare"],
    ]);
  });
  it("names «Cine conduce?»'s fields (entity_card-2): the places, their total, the group at the top of the index", () => {
    const podium = (value: number, total: number) => ({ block: "entity_card", podium: { places: [{ entityId: "1", value, count: 3 }], totals: { value: total, count: 9, entities: 40 } } });
    expect(resultDifferences(podium(100, 300), podium(120, 320)).map((row) => [row.context, row.field])).toEqual([
      ["Podiumul · Locurile 1–3 · Elementul 1", "Valoare înregistrată"], ["Podiumul · Totalul selecției", "Valoare înregistrată"],
    ]);
    // Under a band of CÂȘTIGĂTORII the total is the category's, and named so.
    const band = (total: number) => ({ block: "entity_card", podium: { places: [], categoryTotals: { value: total, count: 2, entities: 2 } } });
    expect(resultDifferences(band(5000), band(5100)).map((row) => [row.context, row.field])).toEqual([["Podiumul · Totalul categoriei", "Valoare înregistrată"]]);
    const ties = (count: number) => ({ block: "entity_card", ties: { level: 0.2, maxFlags: 1, count, rows: [] } });
    expect(resultDifferences(ties(13), ties(14)).map((row) => [row.context, row.field])).toEqual([["Grupul de la egalitate pe primul loc", "Profiluri la riscul maxim"]]);
  });
  it("names the -3 answers' fields (rf-2026.18): the score's position, the first profiles by risk", () => {
    const position = (higher: number) => ({ block: "distribution", distribution: { version: 3, focal: { score: 47 }, position: { higher, equal: 1, lower: 28 - higher } } });
    expect(resultDifferences(position(18), position(19)).map((row) => [row.context, row.field])).toEqual([
      ["Distribuția riscului · Poziția în grup", "Cu risc mai mare"], ["Distribuția riscului · Poziția în grup", "Cu risc mai mic"],
    ]);
    const ranking = (score: number, topCount: number) => ({ block: "entity_card", ranking: { topCount, places: [{ entityId: "1", score }] } });
    expect(resultDifferences(ranking(71, 1), ranking(73, 2)).map((row) => [row.context, row.field, formatResultValue(row.after, row.fieldKey)])).toEqual([
      ["Primii după risc", "La egalitate pe primul loc", "2"], ["Primii după risc · Locurile · Elementul 1", "Riscul", "73%"],
    ]);
  });
  it("names a watched risk cloud's rows and fields (scatter-2): the core keeps ids, the stored answers give the names", () => {
    const full = (value: number, flag: string | null) => ({ block: "scatter", scatter: { version: 2, role: "authority", rankBy: "risk", flag,
      group: { n: 82, nList: 60 }, criteria: { da_split: 46 }, list: [{ entityId: "7", name: "Comuna Sageata", value, nDas: 30, nFlags: 3, flags: [{ code: "da_split", years: [2019] }] }] } });
    const before = full(100, null), after = full(120, "da_split");
    const core = (v: unknown) => answerCore("scatter", v);
    const rows = resultDifferences(core(before), core(after), entityNames(before, after)).map((row) => [row.context, row.field, formatResultValue(row.before, row.fieldKey), formatResultValue(row.after, row.fieldKey)]);
    expect(rows).toEqual([
      ["Norul de risc", "Semnalul ales", "Tot grupul", "Achiziții repetate, peste plafon cumulat"],
      ["Norul de risc · Lista · Comuna Sageata", "Valoare înregistrată (achiziții directe)", "100 lei", "120 lei"],
    ]);
    const counts = resultDifferences(core(before), core({ ...after, scatter: { ...after.scatter, rankBy: "value", group: { n: 83, nList: 60 }, criteria: { da_split: 47 } } }));
    expect(counts.map((row) => [row.context, row.field])).toEqual(expect.arrayContaining([
      ["Norul de risc", "Primele după"], ["Norul de risc · Grupul", "Profiluri în nor"], ["Norul de risc · Profiluri cu fiecare semnal", "Achiziții repetate, peste plafon cumulat"],
    ]));
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
    expect(formatResultValue(["da_split"], "flags")).toBe("Achiziții repetate, peste plafon cumulat");
    // rf-2026.18: an older watch's retired signal keeps its name; the score is a percentage.
    expect(formatResultValue("da_rapid", "flag")).toBe("Finalizare rapidă");
    expect(formatResultValue(73, "score")).toBe("73%");
    expect(formatResultValue("risk", "rankBy")).toBe("Risc");
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
    expect(markup).toContain("<dt>Tipare</dt>");
    expect(markup).toContain("Doar profilurile cu 2 tipare");
    expect(markup).toContain("urmărim doar selecția");
  });

  it("names a bar of the risk score (distribution-3) and an old link's tenth of the index as the band it selects", () => {
    const spec = { block: "distribution", measure: "value", filters: { authorityId: 2145000, authorityName: "Comuna Rusetu" } };
    const words = (scope: Record<string, unknown>) => renderToStaticMarkup(createElement(ScopeConditions, { scope: { spec, options: { scope } } as unknown as MonitoringScope }));
    expect(words({ score: { from: 20, to: 39 } })).toContain("<dt>Risc</dt><dd>Doar profilurile cu 20–39%</dd>");
    expect(words({ score: { from: 0, to: 0 } })).toContain("Doar profilurile cu 0%");
    expect(words({ riskBucket: { from: 0.2, to: 0.3 } })).toContain("Doar profilurile cu 20–29%");
    expect(words({ riskBucket: { from: 0.9, to: 1 } })).toContain("Doar profilurile cu 90–100%");
  });

  it("names a network watch's fixed group once, with its year and the partners fixed (F4n-members-watch)", () => {
    const spec = { block: "network", measure: "value", filters: { authorityId: 2144364, authorityName: "MUNICIPIUL BUZAU" }, network: { partners: "new", since: 2025 } };
    const members = { kind: "network-group", role: "supplier", group: "new", ids: ["1", "2", "3"], frozenAt: "2026-10-29T10:00:00Z" };
    const markup = renderToStaticMarkup(createElement(ScopeConditions, { scope: { spec, options: { members } } as unknown as MonitoringScope }));
    expect(markup).toContain("Noi din 2025 · 3 firme fixate la 29.10.2026");
    expect(markup).not.toContain("Partenerii");
  });
});
