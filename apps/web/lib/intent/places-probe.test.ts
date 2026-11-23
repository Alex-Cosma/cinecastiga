import { describe, expect, it } from "vitest";
import { memoryVocabulary, type MemoryFixture } from "./memory-vocabulary";
import { RulesInterpreter } from "./rules";
import { FIXTURE } from "./rules.fixture";
import { resultFor } from "./to-spec";

/*
 * Search probe, 23 November 2026, family 8: „bradul de Crăciun din Craiova” read the town Brad and dropped Craiova;
 * „primăria Clujului” asked which locality; a town hall registered with its council in brackets was not found, so its
 * signals were answered with the whole county; „care nu sunt din București” applied București.
 */
const NOW = new Date("2026-10-22T12:00:00Z");
const fixture: MemoryFixture = {
  ...FIXTURE,
  // the site's curated list has „crăciun” (decorations, trees, lights); the phrase „brad de crăciun” (migration 0114,
  // it-christmas-tree.test.ts) is left out here: these cases are about a word that is also a town
  synonyms: [...FIXTURE.synonyms.filter((s) => !/^bra(?:d|zi) de craciun$/.test(s.term)), { term: "craciun", prefix: "39298910" }],
  authorities: [...FIXTURE.authorities,
    { id: 9200001, name: "MUNICIPIUL ADJUD (CONSILIUL LOCAL AL MUNICIPIULUI ADJUD)", county: "Vrancea", total: 300_000_000 },
    { id: 9200002, name: "SPITALUL MUNICIPAL ADJUD", county: "Vrancea", total: 90_000_000 },
    { id: 9200003, name: "COMUNA SALCIOARA (PRIMARIA COMUNEI SALCIOARA)", county: "Dambovita", total: 9_000_000 }],
};
const interpreter = new RulesInterpreter(memoryVocabulary(fixture));
const read = async (q: string) => {
  const i = await interpreter.interpret(q, { now: NOW });
  return { i, r: resultFor(i) };
};

describe("places in the words", () => {
  it("prefers the place said after a place word to a word that is also a town", async () => {
    for (const q of ["cat a costat bradul de craciun din craiova", "bradul de craciun craiova", "brazi de craciun craiova"]) {
      const { i } = await read(q);
      expect([q, i.place?.name, i.subjects.map((s) => s.term), i.notes.filter((n) => /un singur loc/.test(n))]).toEqual([q, "Municipiul Craiova", ["craciun"], []]);
      expect(i.leftover).toHaveLength(1);
    }
    // the town itself, named as one
    expect((await read("iluminat primaria orasului brad")).i.place?.name).toBe("Municipiul Brad");
    expect((await read("iluminat bradu")).i.place?.name).toBe("Comuna Bradu");
    // a county beside a locality still qualifies it
    expect((await read("Sălcioara, Ialomița")).i.place).toMatchObject({ name: "Comuna Sălcioara", county: "Ialomița" });
  });
  it("reads the genitive after «primăria» as the town whose name starts with it", async () => {
    for (const q of ["cat a dat primaria clujului pe iluminat", "primaria cluj iluminat"]) {
      const { i } = await read(q);
      expect([q, i.placeAmbiguous, i.place?.name]).toEqual([q, false, "Municipiul Cluj-Napoca"]);
    }
    expect((await read("primaria iasiului iluminat")).i.place?.name).toBe("Municipiul Iași");
    // a county named as a town hall still asks which town
    expect((await read("primaria dolj iluminat")).i.placeAmbiguous).toBe(true);
  });
  it("finds the town hall registered with its council in brackets, for a question about the institution", async () => {
    for (const q of ["primaria mea are semnale de risc? sunt din adjud", "ce semnale de risc are primaria adjud"]) {
      const { i, r } = await read(q);
      expect([q, i.intent, i.authority?.id, i.place]).toEqual([q, "signals", 9200001, null]);
      expect(r.spec?.filters).toMatchObject({ authorityId: 9200001 });
    }
    // another institution of the town is not its town hall
    expect((await read("semnale de risc municipiul braila")).i.authority?.id).toBe(3000001);
  });
  it("does not apply a place the words leave out", async () => {
    const { i } = await read("firme de curatenie care nu sunt din bucuresti care lucreaza cu spitale");
    expect(i.place).toBeNull();
    expect(i.notes).toContain("„nu sunt din bucuresti”: nu putem scoate un loc din căutare, așa că am căutat în toată țara.");
    expect((await read("curatenie in bucuresti")).i.place?.county).toBe("București");
  });
});
