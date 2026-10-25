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

const { BreakdownBlock, SankeyBlock } = await import("./blocks");

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

  it("are written with ș/ț in the flow's categories", () => {
    const markup = text(renderToStaticMarkup(createElement(SankeyBlock, {
      flows: [{ partnerId: "7", partner: "FIRMA EXEMPLU SRL", categoryCode: "45", category: "Lucrări de construcţii", value: 1000, count: 2 }],
      focal: { entityId: "1", name: "Primăria Exemplu", role: "authority" },
      spec: { block: "sankey", dim: "authority", measure: "value", filters: { authorityId: 1, authorityName: "Primăria Exemplu" } },
    } as never)));
    expect(markup).toContain("Lucrări de construcții");
    expect(markup).not.toMatch(/[şţŞŢ]/);
  });
});
