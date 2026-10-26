import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The app's "@/" paths are Next's; the unit tests resolve them to the same modules.
vi.mock("@/lib/format", () => import("../../lib/format"));
vi.mock("@/lib/entity-summary", () => import("../../lib/entity-summary"));
vi.mock("@/lib/ask/answer-text", () => import("../../lib/ask/answer-text"));
vi.mock("@/lib/ask/permalink", () => import("../../lib/ask/permalink"));
vi.mock("@/lib/ask/source-spec", () => import("../../lib/ask/source-spec"));
vi.mock("@/lib/ask/spec", () => import("../../lib/ask/spec"));
vi.mock("@/lib/ask/question-ui", () => import("../../lib/ask/question-ui"));
vi.mock("@/lib/ask/filters/retarget", () => import("../../lib/ask/filters/retarget"));
vi.mock("@/lib/flags", () => import("../../lib/flags"));
vi.mock("@/lib/ask/sankey-shared", () => import("../../lib/ask/sankey-shared"));
vi.mock("@/lib/ask/filters/exclusions", () => import("../../lib/ask/filters/exclusions"));

const { BreakdownBlock } = await import("./blocks");
const { default: SankeyAnswer } = await import("./SankeyAnswer");

/*
 * F1b-tests: the browser check found the CPV catalogue's cedilla letters in
 * the answer ("Lucrări de construcţii") while the sentence, the windows and the
 * title write ș/ț. The breakdown's slices and the flow's categories say them
 * as the sentence does; the answer's data (and its CSV) keep the catalogue's.
 */

const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("CPV names in the answer", () => {
  it("are written with ș/ț in the breakdown", () => {
    const markup = text(renderToStaticMarkup(createElement(BreakdownBlock, {
      slices: [{ code: "45", name: "Lucrări de construcţii", value: 900, count: 3 }, { code: "33", name: "Echipament medical, produse farmaceutice şi produse de îngrijire personală", value: 100, count: 1 }],
      other: { value: 0, count: 0 },
      spec: { block: "breakdown", measure: "value", filters: {} },
    } as never)));
    expect(markup).toContain("Lucrări de construcții");
    expect(markup).toContain("produse farmaceutice și produse");
    expect(markup).not.toMatch(/[şţŞŢ]/);
  });

  it("are written with ș/ț in the flow's domains (sankey-2: below a division, the catalogue's name)", () => {
    const markup = text(renderToStaticMarkup(createElement(SankeyAnswer, {
      data: {
        block: "sankey", focal: { entityId: "1", name: "Primăria Exemplu", role: "authority" },
        flows: [{ partnerId: "7", partner: "FIRMA EXEMPLU SRL", categoryCode: "4523", category: "Lucrări de construcţii de autostrăzi", value: 1000, count: 2 }],
        partners: [{ entityId: "7", name: "FIRMA EXEMPLU SRL", value: 1000, count: 2, domains: 1, joint: 0 }],
        domains: [{ code: "4523", name: "Lucrări de construcţii de autostrăzi", value: 1000, count: 2, partners: 1 }],
        totals: { value: 1000, count: 2, partners: 1, domains: 1 }, stemLen: 4, joint: 0,
      },
      spec: { block: "sankey", dim: "authority", measure: "value", filters: { authorityId: 1, authorityName: "Primăria Exemplu", cpvTerm: "45" } },
    } as never)));
    expect(markup).toContain("Lucrări de construcții de autostrăzi");
    expect(markup).not.toMatch(/[şţŞŢ]/);
  });
});
