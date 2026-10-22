import { describe, expect, it } from "vitest";
import { validateSpec } from "../ask/spec";
import { memoryVocabulary } from "./memory-vocabulary";
import { buildPlaces, catalogUatSource, countyDisplay, placeKey } from "./places";
import { RulesInterpreter, strongNameMatch } from "./rules";
import { FIXTURE } from "./rules.fixture";
import { stems, tokenize, wordMatches } from "./text";
import { countOf, resultFor, sentenceFor } from "./to-spec";

const NOW = new Date("2026-10-22T12:00:00Z");
const interpreter = new RulesInterpreter(memoryVocabulary(FIXTURE));
async function ask(q: string) {
  const i = await interpreter.interpret(q, { now: NOW });
  return { i, r: resultFor(i) };
}

describe("text helpers", () => {
  it("folds both diacritic orthographies and splits hyphens", () => {
    expect(tokenize("Cât a costat Râmnicu-Sărat? Ş/ș, Ţ/ț").map((t) => t.f)).toEqual(["cat", "a", "costat", "ramnicu", "sarat", "s", "s", "t", "t"]);
  });
  it("derives base forms of inflected nouns", () => {
    expect(stems("iluminatul")).toContain("iluminat");
    expect(stems("medicamentele")).toContain("medicamente");
    expect(stems("deszapezirea")).toContain("deszapezire");
    expect(stems("lemne")).toContain("lemn");
  });
  it("matches inflections and light typos, never short-word typos", () => {
    expect(wordMatches("iluminatul", "iluminat")).toBe(true);
    expect(wordMatches("medicamnte", "medicamente")).toBe(true);
    expect(wordMatches("festiv", "festivaluri")).toBe(false);
    expect(wordMatches("cluj", "gorj")).toBe(false);
  });
  it("writes Romanian counts with «de» from 20 on", () => {
    expect(countOf(4, "angajați")).toBe("4 angajați");
    expect(countOf(49, "angajați")).toBe("49 de angajați");
    expect(countOf(101, "angajați")).toBe("101 angajați");
  });
  it("matches registry names strongly only when the typed words carry the name", () => {
    expect(strongNameMatch(["spitalul", "judetean", "buzau"], "SPITALUL JUDETEAN DE URGENTA BUZAU")).toBe(true);
    expect(strongNameMatch(["primaria", "buzau"], "MUNICIPIUL BUZAU")).toBe(true);
    expect(strongNameMatch(["erbasu"], "S.C. ERBASU EDIL CONSTRUCT S.A.")).toBe(false);
  });
});

describe("gazetteer", () => {
  const places = buildPlaces(catalogUatSource());
  it("holds every county, locality and București sector with diacritics", () => {
    expect(places.filter((p) => p.kind === "county")).toHaveLength(42);
    expect(places.find((p) => p.siruta === 44818)).toMatchObject({ name: "Municipiul Buzău", county: "Buzău", tip: "municipiu", key: "buzau" });
    expect(places.find((p) => p.siruta === 94330)).toMatchObject({ name: "Comuna Sălcioara", label: "Comuna Sălcioara (Ialomița)" });
    expect(places.filter((p) => p.tip === "sector")).toHaveLength(6);
  });
  it("normalizes county and legacy spellings", () => {
    expect(countyDisplay("caras severin")).toBe("Caraș-Severin");
    expect(countyDisplay("MUNICIPIUL BUCURESTI")).toBe("București");
    expect(placeKey("Rîmnicu Sărat")).toBe("ramnicu sarat");
    expect(placeKey("Tîrgu-Mureș")).toBe("targu mures");
  });
});

