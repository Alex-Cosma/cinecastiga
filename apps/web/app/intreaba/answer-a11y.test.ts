import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DistributionData } from "../../lib/ask/compile";

vi.mock("@/lib/format", () => import("../../lib/format"));
vi.mock("@/lib/entity-summary", () => import("../../lib/entity-summary"));
vi.mock("@/lib/ask/answer-text", () => import("../../lib/ask/answer-text"));
vi.mock("@/lib/ask/permalink", () => import("../../lib/ask/permalink"));
vi.mock("@/lib/ask/source-spec", () => import("../../lib/ask/source-spec"));
vi.mock("@/lib/ask/spec", () => import("../../lib/ask/spec"));
vi.mock("@/lib/ask/question-ui", () => import("../../lib/ask/question-ui"));
vi.mock("@/lib/ask/filters/retarget", () => import("../../lib/ask/filters/retarget"));
vi.mock("@/lib/flags", () => import("../../lib/flags"));

const { DistributionBlock } = await import("./blocks");

/*
 * F1b-polish (kit §8, §9, plan §2.3 "Ținte"): the answer and its records list
 * keep small text at 4.5:1 in both themes and give every control 44 × 44 px
 * under 600 px, as the builder does (builder/filters-kit-css.test.ts). A chart
 * whose marks cannot be that wide on a phone has the same choices as a list.
 */

const css = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\/\*[^]*?\*\//g, "");
/** The rules of the first `@media(max-width:600px)` block after `after`. */
function phoneRules(text: string, after: string): string {
  const from = text.indexOf("@media(max-width:600px)", text.indexOf(after));
  expect(from, after).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = text.indexOf("{", from); i < text.length; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}" && --depth === 0) return text.slice(from, i);
  }
  return "";
}

