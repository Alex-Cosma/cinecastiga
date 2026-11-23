import { describe, expect, it } from "vitest";
import { memoryVocabulary } from "./memory-vocabulary";
import { ESTIMATE_NOTE, FRAMEWORK_NOTE, RulesInterpreter, SPLIT_NOTE, THRESHOLD_NOTE } from "./rules";
import { FIXTURE } from "./rules.fixture";
import { SINGLE_OFFER_NOTE, resultFor } from "./to-spec";

/*
 * Search probe, 23 November 2026 (a procurement officer's questions): the trade's terms were dropped or read as another
 * question, and its filler words („atribuite”, „semnate”, „contractante”, „pt”) left /cauta searching the literal text.
 */
const NOW = new Date("2026-11-23T12:00:00Z");
const interpreter = new RulesInterpreter(memoryVocabulary(FIXTURE));
const read = async (q: string) => {
  const i = await interpreter.interpret(q, { now: NOW });
  return { i, r: resultFor(i) };
};

describe("the trade's terms", () => {
  it("says a framework agreement or its call-offs cannot be chosen, and keeps the rest of the question", async () => {
    for (const q of ["contracte subsecvente din acord cadru vaccinuri", "acorduri-cadru vaccinuri", "contractele subsecvente vaccinuri"]) {
      const { i, r } = await read(q);
      expect([q, i.subjects.map((s) => s.term), i.leftover, i.notes]).toEqual([q, ["vaccinuri"], [], [FRAMEWORK_NOTE]]);
      expect(r.spec).toMatchObject({ block: "table", dim: "supplier" });
    }
    const alone = await read("acord-cadru");
    expect([alone.i.intent, alone.i.leftover, alone.i.notes]).toEqual([null, [], [FRAMEWORK_NOTE]]);
  });
  it("reads the split purchases as their signal, said to be a lead", async () => {
    for (const q of ["spitale cu achizitii directe fractionate", "spitale cu achizitii fragmentate", "spitale care au impartit achizitiile ca sa evite licitatia"]) {
      const { i, r } = await read(q);
      expect([q, i.intent, i.authorityKind?.kind, i.leftover, i.notes]).toEqual([q, "signals", "spital", [], [SPLIT_NOTE]]);
      expect(r.spec).toMatchObject({ block: "scatter", scatter: { flag: "da_split" }, filters: { authorityKind: "spital" } });
    }
  });
  it("says the estimated value is not compared, and reads «estimată vs atribuită» as no comparison of two institutions", async () => {
    const { i, r } = await read("valoarea estimata vs valoarea atribuita la licitatiile de asfaltare");
    expect([i.intent, i.dataset, i.subjects.map((s) => s.term), i.leftover, i.notes]).toEqual(["ranking_suppliers", "contracts", ["asfaltare"], [], [ESTIMATE_NOTE]]);
    expect(r.spec).toMatchObject({ block: "table", dim: "supplier" });
    expect((await read("economii fata de valoarea estimata la asfaltare")).i.notes).toEqual([ESTIMATE_NOTE]);
  });
  it("reads a sum after «pragul de» as the size, and says a legal threshold without a sum is no filter", async () => {
    const sum = await read("achizitii directe peste pragul de 270000 lei la scoli");
    expect([sum.i.dataset, sum.i.authorityKind?.kind, sum.i.leftover, sum.i.notes]).toEqual(["da", "scoala", [], []]);
    expect(sum.r.spec).toMatchObject({ block: "stat", filters: { purchaseValueMin: 270000, authorityKind: "scoala" } });
    for (const q of ["achizitii directe sub pragul de achizitie directa la scoli", "achizitii la scoli sub pragul legal", "scoli pragul valoric"]) {
      const { i } = await read(q);
      expect([q, i.authorityKind?.kind, i.supplier, i.leftover, i.notes]).toEqual([q, "scoala", null, [], [THRESHOLD_NOTE]]);
    }
    // the signals' own phrases keep their reading
    expect((await read("spitale cu achizitii directe peste prag")).r.spec).toMatchObject({ block: "scatter", scatter: { flag: "da_above_ceiling" } });
    expect((await read("spitale cu achizitii chiar sub plafon")).r.spec).toMatchObject({ block: "scatter", scatter: { flag: "da_round" } });
  });
  it("answers a size said on an institution's records with their total, which offers the size", async () => {
    const { i, r } = await read("achizitii directe peste 100000 lei la primaria din Ramnicu Sarat");
    expect([i.intent, i.notes]).toEqual(["total", []]);
    expect(r.spec).toMatchObject({ block: "stat", dataset: "da", filters: { purchaseValueMin: 100000 } });
  });
  it("reads the short form of the simplified procedure and keeps the single bidder's note", async () => {
    expect((await read("proc simplificata drumuri 2024")).r.spec).toMatchObject({ dataset: "contracts", filters: { procedure: "simplificata", yearFrom: 2024 } });
    const single = await read("proceduri simplificate cu ofertant unic la consilii judetene");
    expect([single.i.singleBidder, single.i.leftover]).toEqual([true, []]);
    expect(single.r.interpretation.notes).toContain(SINGLE_OFFER_NOTE);
  });
});

describe("the trade's filler words", () => {
  it("understands the participles and the short «pt»", async () => {
    for (const q of ["contracte de catering semnate in 2025", "contracte de catering atribuite in 2025", "contracte de catering incheiate in 2025", "top firme catering pt spitale"]) {
      const { i } = await read(q);
      expect([q, i.subjects.map((s) => s.term), i.leftover]).toEqual([q, ["catering"], []]);
    }
  });
  it("reads «autorități contractante» and «instituții cumpărătoare» as the institutions, «operatori economici» and «ofertanți» as the firms", async () => {
    for (const q of ["top 20 autoritati contractante judetul Buzau dupa valoare 2024", "cele mai mari institutii cumparatoare din judetul Buzau", "entitati contractante iluminat judetul Buzau"]) {
      const { i, r } = await read(q);
      expect([q, i.intent, i.leftover]).toEqual([q, "ranking_authorities", []]);
      expect(r.spec).toMatchObject({ block: "table", dim: "authority", filters: { county: "Buzău" } });
    }
    for (const q of ["operatori economici cu cele mai multe contracte la spitale", "operatorii economici care castiga la spitale", "ofertanti castigatori asfaltare judetul Buzau 2023"]) {
      const { i, r } = await read(q);
      expect([q, i.intent, i.leftover]).toEqual([q, "ranking_suppliers", []]);
      expect(r.spec).toMatchObject({ block: "table", dim: "supplier" });
    }
  });
});
