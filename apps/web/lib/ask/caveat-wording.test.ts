import { describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import { countyCaveat, runSpec, seatNote } from "./compile";
import type { Grounding } from "./ground";
import type { AskSpec } from "./spec";

/** A database with no rows: every query answers []. */
function emptyDatabase() {
  class Fragment {
    constructor(public text: string) {}
    then(resolve: (value: unknown[]) => unknown) { return Promise.resolve(resolve([])); }
  }
  const tag = ((chunks: TemplateStringsArray | string, ...params: unknown[]) => new Fragment(typeof chunks === "string" ? chunks
    : chunks.reduce((query, text, i) => query + text + (params[i] instanceof Fragment ? (params[i] as Fragment).text : i < params.length ? "?" : ""), ""))) as unknown as DbSql;
  Object.assign(tag, {
    array: () => new Fragment("?"),
    begin: async (_options: string, fn: (tx: DbSql) => Promise<unknown>) => fn(tag),
    unsafe: async () => [],
  });
  return tag;
}

const buzau = { query: "Buzău", canonical: "Buzau" };
const entity = (entityId: string, nameDisplay: string) => ({ query: nameDisplay, entityId, nameDisplay, county: null, alternatives: [] });

// R0: the county note says whose county a filter selects.
describe("county note", () => {
  const buyer = /^Județul = sediul instituției care cumpără, nu al firmei/;
  const firm = /^Județul = sediul firmei, nu al instituțiilor care cumpără\. Firmele fără sediu cunoscut nu intră\.$/;
  it.each([
    [{ block: "scatter", dim: "supplier", measure: "value", filters: { county: "Buzău" } }, "supplier"],
    [{ block: "entity_card", dim: "supplier", measure: "value", filters: { county: "Buzău" } }, "supplier"],
    [{ block: "entity_card", rankBy: "risk", dim: "supplier", measure: "value", filters: { county: "Buzău" } }, "supplier"],
    [{ block: "distribution", measure: "value", filters: { supplierId: 7, county: "Buzău" } }, "supplier"],
  ] as const)("is the firm's registered office on firm profiles (%o)", (spec, focal) => {
    expect(countyCaveat(spec as AskSpec, focal)).toMatch(firm);
  });
  it.each([
    [{ block: "scatter", dim: "authority", measure: "value", filters: { county: "Buzău" } }, "authority"],
    [{ block: "entity_card", rankBy: "value", dim: "supplier", measure: "value", filters: { county: "Buzău" } }, "supplier"],
    [{ block: "distribution", measure: "value", filters: { authorityId: 8, supplierId: 7, county: "Buzău" } }, "authority"],
    [{ block: "table", dim: "supplier", measure: "value", filters: { county: "Buzău" } }, "supplier"],
    [{ block: "stat", measure: "value", filters: { county: "Buzău" } }, "supplier"],
  ] as const)("is the buyer's everywhere else (%o)", (spec, focal) => {
    expect(countyCaveat(spec as AskSpec, focal)).toMatch(buyer);
  });

  it("travels with the answer of a firm-risk leader", async () => {
    const spec: AskSpec = { block: "entity_card", dim: "supplier", measure: "value", filters: { county: "Buzău" } };
    const result = await runSpec(emptyDatabase(), spec, { county: buzau });
    expect(result.caveats.filter((c) => c.startsWith("Județul ="))).toEqual([expect.stringMatching(firm)]);
    // F4 (owner-seat-switch): where the seat comes from; without the marts' seat column, the SEAP county stands in, said so.
    expect(result.caveats).toContain(seatNote(false));
    expect(seatNote(false)).toMatch(/^Județul firmei = județul din SEAP; sediul din Registrul Comerțului nu e încă calculat\./);
    expect(seatNote(true)).toMatch(/^Județul firmei = sediul ei: ultima înmatriculare la Registrul Comerțului, apoi județul din SEAP; firmele străine apar separat\./);
  });
});

// R0: a relationship with no rows says so on every stream, not "no direct acquisitions".
describe("empty relationship answers", () => {
  it.each(["sankey", "network"] as const)("%s names the selection, not one stream", async (block) => {
    for (const dataset of ["all", "contracts", "da"] as const) {
      const spec: AskSpec = { block, dataset, measure: "value", filters: { authorityId: 2144364, yearFrom: 2026, yearTo: 2026 } };
      const grounding: Grounding = { authority: entity("2144364", "MUNICIPIUL BUZAU") };
      const result = await runSpec(emptyDatabase(), spec, grounding);
      expect(result).toMatchObject({ error: "„MUNICIPIUL BUZAU” nu are înregistrări în selecția aleasă." });
    }
  });
});

// F0 (left by R0): the "avansat" SQL shows the measure the engine computes.
describe("shown SQL", () => {
  it("sums every breakdown, counts too where it is ordered by records (F3), and counts where the count is shown", async () => {
    const shown = async (block: AskSpec["block"]) => {
      const result = await runSpec(emptyDatabase(), { block, measure: "count", filters: {} } as AskSpec, {});
      return "displaySql" in result ? result.displaySql.split("\n")[0] : result.error;
    };
    expect(await shown("breakdown")).toBe("select categoria_cpv, sum(closing_value), count(*)");
    expect(await shown("stat")).toBe("select count(*)");
  });
});