describe("the answer's targets and contrast", () => {
  it("gives the answer's tools, disclosures, record links and table links 44 px under 600 px, the (?) without growing its line", () => {
    const rules = phoneRules(css("./explore-compact.css"), ".cq-answer .term-tip .term-mark");
    for (const selector of [".cq-answer .cq-record-link", ".cq-answer td a", ".cq-answer details > summary", ".cq-answer .cq-answer-tools .cq-copy", ".cq-answer .cq-export summary", ".cq-answer .qb-trow-name a"])
      expect(rules, selector).toContain(selector);
    expect(rules).toMatch(/\.cq-answer \.term-tip > \.term-trigger \{ min-width:44px; min-height:44px; margin-block:-10px; \}/);
    expect(css("./explore-compact.css")).toContain(".cq-answer .term-tip .term-mark { opacity:1; }");
  });

  it("gives the records list 44 px under 600 px and its small text 4.5:1", () => {
    const drawer = css("./evidence-drawer.css");
    const rules = phoneRules(drawer, ".ev-party-arrow{color:var(--muted)}");
    for (const rule of [".ev-close{min-width:44px;min-height:44px}", ".ev-calculation>summary,.ev-record-details>summary{min-height:44px", ".ev-pagination button", ".ev-contract-title,.ev-seap,.ev-ted{display:flex;align-items:center;min-height:44px}"])
      expect(rules, rule).toContain(rule);
    // --muted on the summary's green is 4.0:1, --amber on its warm fill 3.7:1.
    expect(drawer).toContain(".ev-source-summary span,.ev-source-summary p{color:var(--ink2)}");
    expect(drawer).toContain(".ev-export-limit,.ev-state{color:var(--amber-ink)}");
  });

  it("hides nothing a reader needs: a trend row's partner wraps, the answer's capture popover is above the rows and inside the page (F2-tests)", () => {
    const results = css("./question-results.css"), globals = css("../globals.css");
    // The partner's whole name ("în 2024: 100% de la COMPANIA NATIONALA DE ADMINISTRARE…"), never cut by "…" on a phone.
    const partner = results.slice(results.indexOf(".qb-trow-partner > span {"), results.indexOf("}", results.indexOf(".qb-trow-partner > span {")));
    expect(partner).toContain("overflow-wrap: break-word");
    expect(partner).not.toMatch(/text-overflow|nowrap|overflow: hidden/);
    // The hover lift is a transform: on .clipbtn it would make a stacking context under the trend's positioned rows
    // (they took the clicks) and the phone's fixed sheet's containing block. Open, no lift (after the hover rule).
    const hover = globals.indexOf(".clipbtn:hover { background: var(--sunk); transform: translateY(-1px);");
    expect(hover).toBeGreaterThanOrEqual(0);
    expect(globals.indexOf(".clipbtn:has(> .clipbtn-pop) { transform: none; }")).toBeGreaterThan(hover);
    // Leftward from the right-hand column; a corner panel on a tablet; the phone keeps its sheet (question-results.css).
    expect(globals).toContain("@media (min-width: 851px) { .cq-answer-actions .clipbtn-pop { left: auto; right: 0; } }");
    expect(globals).toMatch(/@media \(min-width: 601px\) and \(max-width: 850px\) \{ \.cq-answer-actions \.clipbtn-pop \{ position: fixed; top: auto; bottom: 16px; left: auto; right: 16px; width: min\(340px, calc\(100vw - 32px\)\);/);
    // A signed-in reader's five actions wrap between 601 and 850 px instead of squashing into each other.
    const tablet = results.slice(results.indexOf("@media (max-width: 850px) {"));
    expect(tablet.slice(0, tablet.indexOf("}", tablet.indexOf(".cq-answer-actions {")))).toContain("flex-wrap: wrap;");
  });

  it("opens every (?) of the answer over its own line, never at the page's top (S4 tests)", () => {
    // guide.css opens a tip above its nearest positioned box; without one inside the page it opened above the page's top,
    // off screen (the strip's in answer/answer.test.ts). „Din care”, the breakdown's kinds, legend head and rows, the
    // evolution's legend and the comparison's card lines are their (?)'s anchors.
    const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
    expect(source("./answer/StatMix.tsx")).toContain('<div className="qb-mix-top qb-tipwrap">');
    const blocks = source("./blocks.tsx");
    for (const anchor of ['className="qb qb-kinds qb-tipwrap"', 'className="qb qb-legend-head qb-tipwrap"', 'className="li qb-tipwrap"']) expect(blocks).toContain(anchor);
    expect(source("./SeriesAnswer.tsx")).toContain('<ul className="ts-legend qb-tipwrap"');
    const compare = css("./compare.css");
    expect(compare).toMatch(/\.cmp-sub \{ position: relative;/);
    expect(compare).toMatch(/\.cmp-big \{ position: relative;/);
    expect(css("./builder/filters-kit.css")).toContain(".qb-tipwrap{position:relative}");
  });

  it("lets a line break before a part kept whole: no nowrap starts with its own space (S4 tests: the network's summary)", () => {
    // „ · 95,3% în asociere (?)” inside .qb-nowrap left no break before it: 56 px past a 390 px screen, its (?) out of reach.
    for (const file of ["./NetworkAnswer.tsx", "./SankeyAnswer.tsx", "./TrendAnswer.tsx", "./CompareBlock.tsx", "./blocks.tsx", "./AskPanel.tsx", "./SeriesAnswer.tsx"])
      expect(readFileSync(new URL(file, import.meta.url), "utf8"), file).not.toMatch(/className="qb-nowrap">\s/);
  });

  it("keeps /harta whole: one text per county's title (it did not hydrate), 44 px targets under 600 px (S4 tests)", () => {
    const page = readFileSync(new URL("../harta/page.tsx", import.meta.url), "utf8");
    expect(page).toContain("<title>{`${s.label} — ${formatRon(v)}`}</title>");
    const harta = css("../harta/harta.css");
    expect(harta).toContain(".toggle a{display:inline-flex;align-items:center;min-height:44px}");
    expect(harta).toContain(".map-note .term-tip>.term-trigger{min-width:44px;min-height:44px;margin-block:-10px}");
  });

  it("draws the kit's separators in --muted, never --faint (2.7:1 on the paper)", () => {
    const kit = css("./builder/filters-kit.css");
    expect(kit).toContain(".qb-total-sep{color:var(--muted)}");
    expect(kit).toContain(".qb-scope-sep{color:var(--muted)}");
  });

  it("lists a distribution's bars, each with its own control (ten bars are under 44 px on a phone)", () => {
    const distribution: DistributionData = {
      buckets: Array.from({ length: 10 }, (_, i) => ({ from: i / 10, to: (i + 1) / 10, n: [3, 0, 24, 0, 0, 1, 0, 0, 0, 0][i]! })),
      focal: { entityId: "7", name: "Comuna X", cri: 0.52, percentile: 96 },
      role: "authority", totalEntities: 28,
    };
    const markup = renderToStaticMarkup(createElement(DistributionBlock, { distribution }));
    const list = markup.slice(markup.indexOf("<summary>Intervalele"));
    expect(list).toContain("<summary>Intervalele indicelui, ca listă</summary>");
    expect([...list.matchAll(/<tr>/g)]).toHaveLength(4); // the header and the three bars with entities
    expect(list).toContain("0,5–0,6 · aici e Comuna X");
    expect(list).toContain('href="/semnale?rol=authority&amp;criMin=0.2&amp;criMax=0.3"');
    // G10: the comparison group is counted with its «de».
    expect(markup).toContain("cele <b>28 de instituții</b>");
  });
});
