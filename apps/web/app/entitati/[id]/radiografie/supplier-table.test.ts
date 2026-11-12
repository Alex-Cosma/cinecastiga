import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recordWords, sharePct } from "./supplier-words";

// The radiography's relation (owner, 2 November 2026): every supplier over both channels, no threshold; the chart
// draws at most 25, the table (mockup B „Față în față”) holds every one, sorted on any column.
describe("the relation table's words", () => {
  it("writes a share with one decimal and never lets a tiny one read as nothing", () => {
    expect([sharePct(0.055), sharePct(1), sharePct(0.0004), sharePct(0)]).toEqual(["5,5%", "100%", "<0,1%", "0%"]);
  });

  it("splits a pair's records by channel", () => {
    expect(recordWords({ n: 2, nDa: 802 })).toBe("2 contracte · 802 directe");
    expect(recordWords({ n: 1, nDa: 0 })).toBe("1 contract");
    expect(recordWords({ n: 0, nDa: 1 })).toBe("1 directă");
  });
});

describe("the relation section", () => {
  const scatter = readFileSync(new URL("./DependencyScatter.tsx", import.meta.url), "utf8");
  const table = readFileSync(new URL("./SupplierTable.tsx", import.meta.url), "utf8");
  const lib = readFileSync(new URL("../../../../lib/radiografie.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("./radiografie.css", import.meta.url), "utf8");

  it("draws at most 25 suppliers, with no threshold, and lets the table hold every one", () => {
    expect(lib).toContain("export const DEP_CHART_MAX = 25;");
    expect(lib).not.toMatch(/v_here >= \$\{floor\}/);
    expect(scatter).toContain('<option value={12}>Primii 12 după valoare</option>');
    expect(scatter).not.toContain("value={150}");
    expect(scatter).toContain("<SupplierTable authorityId={authorityId}");
  });

  it("sorts on every column, pages from the server and keeps the old rows dimmed while it loads", () => {
    for (const key of ['"value"', '"here"', '"life"', '"recs"', '"name"']) expect(table).toContain(key);
    expect(table).toContain("/api/radiografie/furnizori?");
    expect(table).toContain("<tbody inert={stale || undefined}>");
    expect(table).toMatch(/aria-sort=\{ariaSort\("value"\)\}/);
  });

  it("selects a row's supplier in the chart and opens the firm from its name", () => {
    expect(table).toContain("onClick={() => onSelect(r)}");
    expect(table).toContain("<Link prefetch={false} href={`/entitati/${r.id}`} onClick={(e) => e.stopPropagation()}>");
    expect(scatter).toContain("pairSpec({ id: authorityId, name: authorityName }, { id: p.id, name: p.name })");
  });

  it("turns the rows into cards on a phone, with the sort as buttons", () => {
    expect(css).toMatch(/@media\(max-width:760px\)\{\n\.rv-sortpills\{display:flex/);
    expect(css).toContain(".rv-rank thead{display:none}");
  });
});
