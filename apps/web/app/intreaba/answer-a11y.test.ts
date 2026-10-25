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
    for (const selector of [".cq-answer .cq-record-link", ".cq-answer td a", ".cq-answer details > summary", ".cq-answer .cq-answer-tools .cq-copy", ".cq-answer .cq-export summary", ".cq-answer .ask-trend .nm a"])
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

  it("draws the kit's separators in --muted, never --faint (2.7:1 on the paper)", () => {
    const kit = css("./builder/filters-kit.css");
    expect(kit).toContain(".fk-total-sep{color:var(--muted)}");
    expect(kit).toContain(".fk-scope-sep{color:var(--muted)}");
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
