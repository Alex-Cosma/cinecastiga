import { describe, expect, it } from "vitest";
import { ENGLISH_NOTE, fromEnglish, looksEnglish } from "./english";
import { memoryVocabulary } from "./memory-vocabulary";
import { RulesInterpreter } from "./rules";
import { FIXTURE } from "./rules.fixture";
import { resultFor } from "./to-spec";

/*
 * Search probe, 23 November 2026: questions in English were answered as a national total or not at all. Their question
 * words are read as the Romanian cues; nothing else is translated, and no Romanian question is touched.
 */
const NOW = new Date("2026-11-23T12:00:00Z");
const interpreter = new RulesInterpreter(memoryVocabulary(FIXTURE));
const read = async (q: string) => {
  const i = await interpreter.interpret(q, { now: NOW });
  return { i, r: resultFor(i) };
};

describe("an English question", () => {
  it("is recognised by its own words, never when a Romanian function word is there", () => {
    for (const q of ["who buys medicines in bucuresti", "top buyers of medicines 2025", "biggest cleaning contracts romania 2025", "which hospital spent the most in 2024"])
      expect([q, looksEnglish(q)]).toEqual([q, true]);
    for (const q of ["top firme software 2024", "laptop service management", "contracte Bank of Cyprus", "The House of Europe", "street lighting cluj", "medicines 2024 cluj",
      "cloud hosting 2024", "top 10 firme IT", "cine castiga contracts in cluj", "Best Western contracts", "hospital line srl", "cat s-a cheltuit pe software in 2024", "market size mobilier"])
      expect([q, looksEnglish(q), fromEnglish(q)]).toEqual([q, false, null]);
  });
  it("is read through the Romanian cues, with one note, and keeps the words typed", async () => {
    const { i, r } = await read("how much did romanian hospitals spend on medicines in 2023");
    expect(i.typed).toBe("how much did romanian hospitals spend on medicines in 2023");
    expect([i.intent, i.authorityKind?.kind, i.subjects.map((s) => s.term), i.leftover]).toEqual(["total", "spital", ["medicamente"], []]);
    expect(i.notes).toEqual([ENGLISH_NOTE, "Am citit „medicines” ca „medicamente”."]);
    expect(r.sentence).toBe("Cât valorează achizițiile pentru „medicamente” făcute de spitalele din toată țara, în 2023?");
  });
  it("ranks the buyers, the firms and the counties the words ask for", async () => {
    for (const [q, intent, kind, sentence] of [
      ["top buyers of medicines 2025", "ranking_authorities", undefined, "Ce instituții publice din toată țara cumpără cel mai mult pentru „medicamente”, prin toate achizițiile, în 2025?"],
      ["top hospitals by medical equipment spending 2024", "ranking_authorities", "spital", "Ce spitale din toată țara cumpără cel mai mult pentru „echipamente medicale”, prin toate achizițiile, în 2024?"],
      ["which hospital spent the most in 2024", "ranking_authorities", "spital", "Care spital din toată țara cumpără cel mai mult, prin toate achizițiile, în 2024?"],
      ["which hospitals had the most single-bid tenders", "ranking_authorities", "spital", "Ce spitale din toată țara cumpără cel mai mult, prin contracte din proceduri, în toți anii, după numărul de înregistrări?"],
      ["schools with the most direct awards in 2025", "ranking_authorities", "scoala", "Ce școli din toată țara cumpără cel mai mult, prin achiziții directe, în 2025, după numărul de înregistrări?"],
      ["top municipalities by procurement spending per capita 2023", "ranking_authorities", undefined, "Ce primării din toată țara cumpără cel mai mult, prin toate achizițiile, în 2023, după valoarea pe locuitor?"],
      ["who won the most road contracts in buzau county 2023", "ranking_suppliers", undefined, "Ce firme câștigă achizițiile pentru „drumuri” făcute de instituțiile publice din județul Buzău, în 2023, după numărul de înregistrări?"],
      ["who gets the money in buzau county", "ranking_suppliers", undefined, "Ce firme câștigă achizițiile făcute de instituțiile publice din județul Buzău, în toți anii?"],
      ["direct awards by county 2024", "counties", undefined, "Cum se împart achizițiile directe făcute de instituțiile publice pe județe, în 2024?"],
    ] as const) {
      const { i, r } = await read(q);
      expect([q, i.intent, i.authorityKind?.kind, i.leftover, r.sentence]).toEqual([q, intent, kind, [], sentence]);
      expect(i.notes[0]).toBe(ENGLISH_NOTE);
    }
  });
  it("reads the largest records, a period and a place the English way of saying them", async () => {
    const largest = await read("biggest contracts buzau county council");
    expect(largest.r.sentence).toBe("Care sunt cele mai mari achiziții făcute de JUDETUL BUZAU, în toți anii?");
    const hospital = await read("largest single contract signed by a hospital in Bucharest");
    expect(hospital.r.sentence).toBe("Care sunt cele mai mari achiziții făcute de spitalele din București, în toți anii?");
    const since = await read("how much was spent on roads since 2020");
    expect(since.r.sentence).toBe("Cât valorează achizițiile pentru „drumuri” făcute de instituțiile publice din toată țara, din 2020 încoace?");
    expect((await read("how much did hospitals spend on medicines between 2021 and 2023")).i.period).toMatchObject({ yearFrom: 2021, yearTo: 2023 });
    expect((await read("which hospital spent the most last year")).i.period).toMatchObject({ yearFrom: 2025, yearTo: 2025 });
  });
  it("asks which place when the words do not name it, and says a word it does not know", async () => {
    const own = await read("how much did my town hall spend on lighting");
    expect(own.i.notes.join(" ")).toContain("nu știm ce localitate este");
    const unknown = await read("who buys widgets in bucuresti");
    expect([unknown.i.intent, unknown.i.leftover]).toEqual(["ranking_authorities", ["widgets"]]);
  });
});

describe("a Romanian question", () => {
  it("is never rewritten, English-looking words and all", async () => {
    for (const q of ["top firme software 2024", "cine castiga contracte de software in judetul Buzau", "iluminat buzau", "laptop judetul Buzau 2024"]) {
      const { i } = await read(q);
      expect([q, i.typed, i.text, i.notes.includes(ENGLISH_NOTE)]).toEqual([q, undefined, q, false]);
    }
  });
});
