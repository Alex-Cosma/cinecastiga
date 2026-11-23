import { describe, expect, it } from "vitest";
import { applyInterpretation } from "../topic-search/interpretation";
import { parseTopicScope } from "../topic-search/shared";
import { memoryVocabulary } from "./memory-vocabulary";
import { COUNT_FIRMS_NOTE, RulesInterpreter, unitPriceNote } from "./rules";
import { FIXTURE } from "./rules.fixture";
import { COUNT_UNUSED_NOTE, PER_CAPITA_UNUSED_NOTE, SHARE_IN_RANKING_NOTE, SHARE_UNKNOWN_NOTE, resultFor, shareOfStreamNote } from "./to-spec";

/*
 * Search probe, 23 November 2026, family 2: the measure asked (a count, a total, a share, a price per unit, a value per
 * inhabitant) was replaced by the default answer without a word. It is read into the answer that shows it, or said.
 */
const NOW = new Date("2026-10-22T12:00:00Z");
const interpreter = new RulesInterpreter(memoryVocabulary({ ...FIXTURE, priceProducts: [{ slug: "motorina", label: "Motorină", include: /^motorin/ }] }));
const read = async (q: string) => {
  const i = await interpreter.interpret(q, { now: NOW });
  const r = resultFor(i);
  return { i, r, spec: r.spec!, notes: r.interpretation.notes };
};

describe("a count asked", () => {
  it("is the selection's total by count, not what the institution buys or a ranking of firms", async () => {
    const hall = await read("cate contracte a dat primaria buzau in 2025");
    expect(hall.spec).toMatchObject({ block: "stat", measure: "count", filters: { yearFrom: 2025, yearTo: 2025 } });
    expect(hall.r.sentence).toBe("Câte achiziții au fost făcute de primăria Buzău, în 2025?");
    const subject = await read("cate contracte de iluminat au fost in 2024 in judetul buzau");
    expect(subject.spec).toMatchObject({ block: "stat", measure: "count", filters: { county: "Buzău" } });
    expect((await read("numarul de achizitii directe ale primariei buzau in 2024")).spec).toMatchObject({ block: "stat", measure: "count", dataset: "da" });
  });
  it("keeps the shape another cue asks, by count", async () => {
    expect((await read("de câte ori au câștigat firmele contracte în județul Cluj în 2025")).spec).toMatchObject({ block: "table", dim: "supplier", measure: "count" });
    expect((await read("a crescut numarul de achizitii directe la scoli dupa 2022")).spec).toMatchObject({ block: "timeseries", measure: "count" });
  });
  it("answers «câte firme» with their ranking, whose total line counts them", async () => {
    const { i, spec, notes } = await read("cate firme au lucrat cu primaria din buzau");
    expect([i.intent, spec.block, spec.dim, spec.measure]).toEqual(["ranking_suppliers", "table", "supplier", "value"]);
    expect(notes).toContain(COUNT_FIRMS_NOTE);
  });
  it("says a count the breakdown does not show", async () => {
    const { spec, notes } = await read("pe ce domenii sunt cele mai multe contracte la primaria buzau");
    expect(spec.block).toBe("breakdown");
    expect(notes).toContain(COUNT_UNUSED_NOTE);
  });
});

describe("a total asked in other words", () => {
  it("reads «market size», «mărimea pieței», «suma totală» as the total", async () => {
    for (const q of ["market size mobilier 2024", "marimea pietei de mobilier in 2024", "suma totala mobilier 2024", "cat inseamna mobilierul in 2024"]) {
      const { i, spec } = await read(q);
      expect([q, i.intent, spec.block, i.leftover]).toEqual([q, "total", "stat", []]);
    }
  });
});