describe("beginner phrasings → interpretation", () => {
  it("1. «cine face iluminatul în buzău și cât costă»: suppliers, subject, county with the city as alternative", async () => {
    const { i, r } = await ask("cine face iluminatul în buzău și cât costă");
    expect(i.intent).toBe("ranking_suppliers");
    expect(i.otherIntents).toContain("total");
    expect(i.subjects[0]).toMatchObject({ term: "iluminat", source: "synonym" });
    expect(i.place).toMatchObject({ kind: "county", county: "Buzău" });
    expect(i.placeAlternatives[0]).toMatchObject({ kind: "locality", siruta: 44818 });
    expect(i.leftover).toEqual([]);
    expect(i.placeNote).toMatch(/Am ales județul/);
    expect(r.spec).toEqual({ block: "table", dim: "supplier", measure: "value", topN: 10, filters: { cpvTerm: "iluminat", county: "Buzău" } });
    expect(r.sentence).toBe("Cine câștigă contractele pentru „iluminat” de la instituțiile din județul Buzău, în toți anii?");
    expect(r.alternatives.map((a) => a.label)).toEqual(["Doar primăria Municipiului Buzău", "Cât valorează în total", "Cum s-a schimbat de la an la an"]);
    expect(r.alternatives[0]!.spec.filters).toMatchObject({ uatSiruta: 44818, cpvTerm: "iluminat" });
    expect(r.alternatives[0]!.spec.filters.county).toBeUndefined();
  });

  it("2. «pe ce cheltuie primăria din Râmnicu Sărat»: breakdown of the town hall", async () => {
    const { i, r } = await ask("pe ce cheltuie primăria din Râmnicu Sărat");
    expect(i.intent).toBe("breakdown");
    expect(i.place).toMatchObject({ kind: "locality", siruta: 44845, tip: "municipiu" });
    expect(r.spec).toEqual({ block: "breakdown", measure: "value", filters: { uatSiruta: 44845, uatName: "Municipiul Râmnicu Sărat (Buzău)" } });
    expect(r.sentence).toBe("Ce cumpără primăria Municipiului Râmnicu Sărat (Buzău), în toți anii?");
  });

  it("3. «laptopuri pentru școli»: subject + kind, no place", async () => {
    const { i, r } = await ask("laptopuri pentru școli");
    expect(i.subjects[0]?.term).toBe("laptopuri");
    expect(i.authorityKind?.kind).toBe("scoala");
    expect(i.intentSource).toBe("default");
    expect(r.spec?.filters).toEqual({ cpvTerm: "laptopuri", authorityKind: "scoala" });
    expect(r.sentence).toContain("de la școlile din toată țara");
  });

  it("4. «firme de asfalt din buzău»: the curated synonym wins over the bitumen label", async () => {
    const { i, r } = await ask("firme de asfalt din buzău");
    expect(i.intent).toBe("ranking_suppliers");
    expect(i.subjects[0]?.term).toBe("asfalt");
    expect(r.spec?.filters).toEqual({ cpvTerm: "asfalt", county: "Buzău" });
  });

  it("5. «Sălcioara» alone: two localities, no guess", async () => {
    const { i, r } = await ask("Sălcioara");
    expect(i.placeAmbiguous).toBe(true);
    expect(i.place).toBeNull();
    expect(r.spec).toBeNull();
    expect(r.problem).toMatch(/Alege localitatea/);
    expect(r.alternatives.map((a) => a.label).sort()).toEqual(["Comuna Sălcioara (Dâmbovița)", "Comuna Sălcioara (Ialomița)"]);
    expect(i.placeNote).toBe("Există 2 localități cu numele „Sălcioara”, în Dâmbovița și Ialomița.");
    expect(r.alternatives.every((a) => a.spec.block === "breakdown" && a.spec.filters.uatSiruta)).toBe(true);
  });

  it("6. «salcioara ialomita»: the county disambiguates", async () => {
    const { i } = await ask("cine face iluminatul in salcioara ialomita");
    expect(i.place).toMatchObject({ siruta: 94330 });
    expect(i.placeAmbiguous).toBe(false);
  });

  it("7. «Sălcioara din județul Dâmbovița»", async () => {
    const { i } = await ask("ce cumpără Sălcioara din județul Dâmbovița");
    expect(i.place).toMatchObject({ siruta: 68789, county: "Dâmbovița" });
  });

  it("8. «primăria Buzău» → Municipiul Buzău, not the county", async () => {
    const { i, r } = await ask("primăria Buzău");
    expect(i.place).toMatchObject({ kind: "locality", siruta: 44818 });
    expect(r.spec?.block).toBe("breakdown");
  });

  it("9. «județul Buzău» → the county, no city alternative", async () => {
    const { i } = await ask("judetul buzau");
    expect(i.place).toMatchObject({ kind: "county", county: "Buzău" });
    expect(i.placeAlternatives).toEqual([]);
  });

  it("10. «municipiul buzău» → the city", async () => {
    const { i } = await ask("cât a costat deszăpezirea anul trecut în municipiul buzău");
    expect(i.place?.siruta).toBe(44818);
    expect(i.period).toMatchObject({ yearFrom: 2025, yearTo: 2025 });
    expect(i.subjects[0]).toMatchObject({ term: "90620000-9", label: "Servicii de deszăpezire", source: "catalog" });
  });

  it("11. no diacritics, all caps, «anul trecut» relative to today", async () => {
    const { i, r } = await ask("CINE A CASTIGAT LICITATIILE DE DRUMURI DIN PRAHOVA ANUL TRECUT");
    expect(i.intent).toBe("ranking_suppliers");
    expect(i.dataset).toBe("contracts");
    expect(i.subjects[0]?.term).toBe("drumuri");
    expect(i.place?.county).toBe("Prahova");
    expect(r.spec).toMatchObject({ dataset: "contracts", filters: { yearFrom: 2025, yearTo: 2025 } });
  });

  it("12. «din 2021 până în 2023» range + kind + total", async () => {
    const { i, r } = await ask("cat au costat medicamentele spitalelor din cluj din 2021 pana in 2023");
    expect(i.intent).toBe("total");
    expect(i.period).toMatchObject({ yearFrom: 2021, yearTo: 2023 });
    expect(r.spec).toEqual({ block: "stat", measure: "value", filters: { cpvTerm: "medicamente", county: "Cluj", authorityKind: "spital", yearFrom: 2021, yearTo: 2023 } });
    expect(r.sentence).toBe("Cât valorează achizițiile pentru „medicamente” făcute de spitalele din județul Cluj, între 2021 și 2023?");
  });

  it("13. «în 2024» single year", async () => {
    const { i } = await ask("cine castiga deszapezirea in 2024");
    expect(i.period).toMatchObject({ yearFrom: 2024, yearTo: 2024 });
  });

  it("14. «2019-2021» written with a hyphen", async () => {
    const { i } = await ask("peleti pentru scoli 2019-2021");
    expect(i.period).toMatchObject({ yearFrom: 2019, yearTo: 2021 });
    expect(i.subjects[0]?.term).toBe("peleti");
  });

  it("15. «din 2022» open-ended and «până în 2020»", async () => {
    expect((await ask("asfaltare in prahova din 2022")).i.period).toMatchObject({ yearFrom: 2022 });
    expect((await ask("asfaltare in prahova pana in 2020")).i.period).toMatchObject({ yearTo: 2020 });
  });

  it("16. «ultimii 3 ani» counts the current year", async () => {
    const { i, r } = await ask("top 5 firme de paza din iasi in ultimii 3 ani");
    expect(i.period).toMatchObject({ yearFrom: 2024, yearTo: 2026 });
    expect(i.topN).toBe(5);
    expect(r.spec?.topN).toBe(5);
  });

  it("17. «anul acesta»", async () => {
    expect((await ask("cat s-a dat pe curatenie anul acesta")).i.period).toMatchObject({ yearFrom: 2026, yearTo: 2026 });
  });

  it("18. a typo in the subject («medicamnte»)", async () => {
    const { i } = await ask("medicamnte spitale iasi");
    expect(i.subjects[0]?.term).toBe("medicamente");
    expect(i.authorityKind?.kind).toBe("spital");
    expect(i.place?.county).toBe("Iași");
  });

  it("19. inflected subject with a typo («iluminatu public»)", async () => {
    const { i } = await ask("iluminatu public buzau 2023");
    expect(i.subjects[0]?.term).toBe("iluminat");
    expect(i.period?.yearFrom).toBe(2023);
  });

  it("20. a multi-word subject («lemne de foc») + trend + kind", async () => {
    const { i, r } = await ask("cum au evoluat achizitiile de lemne de foc ale comunelor din vaslui");
    expect(i.intent).toBe("trend");
    expect(i.subjects).toHaveLength(1);
    expect(i.subjects[0]?.term).toBe("lemn de foc");
    expect(i.authorityKind?.kind).toBe("comuna");
    expect(i.placeAlternatives).toEqual([]);
    expect(r.spec?.block).toBe("timeseries");
  });

  it("21. a word we do not know is reported, not dropped («festiv»)", async () => {
    const { i, r } = await ask("iluminat festiv in buzau");
    expect(i.subjects[0]?.term).toBe("iluminat");
    expect(i.leftover).toEqual(["festiv"]);
    expect(i.supplier).toBeNull(); // the firm "ILUMINAT FESTIV S.R.L." is not what a person means here
    expect(i.confidenceLabel).not.toBe("high");
    expect(r.spec).not.toBeNull();
  });

  it("22. «iluminat de crăciun»: second subject named, first one used", async () => {
    const { i, r } = await ask("ce firme au luat contracte de iluminat de craciun in buzau");
    expect(i.subjects.map((s) => s.term)).toEqual(["iluminat", "39298910-9"]);
    expect(r.spec?.filters.cpvTerm).toBe("iluminat");
    expect(r.interpretation.notes.join(" ")).toMatch(/primul domeniu/);
    expect(i.supplier).toBeNull();
  });

  it("23. nothing understood: no spec, a plain explanation", async () => {
    const { i, r } = await ask("bla bla");
    expect(i.intent).toBeNull();
    expect(r.spec).toBeNull();
    expect(r.problem).toMatch(/Nu am recunoscut/);
    expect(i.leftover).toEqual(["bla"]);
    expect(i.confidenceLabel).toBe("none");
  });

  it("24. only filler words", async () => {
    const { i, r } = await ask("vreau sa stiu despre bani");
    expect(r.spec).toBeNull();
    expect(i.leftover).toEqual([]);
  });

  it("25. a named hospital (strong registry match)", async () => {
    const { i, r } = await ask("Spitalul Judetean de Urgenta Buzau");
    expect(i.authority).toMatchObject({ id: 2144002, name: "SPITALUL JUDETEAN DE URGENTA BUZAU" });
    expect(i.place).toBeNull();
    expect(r.spec).toEqual({ block: "breakdown", measure: "value", filters: { authorityName: "SPITALUL JUDETEAN DE URGENTA BUZAU", authorityId: 2144002 } });
  });

  it("26. «spitalul din buzău» without a name → hospitals of the county", async () => {
    const { i } = await ask("ce cumpara spitalul din buzau");
    expect(i.authority).toBeNull();
    expect(i.authorityKind?.kind).toBe("spital");
    expect(i.place?.county).toBe("Buzău");
  });

  it("27. a firm by a distinctive word («erbașu»): institutions that buy from it", async () => {
    const { i, r } = await ask("cu cine lucreaza erbasu");
    expect(i.supplier).toMatchObject({ id: 9000001 });
    expect(r.spec).toMatchObject({ block: "table", dim: "authority", filters: { supplierId: 9000001 } });
  });

  it("27b. a firm whose name starts with a subject word («constructii erbasu»)", async () => {
    const { i, r } = await ask("cu cine lucreaza constructii erbasu");
    expect(i.subjects).toEqual([]);
    expect(i.supplier).toMatchObject({ id: 9000001 });
    expect(r.spec).toMatchObject({ block: "table", dim: "authority", filters: { supplierId: 9000001 } });
  });

  it("28. «firma Strabag»: two registered firms carry the name, so we ask which", async () => {
    const { i, r } = await ask("ce contracte are firma strabag in 2023");
    expect(i.supplier).toBeNull();
    expect(i.period?.yearFrom).toBe(2023);
    expect(r.spec).toBeNull();
    expect(r.problem).toMatch(/Alege-o/);
    expect(r.alternatives.map((a) => a.label)).toEqual(["STRABAG SRL (Bucuresti)", "SC STRABAG SRL"]);
    expect(r.alternatives[0]!.spec).toMatchObject({ block: "table", dim: "authority", filters: { supplierId: 9000004, yearFrom: 2023 } });
  });

  it("28b. a unique firm marker resolves directly", async () => {
    const { i } = await ask("ce contracte are firma elbi energy projects");
    expect(i.supplier).toMatchObject({ id: 9000003 });
  });

  it("29. compare two hospitals", async () => {
    const { i, r } = await ask("compara spitalul judetean de urgenta buzau cu spitalul judetean de urgenta braila");
    expect(i.intent).toBe("compare");
    expect(r.spec).toMatchObject({ block: "compare", comparisonMode: "transactions", filters: { authorityId: 2144002, compareWithId: 3000002 } });
  });

  it("30. compare two town halls («primăria X cu primăria Y»)", async () => {
    const { r } = await ask("compară primăria Buzău cu primăria Brăila");
    expect(r.spec).toMatchObject({ block: "compare", filters: { authorityId: 2144364, compareWithId: 3000001 } });
  });

  it("31. compare two firms with a year", async () => {
    const { r } = await ask("compara erbasu cu elbi energy projects in 2024");
    expect(r.spec).toMatchObject({ block: "compare", filters: { supplierId: 9000001, compareWithId: 9000003, yearFrom: 2024, yearTo: 2024 } });
    expect(r.sentence).toBe("Cum se compară contractele câștigate de „CONSTRUCTII ERBASU S.A.” cu cele câștigate de „ELBI ENERGY PROJECTS SRL”, în 2024?");
  });

  it("32. compare without a second name explains what is needed", async () => {
    const { i } = await ask("compara buzau");
    expect(i.intent).not.toBe("compare");
    expect(i.notes.join(" ")).toMatch(/două instituții sau două firme/);
  });

  it("33. signals for a county → outliers among institutions, a lead not proof", async () => {
    const { i, r } = await ask("ce instituții din județul Buzău au cele mai multe semnale");
    expect(i.intent).toBe("signals");
    expect(r.spec).toEqual({ block: "scatter", dim: "authority", measure: "value", filters: { county: "Buzău" } });
  });

  it("34. signals with a subject and a year drop them, and say so", async () => {
    const { r } = await ask("ce e suspect la asfaltarea din prahova in 2024");
    expect(r.spec).toMatchObject({ block: "scatter", filters: { county: "Prahova" } });
    expect(r.spec?.filters.cpvTerm).toBeUndefined();
    expect(r.interpretation.notes.join(" ")).toMatch(/nu am aplicat domeniul, perioada/);
  });

  it("35. «care spital are cel mai ridicat indice de risc» → one superlative profile", async () => {
    const { r } = await ask("care spital are cel mai ridicat indice de risc");
    expect(r.spec).toEqual({ block: "entity_card", dim: "authority", rankBy: "risk", measure: "value", filters: { authorityKind: "spital" } });
    expect(r.sentence).toBe("Care spital are cel mai ridicat indice de risc?");
  });

  it("36. «e ceva suspect la Spitalul…» → where the hospital sits on the risk index", async () => {
    const { r } = await ask("e ceva suspect la Spitalul Judetean de Urgenta Buzau?");
    expect(r.spec).toMatchObject({ block: "distribution", filters: { authorityId: 2144002 } });
  });

  it("37. «semnale la primăria Buzău» → the town hall's own profile", async () => {
    const { r } = await ask("semnale la primaria buzau");
    expect(r.spec).toMatchObject({ block: "distribution", filters: { authorityId: 2144364 } });
  });

  it("38. «care firmă a câștigat cel mai mult» → the top firm by value", async () => {
    const { r } = await ask("care firma a castigat cel mai mult in judetul buzau");
    expect(r.spec).toEqual({ block: "entity_card", dim: "supplier", rankBy: "value", measure: "value", filters: { county: "Buzău" } });
  });

  it("39. per inhabitant ranking of institutions", async () => {
    const { i, r } = await ask("ce instituții cumpără cele mai multe medicamente pe locuitor");
    expect(i.leftover).toEqual([]);
    expect(r.spec).toMatchObject({ block: "table", dim: "authority", measure: "value_per_capita", filters: { cpvTerm: "medicamente" } });
  });

  it("40. change between two years per firm", async () => {
    const { r } = await ask("cum s-au schimbat achizițiile firmelor între 2022 și 2024");
    expect(r.spec).toMatchObject({ block: "trend", dim: "supplier", filters: { yearFrom: 2022, yearTo: 2024 } });
  });

  it("41. single bidder implies procedures", async () => {
    const { r } = await ask("contracte cu un singur ofertant in judetul vaslui");
    expect(r.spec).toMatchObject({ dataset: "contracts", filters: { singleBidder: true, county: "Vaslui" } });
  });

  it("42. direct acquisitions + count + commune + year", async () => {
    const { r } = await ask("câte achiziții directe a făcut primăria comunei Sălcioara din Ialomița în 2025");
    expect(r.spec).toEqual({ block: "stat", dataset: "da", measure: "count", filters: { uatSiruta: 94330, uatName: "Comuna Sălcioara (Ialomița)", yearFrom: 2025, yearTo: 2025 } });
  });

  it("43. «primăria sectorului 3»", async () => {
    const { i, r } = await ask("cat a cheltuit primaria sectorului 3 pe curățenie");
    expect(i.place).toMatchObject({ tip: "sector", county: "București" });
    expect(i.leftover).toEqual([]);
    expect(r.sentence).toBe("Cât valorează achizițiile pentru „curățenie” făcute de primăria Sectorului 3 (București), în toți anii?");
  });

  it("44. «București» → the whole city, town hall as an alternative", async () => {
    const { i } = await ask("bucuresti");
    expect(i.place).toMatchObject({ kind: "county", county: "București" });
    expect(i.placeAlternatives[0]).toMatchObject({ siruta: 179132 });
  });

  it("45. two-word county («satu mare») and a repair verb", async () => {
    const { i } = await ask("cine repara drumurile din satu mare");
    expect(i.place?.county).toBe("Satu Mare");
    expect(i.subjects[0]?.term).toBe("drumuri");
  });

  it("46. a town that is not a county seat, unmarked («campina»)", async () => {
    const { i, r } = await ask("achizitii directe de mobilier ale primariei campina");
    expect(i.place).toMatchObject({ kind: "locality", county: "Prahova", tip: "municipiu" });
    expect(r.spec?.dataset).toBe("da");
  });

  it("47. a person with one ONRC identity («firmele lui Matei Ioan»), name order reversed", async () => {
    const { i, r } = await ask("firmele lui matei ioan din 2020");
    expect(i.person?.key).toBe("matei ioan|1957-01-01|batin");
    expect(i.place).toBeNull();
    expect(r.spec?.filters).toMatchObject({ adminPersonKey: "matei ioan|1957-01-01|batin", yearFrom: 2020 });
  });

  it("48. namesakes in ONRC: choose by birth year, no guess", async () => {
    const { r } = await ask("firmele lui Ion Popescu");
    expect(r.spec).toBeNull();
    expect(r.problem).toMatch(/Alege persoana/);
    expect(r.alternatives.map((a) => a.label)).toEqual(["POPESCU ION (n. 1960, Buzău)", "POPESCU ION (n. 1975, Iași)"]);
  });

  it("49. «firme mici» → at most 49 employees, said plainly", async () => {
    const { r } = await ask("firme mici care castiga contracte de paza in cluj");
    expect(r.spec?.filters).toMatchObject({ maxEmployees: 49, cpvTerm: "paza", county: "Cluj" });
    expect(r.sentence).toContain("firme cu cel mult 49 de angajați");
  });

  it("50. an acronym buyer («CNAIR»)", async () => {
    const { i } = await ask("cine a castigat cele mai multe contracte la cnair");
    expect(i.authority?.id).toBe(4000001);
  });

  it("51. «de la cine cumpără primăria buzău asfalt»: suppliers of the town hall", async () => {
    const { r } = await ask("de la cine cumpara primaria buzau asfalt");
    expect(r.spec).toMatchObject({ block: "table", dim: "supplier", filters: { uatSiruta: 44818, cpvTerm: "asfalt" } });
  });

  it("52. schools in a locality fall back to the county, and say why", async () => {
    const { r } = await ask("laptopuri pentru scolile din municipiul buzau");
    expect(r.spec?.filters).toMatchObject({ authorityKind: "scoala", county: "Buzău" });
    expect(r.spec?.filters.uatSiruta).toBeUndefined();
    expect(r.interpretation.notes.join(" ")).toMatch(/Localitatea include doar primăria/);
  });

  it("53. a lone surname that is also a firm word is not forced into a firm when a subject exists", async () => {
    const { i } = await ask("iluminat de craciun");
    expect(i.supplier).toBeNull();
  });

  it("54. long text is bounded", async () => {
    const { i } = await ask(`asfalt ${"foarte ".repeat(200)}`);
    expect(i.text.length).toBeLessThanOrEqual(300);
  });
});

