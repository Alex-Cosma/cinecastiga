import { describe, expect, it } from "vitest";
import { memoryVocabulary } from "./memory-vocabulary";
import { RulesInterpreter } from "./rules";
import { FIXTURE } from "./rules.fixture";
import { questionTitle } from "../ask/filters/title";
import { LARGEST_RECORDS, largestSentence } from "./text";
import { LARGEST_IN_SOURCES, resultFor } from "./to-spec";

/*
 * Search probe, 23 November 2026: „cel mai mare contract de…” read as a ranking of firms, a breakdown or a total. The
 * largest single records are the selection's own: its total, the question saying „Care sunt cele mai mari…”, and the
 * answer opened on its sources list, the largest first (IntentResult.sources), where a subject, a place, a buyer or a
 * firm narrows the selection.
 */
const NOW = new Date("2026-10-22T12:00:00Z");
const interpreter = new RulesInterpreter(memoryVocabulary(FIXTURE));
const read = async (q: string) => resultFor(await interpreter.interpret(q, { now: NOW }));

describe("the largest records of a selection", () => {
  it("reads the subject's largest records as its total, opened on the sources list", async () => {
    for (const q of ["cel mai mare contract de iluminat din 2024", "cele mai mari contracte pentru iluminat in 2024", "cel mai scump contract de iluminat din 2024",
      "cele mai mari 5 contracte pe iluminat in 2024", "top 10 cele mai mari contracte de iluminat din 2024", "cine a castigat cel mai mare contract de iluminat in 2024"]) {
      const r = await read(q);
      expect([q, r.interpretation.intent, r.interpretation.leftover, r.spec?.block, r.sources]).toEqual([q, "total", [], "stat", "largest"]);
      expect(r.spec).toMatchObject({ filters: { cpvTerm: "iluminat", yearFrom: 2024, yearTo: 2024 } });
      expect(r.sentence).toBe("Care sunt cele mai mari achiziții pentru „iluminat” făcute de instituțiile publice din toată țara, în 2024?");
    }
    expect((await read("cele mai mari 5 contracte pe iluminat in 2024")).interpretation.largest?.n).toBe(5);
  });
  it("keeps the institution, the kind of buyer and the stream the words name; the participle is part of the phrase", async () => {
    const hall = await read("care e cel mai mare contract dat vreodata de primaria din Ramnicu Sarat");
    expect([hall.interpretation.intent, hall.interpretation.leftover, hall.sources]).toEqual(["total", [], "largest"]);
    expect(hall.sentence).toMatch(/^Care sunt cele mai mari achiziții făcute de primăria Râmnicu Sărat/);
    const signed = await read("cel mai mare contract semnat de primaria din Ramnicu Sarat");
    expect([signed.interpretation.leftover, signed.sources]).toEqual([[], "largest"]);
    const hospitals = await read("cele mai mari contracte ale spitalelor in 2025");
    expect(hospitals.spec).toMatchObject({ block: "stat", filters: { authorityKind: "spital", yearFrom: 2025 } });
    expect(hospitals.sentence).toBe("Care sunt cele mai mari achiziții făcute de spitalele din toată țara, în 2025?");
    const direct = await read("cea mai mare achizitie directa de iluminat");
    expect(direct.spec).toMatchObject({ block: "stat", dataset: "da", filters: { cpvTerm: "iluminat" } });
    expect(direct.sentence).toMatch(/^Care sunt cele mai mari achiziții directe pentru „iluminat”/);
  });
  it("answers the whole country with its total and a pointer to the sources list, never opened on it", async () => {
    const r = await read("cel mai scump contract atribuit direct anul trecut");
    expect([r.interpretation.intent, r.interpretation.leftover, r.spec?.block, r.sources]).toEqual(["total", [], "stat", undefined]);
    expect(r.sentence).toBe("Care sunt cele mai mari achiziții directe făcute de instituțiile publice din toată țara, în 2025?");
    expect(r.interpretation.notes).toContain(LARGEST_IN_SOURCES);
  });
  it("keeps the ranking when the total cannot carry a condition of the words («firme străine»)", async () => {
    const r = await read("cele mai mari contracte castigate de firme straine in romania");
    expect([r.interpretation.intent, r.interpretation.largest, r.spec?.block, r.sources]).toEqual(["ranking_suppliers", undefined, "table", undefined]);
    expect(r.spec?.filters).toMatchObject({ firmSeat: "abroad" });
    expect(r.interpretation.notes.join(" ")).not.toMatch(/nu se aplică/);
  });
  it("is not a count, an institution's superlative, a ranking of institutions or another question's shape", async () => {
    const most = await read("cine castiga cele mai multe contracte de iluminat");
    expect([most.interpretation.largest, most.spec?.block, most.spec?.measure]).toEqual([undefined, "table", "count"]);
    const holder = await read("primaria cu cele mai mari contracte pe iluminat in 2026");
    expect([holder.interpretation.largest, holder.interpretation.intent]).toEqual([undefined, "ranking_authorities"]);
    const trend = await read("cum au evoluat cele mai mari contracte de iluminat");
    expect([trend.interpretation.largest, trend.interpretation.intent, trend.sources]).toEqual([undefined, "trend", undefined]);
    // „care primărie are…”, „ce primărie dă cele mai mari contracte”: the institution asked about, as before
    for (const q of ["care primarie din judetul Buzau are cele mai mari contracte de iluminat", "ce primarie da cele mai mari contracte pe iluminat"]) {
      const one = await read(q);
      expect([q, one.interpretation.largest, one.interpretation.intent, one.spec?.block]).toEqual([q, undefined, "ranking_authorities", "entity_card"]);
    }
    // „ministerele” are a kind now (buyer-kinds.test.ts): the noun says who is ranked, as for the other kinds
    const ministries = await read("ministerele cu cele mai mari achizitii de iluminat in 2024");
    expect([ministries.interpretation.largest, ministries.interpretation.intent, ministries.interpretation.leftover, ministries.sources]).toEqual([undefined, "ranking_authorities", [], undefined]);
    // a noun the holders do not read leaves the largest records, the word said as not understood
    const unread = await read("fabricile cu cele mai mari achizitii de iluminat in 2024");
    expect([unread.interpretation.intent, unread.interpretation.leftover, unread.sources]).toEqual(["total", ["fabricile"], "largest"]);
    expect(LARGEST_RECORDS.test("cel mai mare spital din cluj")).toBe(false);
    expect(LARGEST_RECORDS.test("cele mai multe contracte")).toBe(false);
  });
  it("gives the answer's title and its drawer's the question asked, from the title of the total (owner, 23 November 2026)", async () => {
    // Întreabă (AskPanel heading) passes the total's title through largestSentence: it must begin as the reading does
    for (const q of ["cel mai mare contract de iluminat din 2024", "cea mai mare achizitie directa de iluminat din 2024", "cele mai mari contracte ale primariei buzau"]) {
      const r = await read(q);
      const title = questionTitle(r.spec!);
      expect([q, /^Cât valorează (achizițiile|contractele)/.test(title), largestSentence(title).startsWith("Care sunt cele mai mari ")]).toEqual([q, true, true]);
      expect(largestSentence(title).replace(/^Care sunt cele mai mari \S+/, "")).toBe(title.replace(/^Cât valorează \S+/, ""));
    }
    // any other title is left as it is
    expect(largestSentence("Ce cumpără primăria Buzău, în toți anii?")).toBe("Ce cumpără primăria Buzău, în toți anii?");
  });
});
