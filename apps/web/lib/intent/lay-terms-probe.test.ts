import { describe, expect, it } from "vitest";
import { memoryVocabulary, type MemoryFixture } from "./memory-vocabulary";
import { RulesInterpreter } from "./rules";
import { FIXTURE } from "./rules.fixture";

/**
 * List 4 of lay terms (owner approved, 12 November 2026): curated phrases that hold a connector, and curated words that
 * are also the names of communes (Cămin, Apa, Poduri in the real catalogue of localities).
 */
const NOW = new Date("2026-11-12T10:00:00Z");
const fx: MemoryFixture = {
  ...FIXTURE,
  synonyms: [...FIXTURE.synonyms,
    { term: "scaun cu rotile", prefix: "33193100" }, { term: "scaune cu rotile", prefix: "33193100" },
    { term: "ingrijire la domiciliu", prefix: "85141210" }, { term: "camin de batrani", prefix: "85311100" },
    { term: "psihoterapie", prefix: "85121270" }],
};
const interpreter = new RulesInterpreter(memoryVocabulary(fx));
const read = (q: string) => interpreter.interpret(q, { now: NOW });
const terms = async (q: string) => (await read(q)).subjects.map((s) => s.term);

describe("lay terms, list 4 (search probe, 12 November 2026)", () => {
  it("keeps a curated phrase whole across its connector", async () => {
    expect(await terms("scaun cu rotile")).toEqual(["scaun cu rotile"]);
    expect(await terms("scaune cu rotile")).toEqual(["scaune cu rotile"]);
    expect(await terms("ingrijire la domiciliu")).toEqual(["ingrijire la domiciliu"]);
    expect(await terms("alimentare cu apa")).toEqual(["alimentare cu apa"]);
    expect(await terms("cine face cel mai multi bani din ingrijire la domiciliu")).toEqual(["ingrijire la domiciliu"]);
  });

  it("still splits at a connector outside a curated phrase", async () => {
    // „laptopuri cu windows” has no curated phrase: the laptops, and „windows” is not understood
    expect(await terms("laptopuri cu windows")).toEqual(["laptopuri"]);
  });

  it("reads a word of a curated phrase as the subject, not as a commune", async () => {
    const home = await read("camin de batrani");
    expect(home.subjects.map((s) => s.term)).toEqual(["camin de batrani"]);
    expect(home.place).toBeNull();
  });

  it("reads one curated word after a bare preposition as the subject, a commune when it is named as one", async () => {
    const water = await read("cine face cel mai multi bani din apa");
    expect(water.subjects.map((s) => s.term)).toEqual(["apa"]);
    expect(water.place).toBeNull();
    expect((await read("comuna Apa")).place).toMatchObject({ kind: "locality" });
    expect((await read("primaria Apa")).place).toMatchObject({ kind: "locality" });
  });
});
