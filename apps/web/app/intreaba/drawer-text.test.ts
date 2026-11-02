import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dateSpan, recordExactValue, records, splitScopeLabel, stateClass, summaryParts } from "./drawer-text";

// The records drawer (owner, 2 November 2026): on a phone the record comes first; sizes, the state's colour,
// the exact value and the profile note's border follow the critique of the same day.
describe("the records drawer's phone header", () => {
  it("titles the part opened with its records, the label's own „înregistrările …” giving way to the count", () => {
    const [name, tail] = splitScopeLabel("NICOLASEB S.R.L. · înregistrările din clasament");
    expect(name).toBe("NICOLASEB S.R.L.");
    expect(tail).toBe(" · înregistrările din clasament");
    expect(`${name} · ${records(28)}`).toBe("NICOLASEB S.R.L. · 28 de înregistrări");
    expect(splitScopeLabel("Suceava · înregistrările județului")).toEqual(["Suceava", " · înregistrările județului"]);
    expect(splitScopeLabel("2024 · înregistrările anului")).toEqual(["2024", " · înregistrările anului"]);
    // A label without that tail stays whole.
    expect(splitScopeLabel("selecția aleasă")).toEqual(["selecția aleasă", ""]);
    expect(splitScopeLabel("FIRMA SRL · după valoare")).toEqual(["FIRMA SRL · după valoare", ""]);
    expect(records(1)).toBe("1 înregistrare");
    // The numeral rule (G10): "de" by the last two digits.
    expect(records(403915)).toBe("403.915 înregistrări");
    expect(records(403920)).toBe("403.920 de înregistrări");
  });

  it("says the card's figures on one line, the year once when both dates fall in it", () => {
    expect(summaryParts(28, "235150.00", "2024-01-05", "2024-12-30").join(" · ")).toBe("28 · 235.150,00 lei · 05.01–30.12.2024");
    expect(summaryParts(403915, "2526100822.6700", "2018-04-02", "2026-09-25").join(" · ")).toBe("403.915 · 2.526.100.822,67 lei · 02.04.2018–25.09.2026");
    expect(summaryParts(1, "12585482.55", "2025-03-19", "2025-03-19").join(" · ")).toBe("1 · 12.585.482,55 lei · 19.03.2025");
    expect(summaryParts(0, "0", null, null)).toEqual(["0", "0,00 lei"]);
    expect(dateSpan("2024-01-05", null)).toBe("05.01.2024–Dată neprecizată");
  });
});

describe("a record's details", () => {
  it("gives the exact value in lei with bani only when it says more than the amount listed", () => {
    expect(recordExactValue({ valueExact: "3250", nWinners: null })).toBeNull();
    expect(recordExactValue({ valueExact: "5112469.92", nWinners: 1 })).toBeNull();
    expect(recordExactValue({ valueExact: "941326.2", nWinners: null })).toBeNull();
    expect(recordExactValue({ valueExact: "1333.333333", nWinners: 3 })).toBe("1.333,333333 lei");
    expect(recordExactValue({ valueExact: "0.004", nWinners: null })).toBe("0,004 lei");
    // A consortium's share, even when the bani say it all.
    expect(recordExactValue({ valueExact: "2500.00", nWinners: 2 })).toBe("2.500,00 lei");
  });

  it("colours the state: accepted green, an awarded contract neutral, amber for the rest", () => {
    expect(stateClass({ state: "Oferta acceptata", src: "da" })).toBe("ev-state ev-state-accepted");
    expect(stateClass({ state: null, src: "contracts" })).toBe("ev-state ev-state-awarded");
    expect(stateClass({ state: null, src: "da" })).toBe("ev-state");
    expect(stateClass({ state: "Oferta respinsa", src: "da" })).toBe("ev-state");
  });

  it("drops „ID rând” for a direct acquisition and never prints a raw „RON” value", () => {
    const source = readFileSync(new URL("./EvidenceDrawer.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/valueExact\}\s*RON/);
    expect(source).toMatch(/r\.src !== "da" && <><dt>ID rând<\/dt>/);
  });
});

const css = readFileSync(new URL("./evidence-drawer.css", import.meta.url), "utf8").replace(/\/\*[^]*?\*\//g, "");
const phone = css.slice(css.indexOf("@media(max-width:760px)"));

describe("the records drawer's styles", () => {
  it("keeps accepted records green after the amber rule, an awarded contract neutral", () => {
    const amber = css.indexOf(".ev-export-limit,.ev-state{color:var(--amber-ink)}");
    expect(amber).toBeGreaterThanOrEqual(0);
    // Two classes outrank the amber rule wherever they stand.
    expect(css).toContain(".ev-state.ev-state-accepted{color:var(--ok);background:var(--sunk)}");
    expect(css).toContain(".ev-state.ev-state-awarded{color:var(--ink2);background:var(--sunk)}");
  });

  it("reads at 13 px on a desktop, 14 px on a phone, small labels 11 px caps, fields 16 px on a phone", () => {
    expect(css).toMatch(/\.evidence-drawer \.ev-table\{[^}]*font-size:13px/);
    expect(phone).toMatch(/\.evidence-drawer \.ev-table\{font-size:14px\}/);
    expect(css).toMatch(/\.ev-table th\{[^}]*font-size:11px/);
    expect(css).toMatch(/\.ev-eyebrow\{[^}]*font-size:11px/);
    expect(phone).toMatch(/td:nth-child\(2\):before\{[^}]*font-size:11px/);
    expect(phone).toMatch(/\.evidence-drawer \.ev-filters input,\.evidence-drawer \.ev-filters select,\.evidence-drawer \.ev-sort select\{[^}]*font-size:16px/);
    expect(css).toMatch(/\.ev-footer button\{font-size:13px/);
    // Nothing under 12 px but the caps labels (11 px).
    for (const [, size] of css.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)) expect(Number(size)).toBeGreaterThanOrEqual(11);
    expect([...css.matchAll(/([^{}]+)\{[^}]*font-size:11px/g)].map((m) => m[1]!.trim())).toEqual([
      ".ev-eyebrow", ".ev-table th", ".ev-table td:nth-child(2):before",
    ]);
  });

  it("folds search, filters and sort behind one row on a phone, and the profile note has no side stripe", () => {
    expect(css).toContain(".ev-tools-toggle{display:none}");
    expect(phone).toMatch(/\.ev-tools:not\(\.is-open\) \.ev-filters,\.ev-tools:not\(\.is-open\) \.ev-sort/);
    expect(css).toMatch(/\.ev-profile-note\{[^}]*border:1px solid color-mix\(in srgb, var\(--amber-line\) 35%, var\(--line2\)\)/);
    expect(css).not.toMatch(/border-left:\s*[2-9]px/);
  });
});
