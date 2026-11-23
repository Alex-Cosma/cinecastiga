import { describe, expect, it } from "vitest";
import { memoryVocabulary } from "./memory-vocabulary";
import { RulesInterpreter } from "./rules";
import { FIXTURE } from "./rules.fixture";
import { resultFor } from "./to-spec";

/*
 * Owner, 23 November 2026 (migration 0114): „IT” and „brad de crăciun” are curated terms. Two letters are read only as
 * the term written exactly so; the pronoun of an English question is not the term.
 */
const NOW = new Date("2026-10-22T12:00:00Z");
const interpreter = new RulesInterpreter(memoryVocabulary(FIXTURE));
const read = async (q: string) => {
  const i = await interpreter.interpret(q, { now: NOW });
  return { i, r: resultFor(i) };
};

describe("«IT» as a curated term", () => {
  it("reads the subject in «achiziții IT în 2024», «piața de IT», «cine cumpără IT»", async () => {
    for (const q of ["achizitii IT in 2024", "piata de IT", "cine cumpara IT", "cat s-a cheltuit pe it in cluj"]) {
      const { i, r } = await read(q);
      expect([q, i.subjects.map((s) => [s.term, s.label]), i.leftover]).toEqual([q, [["it", "IT"]], []]);
      expect(r.spec?.filters.cpvTerm, q).toBe("it");
    }
    expect((await read("cine cumpara IT")).i.intent).toBe("ranking_authorities");
  });
  it("keeps the longer curated phrase and never fires inside another word", async () => {
    expect((await read("servicii it cluj")).i.subjects.map((s) => s.term)).toEqual(["servicii it"]);
    for (const q of ["iluminat italia", "kit de prim ajutor", "audit financiar buzau"])
      expect([q, (await read(q)).i.subjects.map((s) => s.term).includes("it")]).toEqual([q, false]);
  });
  it("does not read the pronoun of an English question as the term; «IT» in capitals is the term there too", async () => {
    const pronoun = await read("how much did it cost in 2024");
    expect(pronoun.i.subjects.map((s) => s.term)).not.toContain("it");
    const term = await read("who buys IT in bucuresti");
    expect(term.i.subjects.map((s) => s.term)).toEqual(["it"]);
  });
});

describe("«brad de crăciun» as a curated term", () => {
  it("reads the subject and the place said after it, never the town Brad", async () => {
    for (const q of ["cat a costat bradul de craciun din craiova", "brad de craciun craiova", "brazi de craciun craiova"]) {
      const { i } = await read(q);
      expect([q, i.place?.name, i.subjects.map((s) => s.term), i.leftover]).toEqual([q, "Municipiul Craiova", [/^brazi/.test(q) ? "brazi de craciun" : "brad de craciun"], []]);
    }
  });
});
