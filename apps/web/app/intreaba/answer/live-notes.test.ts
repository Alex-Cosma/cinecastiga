import { describe, expect, it } from "vitest";
import type { AskSpec } from "../../../lib/ask/spec";
import { transitionQuestion, type QuestionSpec } from "../../../lib/ask/question-ui";
import { builderView } from "../builder/view";
import { liveNotes } from "./live-notes";

/*
 * UX audit Z2-03, variant B: the pills' row is gone; the sentence, the presentation line and the chips say what the
 * pills that opened a window said. What only a pill said stays as quiet words under the title.
 */

const view = (spec: AskSpec) => builderView(transitionQuestion(spec as unknown as QuestionSpec).spec);

describe("liveNotes", () => {
  it("a ranking: every pill is a phrase of the sentence or of the presentation line; the shape word is left out", () => {
    const spec = { block: "table", measure: "value", dim: "supplier", topN: 10, filters: { cpvTerm: "medicamente", county: "Cluj", authorityKind: "spital", yearFrom: 2024, yearTo: 2024 } } as unknown as AskSpec;
    const pills = ["clasament", "top 10 furnizori", "valoarea înregistrată", "Produse farmaceutice (33600000-6)", "fără 3 subclase (vezi limitele)", "doar spitale", "județul Cluj", "2024", "toate achizițiile: directe și din proceduri"];
    const out = liveNotes(spec, pills, {}, view(spec));
    expect(out.notes).toEqual([]);
    expect(out.subclasses).toBe("fără 3 subclase (vezi limitele)");
  });

  it("a breakdown: the measure and the stream, which no phrase says, stay as words; „pe domenii” does not", () => {
    const spec = { block: "breakdown", measure: "value", filters: { authorityId: 2145984, authorityName: "SPITALUL JUDETEAN DE URGENTA BUZAU" } } as unknown as AskSpec;
    const pills = ["pe domenii", "valoarea înregistrată", "SPITALUL JUDETEAN DE URGENTA BUZAU", "toți anii", "toate achizițiile: directe și din proceduri"];
    expect(liveNotes(spec, pills, {}, view(spec)).notes).toEqual(["valoarea înregistrată", "toate achizițiile: directe și din proceduri"]);
  });

  it("a risk cloud: the size of its group stays, with „achiziții directe”", () => {
    const spec = { block: "scatter", dim: "authority", filters: { county: "Buzău" } } as unknown as AskSpec;
    const pills = ["337 de instituții publice", "județul Buzău", "achiziții directe"];
    expect(liveNotes(spec, pills, { scatterGroup: 337 }, view(spec)).notes).toEqual(["337 de instituții publice", "achiziții directe"]);
  });

  it("words the sentence already says are not repeated", () => {
    const spec = { block: "breakdown", measure: "value", filters: { authorityId: 1, authorityName: "MUNICIPIUL BUZAU" } } as unknown as AskSpec;
    const out = liveNotes(spec, ["pe domenii", "MUNICIPIUL BUZAU", "toți anii"], {}, view(spec));
    expect(out.notes).toEqual([]);
    expect(out.subclasses).toBeNull();
  });
});
