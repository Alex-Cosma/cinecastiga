import { describe, expect, it } from "vitest";
import { memoryVocabulary, type MemoryFixture } from "./memory-vocabulary";
import { RulesInterpreter } from "./rules";
import { FIXTURE } from "./rules.fixture";
import { resultFor } from "./to-spec";

/*
 * Search probe, 23 November 2026, family 5: ordinary words were looked up as a firm's or an institution's name
 * („constructii” offered 635 firms, „minister” 161, „totala” two), a domain word stayed out of the answer („construcții”
 * alone, a typo with two letters swapped), or a common word became a domain it does not mean („clienții”, „market”,
 * „a organizat”, „lucrarea de licență”).
 */
const NOW = new Date("2026-10-22T12:00:00Z");
// Firms whose names carry the ordinary words: none of them is what the question names.
const fixture: MemoryFixture = {
  ...FIXTURE,
  catalog: [...FIXTURE.catalog, { code: "79342300-6", name: "Servicii pentru clienţi" }, { code: "98100000-4", name: "Servicii de organizaţii asociative" }, { code: "79342000-3", name: "Servicii de marketing" }],
  synonyms: [...FIXTURE.synonyms, { term: "marketing", prefix: "79342000" }],
  suppliers: [...FIXTURE.suppliers,
    { id: 9100001, name: "CONSTRUCTII FEROVIARE SA", county: "Iasi", total: 5_000_000 }, { id: 9100002, name: "DRUM CONSTRUCTII SRL", county: "Cluj", total: 4_000_000 },
    { id: 9100003, name: "TOTALA ACT SRL", county: "Cluj", total: 3_000_000 }, { id: 9100004, name: "PROCENT INVEST SRL", county: "Dolj", total: 2_000_000 },
    { id: 9100005, name: "MINISTER CONSULT SRL", county: "Ilfov", total: 1_000_000 }, { id: 9100006, name: "FIRMA DE CASA SRL", county: "Ilfov", total: 900_000 },
    { id: 9100007, name: "ORGANIZAT EVENT SRL", county: "Ilfov", total: 800_000 }, { id: 9100008, name: "ELECTRICA SA", county: "Bucuresti", total: 700_000_000 },
    { id: 9100009, name: "ELECTRICA FURNIZARE SA", county: "Bucuresti", total: 600_000_000 }],
};
const interpreter = new RulesInterpreter(memoryVocabulary(fixture));
const read = async (q: string) => {
  const i = await interpreter.interpret(q, { now: NOW });
  return { i, r: resultFor(i) };
};

describe("ordinary words are not names", () => {
  it("never offers the firms whose names merely carry a generic word", async () => {
    for (const q of ["ce minister a dat cele mai multe contracte fara licitatie", "valoarea totala a achizitiilor publice din romania pe fiecare an",
      "ce procent din achizitiile primariilor sunt achizitii directe", "cele mai mari contracte de constructii fara bucuresti", "negociere fara publicare constructii 2024"]) {
      const { i } = await read(q);
      expect([q, i.entityAlternatives, i.supplier, i.authority]).toEqual([q, [], null, null]);
    }
    // the word the answer did not use is said, not dropped
    expect((await read("ce minister a dat cele mai multe contracte fara licitatie")).i.leftover).toEqual(["minister"]);
    // „ce procent” is now read as the share asked (measures.test.ts)
    expect((await read("ce procent din achizitiile primariilor sunt achizitii directe")).i.leftover).toEqual([]);
  });
  it("reads «valoarea totală», «suma totală» as the total", async () => {
    const yearly = await read("valoarea totala a achizitiilor publice din romania pe fiecare an");
    expect([yearly.i.intent, yearly.i.leftover, yearly.r.spec?.block]).toEqual(["trend", [], "timeseries"]);
    const sum = await read("suma totala contracte paza municipiul buzau 2022-2024");
    expect([sum.i.intent, sum.i.leftover, sum.r.spec?.block]).toEqual(["total", [], "stat"]);
  });
  it("ranks the firms for «firma care ia cele mai multe contracte de la …», without looking «firma» up", async () => {
    const { i, r } = await read("firma care ia cele mai multe contracte de la consiliul judetean buzau");
    expect([i.intent, i.authority?.id, i.supplier, i.entityAlternatives, i.leftover]).toEqual(["ranking_suppliers", 2144001, null, [], []]);
    expect(r.spec).toMatchObject({ block: "table", dim: "supplier", measure: "count" });
  });
  it("says a development region cannot be applied instead of looking its words up", async () => {
    const { i } = await read("spitale din regiunea nord est");
    expect(i.entityAlternatives).toEqual([]);
    expect(i.authorityKind?.kind).toBe("spital");
    expect(i.notes).toEqual(["„din regiunea nord est”: o regiune nu se poate aplica; am căutat în toată țara. Alege un județ pentru a restrânge."]);
    expect((await read("drumuri regiunea de dezvoltare vest")).i.notes[0]).toMatch(/^„regiunea de dezvoltare vest”: o regiune nu se poate aplica/);
  });
  it("still reads a name the person marks, and the firm called exactly by a vocabulary word", async () => {
    expect((await read("cu cine lucreaza constructii erbasu")).i.supplier?.id).toBe(9000001);
    expect((await read("cat a castigat firma constructii feroviare")).i.supplier?.id).toBe(9100001);
    // „Electrica” is a firm's whole name: its firms are still offered
    expect((await read("electrica")).i.entityAlternatives.map((e) => e.id)).toEqual(expect.arrayContaining([9100008]));
    expect((await read("strabag")).i.entityAlternatives.length).toBeGreaterThan(0);
  });
});

