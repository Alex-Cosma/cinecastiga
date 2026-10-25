import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { QueryPopulation } from "../../lib/ask/population";

vi.mock("@/lib/ask/population", () => import("../../lib/ask/population"));
vi.mock("@/lib/counties", () => import("../../lib/counties"));
vi.mock("@/components/Term", () => import("../../components/Term"));
vi.mock("@/lib/ask/answer-text", () => import("../../lib/ask/answer-text"));

const { default: PopulationEditor } = await import("./PopulationEditor");

/*
 * "⋯ › Selecție avansată" (plan §1.1 variant A): the precise selection's
 * editor offers only the fields and rules the question gives it
 * (BLOCK_FILTERS.advancedFields); a condition already there on another field
 * still reads as itself, so it can be removed.
 */

const render = (value: QueryPopulation, fields?: Parameters<typeof PopulationEditor>[0]["fields"]) =>
  renderToStaticMarkup(createElement(PopulationEditor, { embedded: true, value, onChange: () => {}, ...(fields ? { fields } : {}) }));
const options = (markup: string, select: number) => [...markup.split("<select")[select + 1]!.split("</select>")[0]!.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);

describe("the precise selection's editor", () => {
  const network = [{ field: "date", ops: ["gte", "lte"] }, { field: "value", ops: ["gte", "lte"] }, { field: "supplier", ops: ["in", "not_in"] }, { field: "cpv", ops: ["not_in"] }] as const;

  it("offers every field and rule by default (today's editor)", () => {
    const markup = render({ operator: "and", groups: [{ operator: "and", conditions: [{ field: "cpv", op: "in", values: ["45"] }] }] });
    // The selects: between groups, in the group, the field, the rule.
    expect(options(markup, 2)).toEqual(["date", "value", "authority", "supplier", "cpv", "county"]);
    expect(options(markup, 3)).toEqual(["in", "not_in"]);
  });

  it("offers a question's fields only, and on CPV only leaving codes out", () => {
    const markup = render({ operator: "and", groups: [{ operator: "and", conditions: [{ field: "cpv", op: "not_in", values: ["45"] }] }] }, network);
    expect(options(markup, 2)).toEqual(["date", "value", "supplier", "cpv"]);
    expect(options(markup, 3)).toEqual(["not_in"]);
  });

  it("keeps a condition on a field the question does not offer readable, to be removed", () => {
    const markup = render({ operator: "and", groups: [{ operator: "and", conditions: [{ field: "authority", op: "in", values: ["1"], labels: ["Comuna X"] }] }] }, network);
    expect(options(markup, 2)).toEqual(["date", "value", "authority", "supplier", "cpv"]);
    expect(markup).toContain("Comuna X");
  });

  it("gives its controls 44 px on a phone in «Selecție avansată» (F1b-tests: they were 40–42 px)", () => {
    const css = readFileSync(new URL("./question-builder.css", import.meta.url), "utf8");
    const phone = css.slice(css.lastIndexOf("@media (max-width: 600px) {"));
    expect(phone).toContain(".fk-pop .qp-body :is(button, input, select), .fk-pop .qb-minimum :is(input, button) { min-height: 44px; }");
  });
});
