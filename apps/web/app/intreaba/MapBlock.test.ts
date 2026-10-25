import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import MapBlock, { CountyTip } from "./MapBlock";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const counties = [
  { county: "Cluj", value: 9_000_000, count: 124 },
  { county: "Buzău", value: 3_000_000, count: 14 },
  { county: "Iași", value: 1_000_000, count: 1 },
];

// R0: the map counts records ("înregistrări"), and its colours follow the theme.
describe("Ask county map", () => {
  it("names records in the county tip, with the Romanian numeral rule", () => {
    const tip = (count: number) => text(renderToStaticMarkup(createElement(CountyTip, { label: "Cluj", value: 9_000_000, count, national: 13_000_000, asCount: false })));
    expect(tip(124)).toContain("124 de înregistrări");
    expect(tip(14)).toContain("14 înregistrări");
    expect(tip(1)).toContain("1 înregistrare");
    expect(tip(124)).toContain("click → fișa județului");
    expect(tip(124)).not.toMatch(/achiziți/);
    expect(text(renderToStaticMarkup(createElement(CountyTip, { label: "Olt", value: 0, count: 0, national: 1, asCount: false })))).toBe("Olt nicio înregistrare pentru aceste filtre");
  });

  it("says a count once, in words, in the tip and in the note on records without a county", () => {
    const tip = text(renderToStaticMarkup(createElement(CountyTip, { label: "Tulcea", value: 27_953, count: 27_953, national: 2_400_000, asCount: true })));
    expect(tip).toBe("Tulcea 27.953 de înregistrări 1,2% din total click → fișa județului");
    const count = { block: "map", measure: "count", filters: {} } as const;
    const note = (n: number) => text(renderToStaticMarkup(createElement(MapBlock, { counties, unknown: { value: 5, count: n }, spec: count })));
    expect(note(36_138)).toMatch(/36\.138 de înregistrări \([^)]*din selecție\) au instituția fără județ cunoscut și nu apar pe hartă/);
    expect(note(36_138).match(/36\.138/g)).toHaveLength(1);
    expect(note(1)).toMatch(/1 înregistrare \([^)]*din selecție\) are instituția fără județ cunoscut și nu apare pe hartă/);
  });

  it("names each county with its value for a tap or Enter (its card) and explains the legend in a (?)", () => {
    const html = renderToStaticMarkup(createElement(MapBlock, { counties, unknown: { value: 0, count: 0 }, spec: { block: "map", measure: "value", filters: {} } }));
    expect(html).toContain('aria-label="Cluj: 9 mil. lei"');
    expect(html).toMatch(/aria-label="Olt: nicio înregistrare"/);
    expect(html).toMatch(/class="ask-legend qb-tipwrap"[\s\S]*Cinci trepte egale ca număr de județe/);
  });

  it("paints counties, the empty ones and the legend with theme tokens, never fixed colours", () => {
    const html = renderToStaticMarkup(createElement(MapBlock, { counties, unknown: { value: 0, count: 0 }, spec: { block: "map", measure: "value", filters: {} } }));
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|fill="|stroke="/i);
    expect(html).toContain('class="ask-county ask-county-none"');
    expect(html).toMatch(/class="ask-county ask-county-[0-4]"/);
    expect(html.match(/class="sw ask-county-[0-4]"/g)).toHaveLength(5);
  });

  it("takes each step from a token defined in both themes", () => {
    const css = readFileSync(new URL("../globals.css", import.meta.url), "utf8");
    const theme = readFileSync(new URL("../approved.css", import.meta.url), "utf8");
    for (let i = 0; i < 5; i++) {
      expect(css).toContain(`.ask-county-${i} { fill: var(--map-${i}); background: var(--map-${i}); }`);
      expect(theme.match(new RegExp(`--map-${i}:#`, "g"))).toHaveLength(3); // light, dark by preference, dark by choice
    }
    expect(css).toMatch(/\.ask-county \{ stroke: var\(--surface\);/);
    expect(css).toMatch(/\.ask-county-none \{ fill: var\(--sunk\); \}/);
  });
});
