import { describe, expect, it } from "vitest";
import { buildDomainDataset, defaultDomainYear, domainSourceQuery, domainSourceUrl, normalizeDomainCode, type DomainAggregate, type DomainNode } from "./domains-shared";
import { sumDecimalStrings, validateEvidenceScope } from "./ask/evidence";
import { validateSpec } from "./ask/spec";

const options = { year: 2025, years: [2026, 2025, 2024], generatedAt: "2026-09-14T08:00:00.000Z" };
const rows: DomainAggregate[] = [
  { code: "45000000-7", count: 2, valueExact: "9007199254740993.010000000000000001" },
  { code: "45233120-6", count: 1, valueExact: "0.333333333333333333" },
  { code: "45233120-6", count: 3, valueExact: "0.666666666666666667" },
  { code: "45233140-2", count: 4, valueExact: "7.05" },
  { code: "45210000-2", count: 5, valueExact: "11.005" },
  { code: "33000000-0", count: 1, valueExact: "14.99" },
];
const catalogue = [
  { code: "45000000-7", name: "Lucrări de construcții" },
  { code: "45210000-2", name: "Lucrări de construcții de clădiri" },
  { code: "45233120-6", name: "Lucrări de construcții de drumuri" },
  { code: "45233140-2", name: "Lucrări de drumuri" },
  { code: "33000000-0", name: "Echipamente medicale" },
];

function flatten(nodes: DomainNode[]): DomainNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
}

describe("domains source hierarchy", () => {
  it("partitions every parent exactly and isolates general codes from their descendants", () => {
    const data = buildDomainDataset(rows, catalogue, options);
    const nodes = flatten(data.categories);
    expect(new Set(nodes.map((node) => node.code)).size).toBe(nodes.length);
    expect(data.totalExact).toBe(sumDecimalStrings(rows.map((row) => row.valueExact)));
    expect(data.count).toBe(16);
    for (const node of nodes) {
      expect(node.hasChildren).toBe(!node.isLeaf);
      if (node.children) {
        expect(sumDecimalStrings(node.children.map((child) => child.valueExact))).toBe(node.valueExact);
        expect(node.children.reduce((count, child) => count + child.count, 0)).toBe(node.count);
        expect(node.children.every((child) => child.code.startsWith(node.code))).toBe(true);
      }
    }
    expect(nodes.find((node) => node.code === "45000000")).toMatchObject({ isLeaf: true, valueExact: rows[0]!.valueExact, count: 2, officialName: "Lucrări de construcții" });
    expect(nodes.find((node) => node.code === "45233120")).toMatchObject({ isLeaf: true, valueExact: "1.000000000000000000", count: 4 });
    expect(nodes.find((node) => node.code === "4500")?.officialName).toContain("Grup numeric CPV 4500");
    expect(data.generatedAt).toBe(options.generatedAt);
  });

  it("keeps four-digit group links and removes redundant deeper unary clicks", () => {
    const data = buildDomainDataset(rows, catalogue, options);
    const construction = data.categories.find((node) => node.code === "45")!;
    expect(construction.children?.map((node) => node.code)).toEqual(["4500", "4521", "4523"]);
    const general = construction.children?.find((node) => node.code === "4500")!;
    expect(general.children?.map((node) => node.code)).toEqual(["45000000"]);
    expect(flatten(data.categories).filter((node) => node.isLeaf).every((node) => /^\d{8}$/.test(node.code))).toBe(true);
  });

  it("orders sub-cent differences exactly and deterministically rather than rounding them into a tie", () => {
    const data = buildDomainDataset([
      { code: "45000000", count: 1, valueExact: "9007199254740993.010000000000000001" },
      { code: "33000000", count: 1, valueExact: "9007199254740993.010000000000000002" },
    ], catalogue, options);
    expect(data.categories.map((node) => node.code)).toEqual(["33", "45"]);
  });

  it("keeps every remaining division and carries the exact complement of the top eight", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ code: String(10 + i) + "000000", count: i + 1, valueExact: String(i + 1) }));
    const data = buildDomainDataset(many, [], options);
    const other = data.categories.at(-1)!;
    expect(data.categoryCount).toBe(12);
    expect(data.categories).toHaveLength(9);
    expect(other.children).toHaveLength(4);
    expect(other.valueExact).toBe("10.00");
    expect(other.count).toBe(10);
    expect(other.excludedPrefixes).toEqual(data.categories.slice(0, 8).map((node) => node.code));
    expect(domainSourceQuery(2025, other).scope).toEqual({ excludeCpvPrefixes: other.excludedPrefixes });
    expect(sumDecimalStrings(data.categories.map((node) => node.valueExact))).toBe(data.totalExact);
  });

  it("supports an empty annual selection without fabricating categories or an Altele total", () => {
    expect(buildDomainDataset([], [], options)).toMatchObject({ totalExact: "0.00", count: 0, categories: [], categoryCount: 0 });
  });

  it("fails on malformed source codes and counts instead of dropping their amounts", () => {
    expect(() => buildDomainDataset([{ code: "unknown", count: 1, valueExact: "50" }], [], options)).toThrow("Agregare CPV invalidă");
    expect(() => buildDomainDataset([{ code: "45000000", count: 1.5, valueExact: "50" }], [], options)).toThrow("Agregare CPV invalidă");
  });
});

describe("domains query links and period", () => {
  it("preserves eight digits and scope through source URLs, including zero-ending general codes", () => {
    const nodes = flatten(buildDomainDataset(rows, catalogue, options).categories);
    for (const code of ["45", "4500", "45000000", "45233120"]) {
      const node = nodes.find((item) => item.code === code)!;
      const url = new URL(domainSourceUrl(2025, node), "https://example.test");
      const spec = JSON.parse(atob(url.searchParams.get("spec")!));
      const scope = JSON.parse(url.searchParams.get("evidence")!);
      expect(spec.filters).toEqual({ yearFrom: 2025, yearTo: 2025, cpvTerm: code });
      expect(scope).toEqual({ cpvPrefixes: [code] });
      expect(validateEvidenceScope(scope)).toEqual(scope);
      expect(validateSpec(spec)).not.toHaveProperty("error");
      expect(url.searchParams.get("drill")).toBe("1");
    }
    expect(domainSourceQuery(2025)).toMatchObject({ spec: { block: "breakdown", dataset: "all", measure: "value" }, scope: {} });
  });

  it("does not silently widen an incompletely specified remainder", () => {
    const node = buildDomainDataset(rows, catalogue, options).categories[0]!;
    expect(() => domainSourceQuery(2025, { ...node, isOther: true })).toThrow("perimetru explicit");
  });

  it("uses the latest available completed calendar year and preserves legacy URL intent", () => {
    expect(defaultDomainYear([2024, 2026, 2025], 2026)).toBe(2025);
    expect(defaultDomainYear([2026], 2026)).toBe(2026);
    expect(defaultDomainYear([], 2026)).toBeUndefined();
    expect(normalizeDomainCode("45000000-7")).toBe("45");
    expect(normalizeDomainCode("45000000")).toBe("45000000");
    expect(normalizeDomainCode("50000000-5")).toBe("50");
    expect(normalizeDomainCode("90000000-7")).toBe("90");
    expect(normalizeDomainCode("other")).toBe("other");
    expect(normalizeDomainCode("../45")).toBe("");
  });
});
