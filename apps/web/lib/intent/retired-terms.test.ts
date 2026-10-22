import { describe, expect, it } from "vitest";
import { RETIRED_TERMS } from "../ask/retired-terms";
import { memoryVocabulary } from "./memory-vocabulary";
import { RulesInterpreter } from "./rules";
import { FIXTURE } from "./rules.fixture";
import { resultFor } from "./to-spec";

const NOW = new Date("2026-10-22T12:00:00Z");
const interpreter = new RulesInterpreter(memoryVocabulary(FIXTURE));
const read = async (q: string) => resultFor(await interpreter.interpret(q, { now: NOW }));

describe("retired words are offered as choices, never guessed", () => {
  it("„mese” is catering or furniture: no subject, one alternative per meaning", async () => {
    const r = await read("mese");
    expect(r.spec).toBeNull();
    expect(r.interpretation.subjects).toEqual([]);
    expect(r.problem).toBe(RETIRED_TERMS["mese"]!.message);
    expect(r.alternatives.map((a) => [a.kind, a.label, a.spec.filters.cpvTerm])).toEqual([
      ["subject", "catering (mese servite)", "catering"],
      ["subject", "mobilier: mese", "39121200"],
    ]);
    expect(r.alternatives[0]!.sentence).toContain("„catering (mese servite)”");
  });

  it("keeps the rest of the question in every choice", async () => {
    const r = await read("mese calde scoala");
    expect(r.spec).toBeNull();
    expect(r.interpretation.subjectChoices?.options.map((o) => o.term)).toEqual(["catering", "39121200"]);
    expect(r.alternatives.every((a) => a.spec.filters.authorityKind === "scoala")).toBe(true);
  });

  it("„lucrari” alone asks which works; next to a real subject it is just a word", async () => {
    const alone = await read("lucrari buzau");
    expect(alone.spec).toBeNull();
    expect(alone.alternatives.map((a) => a.spec.filters.cpvTerm)).toEqual(["constructii", "cladiri", "drumuri", "reparatii", "renovare"]);
    expect(alone.alternatives.every((a) => a.spec.filters.county === "Buzău")).toBe(true);
    const asphalt = await read("lucrari de asfaltare");
    expect(asphalt.interpretation.subjectChoices ?? null).toBeNull();
    expect(asphalt.spec?.filters.cpvTerm).toBe("45233222-1"); // „Lucrări de pavare şi de asfaltare”
  });

  it("„programe” is software or training", async () => {
    const r = await read("programe");
    expect(r.alternatives.map((a) => a.spec.filters.cpvTerm)).toEqual(["software", "80500000"]);
  });
});
