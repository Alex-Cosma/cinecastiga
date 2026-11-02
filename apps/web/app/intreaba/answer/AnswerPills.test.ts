import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AskSpec } from "../../../lib/ask/spec";

// The app's "@/" paths are Next's; the unit tests resolve them to the same modules.
vi.mock("@/lib/ask/spec", () => import("../../../lib/ask/spec"));
vi.mock("@/lib/ask/question-ui", () => import("../../../lib/ask/question-ui"));
vi.mock("@/lib/ask/filters/blocks", () => import("../../../lib/ask/filters/blocks"));
vi.mock("@/lib/ask/filters/context", () => import("../../../lib/ask/filters/context"));
vi.mock("@/lib/ask/filters/pickers", () => import("../../../lib/ask/filters/pickers"));
vi.mock("@/lib/ask/filters/trend-rules", () => import("../../../lib/ask/filters/trend-rules"));
vi.mock("@/lib/ask/months-window", () => import("../../../lib/ask/months-window"));
vi.mock("@/lib/ask/population", () => import("../../../lib/ask/population"));
vi.mock("@/lib/ask/purchase", () => import("../../../lib/ask/purchase"));
vi.mock("@/lib/ask/answer-text", () => import("../../../lib/ask/answer-text"));
vi.mock("@/lib/counties", () => import("../../../lib/counties"));
vi.mock("@/lib/format", () => import("../../../lib/format"));
vi.mock("@/lib/entity-summary", () => import("../../../lib/entity-summary"));
vi.mock("@/components/Term", () => import("../../../components/Term"));

const { default: AnswerPills } = await import("./AnswerPills");

/*
 * The pills under the answer's title open the builder's windows in place
 * (owner, 1 November 2026): buttons named for their place, with a popup;
 * the answer's shape and the windows that edit over several steps stay text.
 */

const render = (spec: AskSpec, pills: string[], labels = {}) =>
  renderToStaticMarkup(createElement(AnswerPills, { spec, pills, labels, onApply: () => undefined }));

describe("the answer's pills", () => {
  it("makes the place, the domain, the period, the list and the stream buttons that open their windows", () => {
    const spec: AskSpec = { block: "table", measure: "value", dim: "supplier", topN: 10, filters: { cpvTerm: "deszapezire", county: "Suceava", yearFrom: 2024, yearTo: 2024 } };
    const markup = render(spec, ["clasament", "top 10 furnizori", "valoarea înregistrată", "Vehicule pentru întreținere pe timp de iarnă (34143000-1) +4 CPV", "județul Suceava", "2024", "toate achizițiile: directe și din proceduri"]);
    expect(markup).toContain('<span class="cq-scope-text">clasament</span>');
    for (const name of ["Unde: județul Suceava", "Perioada: 2024", "Câte rânduri: top 10 furnizori", "Ordinea: valoarea înregistrată", "Achizițiile: toate achizițiile: directe și din proceduri",
      "Ce s-a cumpărat: Vehicule pentru întreținere pe timp de iarnă (34143000-1) +4 CPV"])
      expect(markup).toContain(`aria-haspopup="dialog" aria-expanded="false" aria-label="${name}"`);
    expect(markup.match(/class="cq-pill"/g)).toHaveLength(6);
    // A pill's tint is its edge: no dot beside it.
    expect(markup).not.toContain("cq-scope-sep");
  });

  it("separates two words that are text with a dot that is drawn, not read", () => {
    const spec: AskSpec = { block: "breakdown", measure: "value", filters: { uatSiruta: 44845, uatName: "Municipiul Râmnicu Sărat (Buzău)" } };
    const markup = render(spec, ["pe domenii", "valoarea înregistrată", "Municipiul Râmnicu Sărat (Buzău)", "toți anii", "toate achizițiile: directe și din proceduri"]);
    expect(markup).toMatch(/^<div class="cq-scope"><span class="cq-scope-text">pe domenii<\/span><span class="cq-scope-sep" aria-hidden="true">·<\/span><span class="cq-scope-text">valoarea înregistrată<\/span><button/);
    for (const name of ["Cine a cumpărat: Municipiul Râmnicu Sărat (Buzău)", "Perioada: toți anii"]) expect(markup).toContain(`aria-label="${name}"`);
  });

  it("keeps a distribution's entity and group as text: their windows follow up the entity and tick one by one", () => {
    const spec: AskSpec = { block: "distribution", measure: "value", dim: "authority", filters: { authorityId: 1, authorityName: "MUNICIPIUL VASLUI" }, peers: { similar: true } };
    const markup = render(spec, ["risc față de grup", "MUNICIPIUL VASLUI", "grupul de comparație: populație apropiată", "populație RPL 2021", "achiziții directe"]);
    expect(markup).not.toContain('class="cq-pill"');
  });
});
