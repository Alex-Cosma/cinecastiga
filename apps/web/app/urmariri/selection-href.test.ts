import { describe, expect, it } from "vitest";
import { validateEvidenceFilters, validateEvidenceScope } from "../../lib/ask/evidence";
import { selectionHref, type MonitoringScope } from "../../lib/monitoring-shared";

/** The link a watch opens: what AskPanel reads back (evidence, sourceFilters) must validate, whatever the watch keeps. */
function parsed(href: string) {
  const params = new URL(href, "https://cinecastiga.ro").searchParams;
  const filters = params.get("sourceFilters"), evidence = params.get("evidence");
  return {
    filters: filters === null ? null : validateEvidenceFilters(JSON.parse(filters)),
    evidence: evidence === null ? null : validateEvidenceScope(JSON.parse(evidence)),
    length: href.length,
  };
}

describe("selectionHref", () => {
  const spec = { block: "trend", dim: "supplier", measure: "value", topN: 10, filters: { yearFrom: 2024, yearTo: 2025 }, trend: { change: "new" } } as MonitoringScope["spec"];
  it("a group watch's fixed members never travel: the link stays short and its filters valid", () => {
    const ids = Array.from({ length: 5000 }, (_, i) => String(1_000_000 + i));
    const href = selectionHref({ spec, options: { stream: "da", members: { kind: "trend-group", role: "supplier", group: "new", ids, frozenAt: "2026-10-24T10:00:00Z" } } });
    const link = parsed(href);
    expect(link.filters).toEqual({ stream: "da" });
    expect(link.evidence).toBeNull();
    expect(link.length).toBeLessThan(1000);
  });
  it("a scope travels as evidence, not inside the source filters", () => {
    const link = parsed(selectionHref({ spec, options: { scope: { role: "supplier", entityIds: ["7"] }, search: "drum" } }));
    expect(link.filters).toEqual({ search: "drum" });
    expect(link.evidence).toEqual({ role: "supplier", entityIds: ["7"] });
  });
  it("no source filter, no sourceFilters parameter", () => {
    expect(parsed(selectionHref({ spec, options: {} })).filters).toBeNull();
  });
});