describe("a domain word is the subject, or is said", () => {
  it("reads «construcții» alone as its curated domain; beside a real subject it stays a word", async () => {
    for (const q of ["cine castiga cele mai multe contracte de constructii in cluj", "firme de constructii din cluj cu cele mai multe contracte", "negociere fara publicare constructii 2024",
      "licitatii constructii cu un singur ofertant in judetul dolj"]) {
      const { i } = await read(q);
      expect([q, i.subjects.map((s) => s.term), i.leftover]).toEqual([q, ["constructii"], []]);
    }
    const at = await read("ce cumpara consiliul judetean buzau la constructii");
    expect([at.i.authority?.id, at.i.subjects.map((s) => s.label)]).toEqual([2144001, ["construcții"]]);
    expect((await read("constructii de drumuri in cluj")).i.subjects.map((s) => s.term)).not.toContain("constructii");
    // „lucrări” alone stays the purchase kind
    expect((await read("lucrari in cluj")).i.subjects).toEqual([]);
  });
  it("reads two letters only as a curated term written exactly so, and says «IT» when there is none", async () => {
    const none = await read("achizitii IT cluj 2025");
    expect([none.i.subjects, none.i.leftover]).toEqual([[], ["IT"]]);
    const withTerm = new RulesInterpreter(memoryVocabulary({ ...fixture, synonyms: [...fixture.synonyms, { term: "it", prefix: "72000000" }] }));
    const i = await withTerm.interpret("achizitii IT cluj 2025", { now: NOW });
    expect([i.subjects.map((s) => s.term), i.leftover]).toEqual([["it"], []]);
  });
  it("corrects two neighbouring letters typed in the other order", async () => {
    const { i } = await read("servicii de curatenei comuna floresti cluj");
    expect([i.subjects.map((s) => s.term), i.leftover]).toEqual([["curatenie"], []]);
  });
});

describe("a common word is not a domain it does not mean", () => {
  it("reads «clienții» as the buyers, never «Servicii pentru clienţi»", async () => {
    const mine = await read("clientii mei potentiali pt catering in sibiu");
    expect([mine.i.intent, mine.i.subjects.map((s) => s.term)]).toEqual(["ranking_authorities", ["catering"]]);
    const firm = await read("cine sunt clientii firmei elbi energy projects");
    expect([firm.i.supplier?.id, firm.i.subjects, firm.r.spec?.dim]).toEqual([9000003, [], "authority"]);
  });
  it("never reads «market size» as marketing (it asks the total, measures.test.ts), and keeps «marketing»", async () => {
    const { i } = await read("market size mobilier 2024");
    expect([i.subjects.map((s) => s.term), i.leftover, i.intent]).toEqual([["mobilier"], [], "total"]);
    expect((await read("marketing cluj")).i.subjects.map((s) => s.term)).toEqual(["marketing"]);
  });
  it("takes a participle after its auxiliary as the question's verb, not a domain or a name", async () => {
    const { i } = await read("cate licitatii a organizat spitalul judetean de urgenta buzau intre 2019 si 2022");
    expect([i.authority?.id, i.subjects, i.entityAlternatives, i.leftover]).toEqual([2144002, [], [], []]);
  });
  it("reads «lucrarea mea de licență» as the person's paper, not software licences", async () => {
    const { i } = await read("pentru lucrarea mea de licenta cat s-a cheltuit pe iluminat in cluj");
    expect(i.subjects.map((s) => s.term)).toEqual(["iluminat"]);
    expect((await read("licente software cluj")).i.subjects.map((s) => s.term)).toContain("licente");
  });
});