describe("a share asked", () => {
  it("of a stream is the total of both streams, with where the split is", async () => {
    const { i, spec, notes, r } = await read("ce procent din achizitiile primariilor sunt achizitii directe");
    expect([i.intent, spec.block, spec.dataset, spec.filters.authorityKind, i.leftover]).toEqual(["total", "stat", undefined, "primarie", []]);
    expect(r.sentence).toBe("Cât valorează achizițiile făcute de primăriile din toată țara, în toți anii?");
    expect(notes).toEqual([shareOfStreamNote("da")]);
    expect((await read("ponderea achizitiilor directe in total")).notes).toEqual([shareOfStreamNote("da")]);
  });
  it("of the rows of a ranking is its «% din total» column; elsewhere it is said, never another answer in silence", async () => {
    const ranking = await read("ce pondere au firmele la primaria buzau");
    expect([ranking.spec.block, ranking.spec.dim]).toEqual(["table", "supplier"]);
    expect(ranking.notes).toContain(SHARE_IN_RANKING_NOTE);
    const other = await read("ce procent din cheltuielile primariei buzau merge pe iluminat");
    expect(other.spec.block).toBe("stat");
    expect(other.notes).toContain(SHARE_UNKNOWN_NOTE);
  });
});

describe("a price per unit asked", () => {
  it("names the product /preturi compares and links it on /cauta; the answer stays a value, said", async () => {
    for (const q of ["pret unitar motorina achizitii directe", "cat plateste un spital pe litru de motorina", "cat costa un litru de motorina"]) {
      const { i, spec, notes } = await read(q);
      expect([q, i.intent, spec.block, i.unitPrice?.product?.slug, notes]).toEqual([q, "total", "stat", "motorina", [unitPriceNote("Motorină")]]);
    }
    const scope = parseTopicScope(new URLSearchParams("q=pret unitar motorina"));
    const t = applyInterpretation(scope, (await read("pret unitar motorina")).r);
    expect([t.priceHref, t.notes]).toEqual(["/preturi/motorina", [unitPriceNote("Motorină")]]);
  });
  it("says where the unit prices are when the product is not one of them, and never ranks firms for a price", async () => {
    const { i, spec, notes } = await read("pretul mediu al unui laptop cumparat de scoli");
    expect([i.intent, spec.block, spec.filters.authorityKind, i.unitPrice?.product, i.leftover]).toEqual(["total", "stat", "scoala", undefined, []]);
    expect(notes).toEqual([unitPriceNote(null)]);
    const t = applyInterpretation(parseTopicScope(new URLSearchParams("q=pret laptop scoli")), (await read("pret laptop scoli")).r);
    expect(t.priceHref).toBe("/preturi");
    // an evolution asked keeps its shape; the note says it is the value
    const trend = await read("evolutia pretului la motorina");
    expect([trend.spec.block, trend.notes]).toEqual(["timeseries", [unitPriceNote("Motorină")]]);
  });
});

describe("a value per inhabitant asked", () => {
  it("ranks the town halls alone for «primăriile… pe locuitor» and the towns for «care oraș»", async () => {
    const halls = await read("primariile cu cele mai mari cheltuieli pe locuitor");
    expect(halls.spec).toMatchObject({ block: "table", dim: "authority", measure: "value_per_capita", filters: { authorityKind: "primarie" } });
    for (const q of ["ce oras cheltuie cel mai mult pe locuitor", "care oras cheltuie cel mai mult pe cap de locuitor"]) {
      const { i, spec } = await read(q);
      expect([q, i.intent, i.leftover]).toEqual([q, "ranking_authorities", []]);
      expect(spec).toMatchObject({ block: "table", dim: "authority", measure: "value_per_capita", filters: { authorityKind: "oras_municipiu" } });
    }
    expect((await read("care comuna cheltuie cel mai mult pe iluminat")).spec).toMatchObject({ block: "entity_card", filters: { authorityKind: "comuna" } });
  });
  it("is said where the answer is a total", async () => {
    const { spec, notes } = await read("cat s-a cheltuit pe locuitor in judetul buzau in 2024");
    expect([spec.block, spec.measure]).toEqual(["stat", "value"]);
    expect(notes).toEqual([PER_CAPITA_UNUSED_NOTE]);
  });
});
