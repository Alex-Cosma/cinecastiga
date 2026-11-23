import { describe, expect, it } from "vitest";
import { memoryVocabulary } from "./memory-vocabulary";
import { COUNTIES_SINGLE_OFFER_NOTE, RulesInterpreter, countiesNotCompared } from "./rules";
import { FIXTURE } from "./rules.fixture";
import { resultFor } from "./to-spec";

/*
 * Search probe, 23 November 2026: „care județ…” looked „judet” up as a firm's name (1.234 matches), „pe județe” and
 * „clasament județe” answered with the national total or a ranking of firms. The counties compared are the map
 * (the engine's block for values by county); what the map cannot compare is said, never read as another question.
 */
const NOW = new Date("2026-10-22T12:00:00Z");
const interpreter = new RulesInterpreter(memoryVocabulary(FIXTURE));
const read = async (q: string) => {
  const i = await interpreter.interpret(q, { now: NOW });
  const r = resultFor(i);
  return { i, r, spec: r.spec, notes: r.interpretation.notes };
};

describe("the counties compared", () => {
  it("answers on the map, with the subject, the period and the stream the words name", async () => {
    for (const q of ["cat s-a cheltuit pe iluminat pe judete in 2025", "top judete iluminat 2025", "in ce judet se cumpara cel mai mult iluminat in 2025", "iluminat 2025 pe fiecare judet"]) {
      const { i, r, spec } = await read(q);
      expect([q, i.intent, i.leftover, r.problem]).toEqual([q, "counties", [], null]);
      expect(spec).toEqual({ block: "map", measure: "value", filters: { cpvTerm: "iluminat", yearFrom: 2025, yearTo: 2025 } });
      expect(r.sentence).toBe("Cum se împart achizițiile pentru „iluminat” făcute de instituțiile publice pe județe, în 2025?");
    }
    const kind = await read("spitalele pe judete medicamente");
    expect(kind.spec).toEqual({ block: "map", measure: "value", filters: { cpvTerm: "medicamente", authorityKind: "spital" } });
  });
  it("counts the records where the number is asked", async () => {
    for (const q of ["numarul de achizitii directe pe fiecare judet", "cate achizitii directe pe judete", "clasament judete dupa numarul de achizitii directe"]) {
      const { i, r, spec } = await read(q);
      expect([q, i.intent, i.leftover]).toEqual([q, "counties", []]);
      expect(spec).toEqual({ block: "map", measure: "count", filters: {}, dataset: "da" });
      expect(r.sentence).toBe("Cum se împart pe județe înregistrările achizițiilor directe făcute de instituțiile publice, în toți anii?");
    }
    // without the counties the count is the total's, as before
    expect((await read("numarul de achizitii directe in 2025")).spec).toMatchObject({ block: "stat", measure: "count", dataset: "da" });
  });
  it("compares per inhabitant only the town halls and county councils, and says so", async () => {
    const { i, r, spec, notes } = await read("care judet a cheltuit cel mai mult pe cap de locuitor in 2024");
    expect([i.intent, i.leftover, i.entityAlternatives, r.problem]).toEqual(["counties", [], [], null]);
    expect(spec).toEqual({ block: "map", measure: "value_per_capita", filters: { authorityKind: "local_admin", yearFrom: 2024, yearTo: 2024 } });
    expect(r.sentence).toBe("Cât revine pe locuitor din achizițiile făcute de primăriile și consiliile județene, pe județe, în 2024?");
    expect(notes).toContain("Pe locuitor, harta compară primăriile și consiliile județene din fiecare județ, nu toate instituțiile.");
    // another kind of institution has no per-inhabitant map: the value, said
    const hospitals = await read("spitalele pe judete pe locuitor");
    expect(hospitals.spec).toEqual({ block: "map", measure: "value", filters: { authorityKind: "spital" } });
    expect(hospitals.notes).toContain("Valoarea pe locuitor pe județe se calculează doar pentru primării și consilii județene, pe toată țara; harta arată valoarea totală.");
  });
  it("reads «după valoare» and says the map shows every county when the smallest are asked", async () => {
    const ranked = await read("clasament judete dupa valoarea achizitiilor 2024");
    expect([ranked.i.intent, ranked.i.leftover]).toEqual(["counties", []]);
    expect(ranked.spec).toEqual({ block: "map", measure: "value", filters: { yearFrom: 2024, yearTo: 2024 } });
    const smallest = await read("judetele cu cea mai mica valoare a achizitiilor in 2023");
    expect([smallest.i.intent, smallest.i.leftover]).toEqual(["counties", []]);
    expect(smallest.notes).toContain("„cea mai mica”: harta arată toate județele, nu doar pe cele cu valorile cele mai mici.");
  });
  it("says what the counties cannot be compared on yet, and keeps the question asked", async () => {
    const risk = await read("care judet are cele mai multe semnale de risc");
    expect([risk.i.intent, risk.spec?.block, risk.i.entityAlternatives]).toEqual(["signals", "scatter", []]);
    expect(risk.notes).toContain(countiesNotCompared("care judet"));
    const trend = await read("cum au evoluat cheltuielile pe judete");
    expect([trend.i.intent, trend.spec?.block]).toEqual(["trend", "timeseries"]);
    expect(trend.notes).toContain(countiesNotCompared("pe judete"));
    const share = await read("licitatii cu un singur ofertant in 2024 pe judete");
    expect(share.spec).toEqual({ block: "map", measure: "value", filters: { yearFrom: 2024, yearTo: 2024 }, dataset: "contracts" });
    expect(share.notes).toContain(COUNTIES_SINGLE_OFFER_NOTE);
  });
  it("never looks the bare word up as a name, and leaves a named county a place", async () => {
    for (const q of ["achizitii judet 2024", "ce cumpara judetul in 2024", "iluminat judete"]) {
      const { i } = await read(q);
      expect([q, i.entityAlternatives, i.authority, i.supplier, i.leftover]).toEqual([q, [], null, null, []]);
    }
    // the firm's seat keeps its words (lens-phrases.ts)
    const seat = await read("firme din alte judete care castiga in buzau");
    expect([seat.i.intent, seat.i.byCounty, seat.spec?.filters]).toEqual(["ranking_suppliers", undefined, { county: "Buzău", firmSeat: "other" }]);
    const place = await read("iluminat in judetul Buzau");
    expect([place.i.intent, place.i.place?.kind, place.i.byCounty, place.spec?.block]).toEqual(["ranking_suppliers", "county", undefined, "table"]);
    expect((await read("ce cumpara judetul Cluj")).spec).toMatchObject({ block: "breakdown", filters: { county: "Cluj" } });
  });
});
