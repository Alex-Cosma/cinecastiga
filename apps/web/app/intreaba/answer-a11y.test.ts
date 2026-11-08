import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RUSETU_CHART } from "../../lib/ask/fixtures/distribution-screen";

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
    const results = css("./question-results.css"), clip = css("../../components/clip-button.css");
    const clipButton = readFileSync(new URL("../../components/ClipButton.tsx", import.meta.url), "utf8");
    // The partner's whole name ("în 2024: 100% de la COMPANIA NATIONALA DE ADMINISTRARE…"), never cut by "…" on a phone.
    const partner = results.slice(results.indexOf(".qb-trow-partner > span {"), results.indexOf("}", results.indexOf(".qb-trow-partner > span {")));
    expect(partner).toContain("overflow-wrap: break-word");
    expect(partner).not.toMatch(/text-overflow|nowrap|overflow: hidden/);
    // A transform on the button's wrapper made a stacking context under the trend's positioned rows (they took the
    // clicks). The wrapper never lifts; the save dialog (7 November 2026) lives at the end of the page, fixed inside the
    // window (placed by the component on a wide screen, a bottom sheet on a phone), so no row or column can cover or cut it.
    expect(clip).toMatch(/\.clipbtn\.clipbtn,\.clipbtn\.clipbtn:hover\{[^}]*transform:none/);
    expect(clipButton).toContain("createPortal(panel, document.body)");
    expect(clip).toMatch(/\.save-dialog\{position:fixed;[^}]*max-height:calc\(100dvh - 32px\)/);
    expect(clip).toMatch(/@media \(max-width:700px\)\{[^]*\.save-dialog\.save-sheet\{left:0;right:0;bottom:0;top:auto;/);
    // A signed-in reader's five actions never squash into each other: the records' button on its row, the others two
    // by two under it, as wide as it (owner, 2 November 2026), at every width.
    const actions = results.slice(results.indexOf(".cq-answer-actions {"), results.indexOf("}", results.indexOf(".cq-answer-actions {")));
    expect(actions).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(results).toContain(".cq-answer-actions > .cq-source-main { grid-column: 1 / -1;");
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
    // S5 tests: the map's note under the lens (Primăriile și consiliile județene, Sediul firmei) holds a (?) too.
    expect(css("./question-results.css")).toMatch(/\.cq-result \.ask-fine \{[^}]*position: relative;/);
  });

  it("gives the drawer's „Șterge filtrele listei” 44 px under 600 px (S5 tests: the search's summary)", () => {
    const drawer = css("./evidence-drawer.css").replace(/\s+/g, "");
    expect(drawer).toContain("@media(max-width:599px){.evidence-drawer.ev-filtered-summarybutton{min-height:44px;");
  });

  it("lets a line break before a part kept whole: no nowrap starts with its own space (S4 tests: the network's summary)", () => {
    // „ · 95,3% în asociere (?)” inside .qb-nowrap left no break before it: 56 px past a 390 px screen, its (?) out of reach.
    for (const file of ["./NetworkAnswer.tsx", "./SankeyAnswer.tsx", "./TrendAnswer.tsx", "./CompareBlock.tsx", "./blocks.tsx", "./AskPanel.tsx", "./SeriesAnswer.tsx"])
      expect(readFileSync(new URL(file, import.meta.url), "utf8"), file).not.toMatch(/className="qb-nowrap">\s/);
  });

  it("keeps /harta's targets 44 px under 640 px and its ranking as the keyboard path (S4 tests; owner, 6 November 2026)", () => {
    const harta = css("../harta/harta.css");
    expect(harta).toContain(".mx-seg button,.mx-pick{min-height:44px}");
    expect(harta).toContain(".mx-note .term-tip>.term-trigger{min-width:44px;min-height:44px;margin-block:-10px}");
    const explorer = readFileSync(new URL("../harta/MapExplorer.tsx", import.meta.url), "utf8");
    // Every area on the map is a button in the ranking, with its figure in words (per inhabitant, per bed or the total);
    // a county's hospital is a row whose name is the link to its page (8 November 2026).
    expect(explorer).toContain('className={`mx-row');
    expect(explorer).toContain("lei ${UNIT[metric]}`}");
    expect(explorer).toContain("<EntityName id={a.entityId}");
  });

  it("draws the kit's separators in --muted, never --faint (2.7:1 on the paper)", () => {
    const kit = css("./builder/filters-kit.css");
    expect(kit).toContain(".qb-total-sep{color:var(--muted)}");
    expect(kit).toContain(".qb-scope-sep{color:var(--muted)}");
  });

  it("draws a distribution's chart in six columns (wide enough on a phone) and gives its controls 44 px", () => {
    const markup = renderToStaticMarkup(createElement(DistributionBlock, { distribution: RUSETU_CHART, spec: { block: "distribution", measure: "value", filters: { authorityId: 2145000 } } }));
    // distribution-2: one column per number of criteria (0…5), the entity's marked "aici"; G10 with its «de».
    expect([...markup.matchAll(/class="dist-col/g)]).toHaveLength(6);
    expect(markup).toContain('<em class="cm-fade cm-late">aici</em>442');
    expect(markup).toContain("Din celelalte 2.034 de primării");
    const rules = phoneRules(css("./distribution.css").replace(/\s+/g, ""), ".dist-bars");
    for (const target of [".dist-change", ".dist-all", ".dist-crit-cases", "button.dist-col"]) expect(rules, target).toContain(target);
    expect(rules).toContain("min-height:44px");
  });
});