describe("spec mapping", () => {
  it("every produced spec and alternative passes the engine validation", async () => {
    const qs = ["cine face iluminatul în buzău și cât costă", "pe ce cheltuie primăria din Râmnicu Sărat", "Sălcioara", "firmele lui Ion Popescu", "ce e suspect la asfaltarea din prahova in 2024", "compara erbasu cu elbi energy projects in 2024", "firma strabag", "laptopuri pentru școli"];
    for (const q of qs) {
      const { r } = await ask(q);
      for (const spec of [r.spec, ...r.alternatives.map((a) => a.spec)].filter(Boolean)) {
        expect(validateSpec(spec), q).not.toHaveProperty("error");
      }
    }
  });

  it("writes sentences for every block it can produce", () => {
    expect(sentenceFor({ block: "timeseries", measure: "value", filters: { county: "Cluj", yearFrom: 2020 } })).toBe("Cum au evoluat de la an la an achizițiile făcute de instituțiile din județul Cluj, din 2020 încoace?");
    expect(sentenceFor({ block: "stat", measure: "count", dataset: "da", filters: { uatSiruta: 1, uatName: "Comuna Apa (Satu Mare)", yearTo: 2020 } })).toBe("Câte achiziții au fost făcute de primăria Comunei Apa (Satu Mare), până în 2020, doar achiziții directe?");
    expect(sentenceFor({ block: "scatter", dim: "supplier", measure: "value", filters: {} })).toBe("Ce firme ies din tipar după indicele de risc și valoarea achizițiilor?");
  });
});
