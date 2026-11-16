import { describe, expect, it } from "vitest";
import type { AskSpec } from "../../lib/ask/spec";
import { questionGist } from "./question-band";

const spec = (filters: AskSpec["filters"]): AskSpec => ({ block: "table", measure: "value", dim: "supplier", topN: 10, filters } as AskSpec);

describe("the question in a few words (Z2-37)", () => {
  it("says what was bought, who bought it, where and when", () => {
    expect(questionGist(spec({ cpvTerm: "medicamente", county: "Cluj", authorityKind: "spital", yearFrom: 2024, yearTo: 2024 }))).toEqual({ lead: "„medicamente”", rest: ["spitale", "Cluj", "2024"] });
  });
  it("names a locality without its kind and county, a period, a code by its name", () => {
    expect(questionGist(spec({ cpvTerm: "45", uatName: "Municipiul Cluj-Napoca (Cluj)", uatSiruta: 54975, yearFrom: 2019, yearTo: 2024 }), "Lucrări de construcții"))
      .toEqual({ lead: "Lucrări de construcții", rest: ["Cluj-Napoca", "2019–2024"] });
  });
  it("leads with the firm a question is about, and has nothing to say for a bare question", () => {
    expect(questionGist(spec({ supplierName: "DACIA SA", supplierId: 1 }))?.lead).toBe("DACIA SA");
    expect(questionGist(spec({}))).toBeNull();
  });
});
