import { describe, expect, it } from "vitest";
import { validateSpec } from "../ask/spec";
import { memoryVocabulary } from "./memory-vocabulary";
import { buildPlaces, catalogUatSource, countyDisplay, placeKey } from "./places";
import { RulesInterpreter, strongNameMatch } from "./rules";
import { FIXTURE } from "./rules.fixture";
import { stems, tokenize, wordMatches } from "./text";
import { countOf, resultFor, sentenceFor } from "./to-spec";
import { sentenceScopeProblems } from "./scope-check";
import type { AskSpec } from "../ask/spec";

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

  it("27. one distinctive word carried by several firms («erbașu») is a choice, not a pick", async () => {
    const { i, r } = await ask("cu cine lucreaza erbasu");
    expect(i.supplier).toBeNull();
    expect(r.spec).toBeNull();
    expect(r.alternatives.map((a) => a.spec.filters.supplierId)).toEqual([9000001, 9000002]);
    expect(r.alternatives[0]!.spec).toMatchObject({ block: "table", dim: "authority" });
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
    const { r } = await ask("compara constructii erbasu cu elbi energy projects in 2024");
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

  it("47. a person with one ONRC identity, name order reversed («firmele lui Marian Popescu»)", async () => {
    const { i, r } = await ask("firmele lui marian popescu din 2020");
    expect(i.person?.key).toBe("popescu marian|1970");
    expect(i.place).toBeNull();
    expect(r.spec?.filters).toMatchObject({ adminPersonKey: "popescu marian|1970", yearFrom: 2020 });
  });
  it("47b. a name the index cannot search with diacritics («Matei Ioan») is confirmed, not picked", async () => {
    const { i, r } = await ask("firmele lui matei ioan din 2020");
    expect(i.person).toBeNull();
    expect(i.place).toBeNull();
    expect(r.spec).toBeNull();
    expect(r.alternatives).toHaveLength(1);
    expect(r.alternatives[0]!.spec.filters).toMatchObject({ adminPersonKey: "matei ioan|1957-01-01|batin", yearFrom: 2020 });
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
    const qs = ["cine face iluminatul în buzău și cât costă", "pe ce cheltuie primăria din Râmnicu Sărat", "Sălcioara", "firmele lui Ion Popescu", "ce e suspect la asfaltarea din prahova in 2024", "compara constructii erbasu cu elbi energy projects in 2024", "firma strabag", "laptopuri pentru școli"];
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

// ------------------------------------------------------------------------
// Review of 22 Oct 2026 (approve=false): every failing phrasing is a case.

describe("review B1: persons are picked only when the registry holds one identity with that exact name", () => {
  it("«firmele lui Popa Ion»: 11 namesakes → a partial, deduplicated choice list, no pick", async () => {
    const { i, r } = await ask("firmele lui Popa Ion");
    expect(i.person).toBeNull();
    expect(r.spec).toBeNull();
    expect(i.choicesPartial).toMatchObject({ total: 11, search: "Popa Ion" });
    const labels = r.alternatives.map((a) => a.label);
    expect(new Set(labels).size).toBe(labels.length); // the duplicate 1950 record is one choice
    expect(labels).toContain("ION POPA (n. 1951, BUZĂU)");
    expect(r.problem).toMatch(/11 persoane/);
  });
  it("«firmele lui Maria Popescu»: never «Marian», never a firm, the name stays reported", async () => {
    const { i, r } = await ask("firmele lui Maria Popescu");
    expect(i.person).toBeNull();
    expect(i.personAlternatives).toEqual([]);
    expect(i.supplier).toBeNull();
    expect(i.entityAlternatives).toEqual([]);
    expect(i.leftover).toEqual(["Maria", "Popescu"]);
    expect(r.spec).toBeNull();
    expect(i.notes.join(" ")).toMatch(/Nu am găsit în Registrul Comerțului/);
  });
  it("«firmele lui Marian Popescu»: the single identity is picked", async () => {
    expect((await ask("firmele lui Marian Popescu")).i.person?.key).toBe("popescu marian|1970");
  });
});

describe("review B2: same-named or partially named institutions and firms are choices", () => {
  it.each([
    ["Compania de Utilitati Publice", [2128336, 2108930]],
    ["cine castiga la Compania de Utilitati Publice", [2128336, 2108930]],
    ["cine cumpara de la firma Proactiv", [2089443, 2020739]],
    ["Proactiv", [2089443, 2020739]],
    ["firma Mediplus Exim", [2128430, 2277951]],
  ] as const)("«%s» → choice between %j", async (q, ids) => {
    const { i, r } = await ask(q);
    expect(i.authority).toBeNull();
    expect(i.supplier).toBeNull();
    expect(r.spec).toBeNull();
    const chosen = r.alternatives.map((a) => a.spec.filters.authorityId ?? a.spec.filters.supplierId);
    for (const id of ids) expect(chosen).toContain(id);
  });
  it("«Spitalul Județean» is a partial name: no hospital is picked", async () => {
    const { i, r } = await ask("cine castiga la Spitalul Judetean");
    expect(i.authority).toBeNull();
    expect(r.spec).toBeNull();
    expect(r.alternatives.length).toBeGreaterThan(1);
  });
  it("«Colegiul Național Dimitrie Cantemir»: two colleges carry the name; never the commune Dimitrie Cantemir", async () => {
    const { i, r } = await ask("cine castiga la Colegiul National Dimitrie Cantemir");
    expect(i.place).toBeNull();
    expect(r.spec).toBeNull();
    expect(r.alternatives.map((a) => a.spec.filters.authorityId)).toEqual([6000001, 6000002]);
  });
  it("«Spitalul Județean de Urgență Buzău» is one exact name and is picked", async () => {
    expect((await ask("cine castiga la Spitalul Judetean de Urgenta Buzau")).i.authority?.id).toBe(2144002);
  });
});

describe("review B3: place names are read before subjects; institution words are never purchases", () => {
  it.each([
    ["cheltuieli Alba Iulia 2025", "Municipiul Alba Iulia"],
    ["Alba Iulia", "Municipiul Alba Iulia"],
    ["cat a cheltuit Baia Mare", "Municipiul Baia Mare"],
    ["ce cumpara Piatra Neamt", "Municipiul Piatra-Neamț"],
    ["cat a cheltuit Turnu Magurele", "Municipiul Turnu Măgurele"],
    ["cine castiga in Turnu Magurele", "Municipiul Turnu Măgurele"],
  ])("«%s» → %s, no subject", async (q, name) => {
    const { i } = await ask(q);
    expect(i.place?.name).toBe(name);
    expect(i.subjects).toEqual([]);
    expect(i.leftover).toEqual([]);
  });
  it.each([["cheltuieli Alba", "Alba"], ["cat a cheltuit Satu Mare", "Satu Mare"], ["Satu Mare", "Satu Mare"]])("«%s» → county %s, no subject", async (q, county) => {
    const { i } = await ask(q);
    expect(i.place).toMatchObject({ kind: "county", county });
    expect(i.subjects).toEqual([]);
  });
  it("«Constanta asfaltare» → Constanța and asfaltare (not «consultanță»)", async () => {
    const { i } = await ask("Constanta asfaltare");
    expect(i.place?.county).toBe("Constanța");
    expect(i.subjects.map((x) => x.term)).toEqual(["asfaltare"]);
  });
  it("«Direcția de Asistență Socială» is an institution (choice), not steering columns or social services", async () => {
    const { i, r } = await ask("ce cumpara Directia de Asistenta Sociala");
    expect(i.subjects).toEqual([]);
    const ids = r.alternatives.map((a) => a.spec.filters.authorityId);
    expect(ids).toContain(2135939);
    expect(ids).toContain(2135940);
  });
  it("«la primărie» without a name is not «siliconi primari»", async () => {
    const { i } = await ask("cine castiga licitatiile la primarie");
    expect(i.subjects).toEqual([]);
    expect(i.notes.join(" ")).toMatch(/numele primăriei/);
  });
  it("generic «lucrări» alone is not a subject: the person chooses which works (retired term)", async () => {
    const { i, r } = await ask("ce firme mici castiga lucrari in Suceava");
    expect(i.subjects).toEqual([]);
    expect(i.subjectChoices?.options.map((o) => o.term)).toEqual(["constructii", "cladiri", "drumuri", "reparatii", "renovare"]);
    expect(r.spec).toBeNull();
    expect(r.alternatives.every((a) => a.kind === "subject" && a.spec.filters.county === "Suceava")).toBe(true);
  });
});

describe("review B4: the sentence says the scope the spec runs", () => {
  it("«ce instituții din Râmnicu Sărat…» uses the county (a locality is only its town hall) and says why", async () => {
    const { r } = await ask("ce instituții din Râmnicu Sărat cumpără cel mai mult");
    expect(r.spec).toMatchObject({ block: "table", dim: "authority", filters: { county: "Buzău" } });
    expect(r.spec?.filters.uatSiruta).toBeUndefined();
    expect(r.interpretation.notes.join(" ")).toMatch(/doar primăria ei/);
  });
  it("risk questions never keep a locality and never offer a nationwide «doar primăria» alternative", async () => {
    for (const q of ["care institutie are cel mai mare risc in Buzau", "semnale in Ramnicu Sarat", "ce merita verificat in Buzau"]) {
      const { r } = await ask(q);
      for (const spec of [r.spec, ...r.alternatives.map((a) => a.spec)].filter((x): x is AskSpec => Boolean(x))) {
        if (spec.block === "scatter" || spec.block === "entity_card" || spec.block === "distribution") expect(spec.filters.uatSiruta, q).toBeUndefined();
      }
      for (const a of r.alternatives.filter((x) => x.kind === "place")) expect(a.spec.filters.uatSiruta ?? a.spec.filters.county, `${q} → ${a.label}`).toBeDefined();
    }
  });
  it("a locality offers the whole county as an alternative", async () => {
    const { r } = await ask("ce cumpara Piatra Neamt");
    expect(r.alternatives[0]).toMatchObject({ label: "Tot județul Neamț", spec: { filters: { county: "Neamț" } } });
  });
});

describe("review: non-blocking rules", () => {
  it("«ce spitale cumpără medicamente» ranks hospitals; «cele mai multe contracte» counts", async () => {
    expect((await ask("ce spitale din buzau cumpara medicamente")).r.spec).toMatchObject({ block: "table", dim: "authority", filters: { authorityKind: "spital", county: "Buzău" } });
    expect((await ask("cine castiga cele mai multe contracte in Vrancea")).r.spec).toMatchObject({ measure: "count", dim: "supplier" });
  });
  it("future years are refused; relative years follow the calendar in București", async () => {
    const { i } = await ask("cheltuieli Alba 2027");
    expect(i.period).toBeNull();
    expect(i.notes.join(" ")).toMatch(/2027/);
    const nye = await interpreter.interpret("asfaltare anul trecut", { now: new Date("2026-12-31T23:30:00Z") });
    expect(nye.period).toMatchObject({ yearFrom: 2026, yearTo: 2026 }); // 01:30 on 1 Jan 2027 in București
  });
  it("only defaults matched: no national answer to «<script>alert(1)</script> cine câștigă»", async () => {
    const { r } = await ask("<script>alert(1)</script> cine castiga");
    expect(r.spec).toBeNull();
    expect(r.problem).toMatch(/Nu am recunoscut/);
  });
  it("«cine câștigă în România» is a real national question", async () => {
    expect((await ask("cine castiga in Romania")).r.spec).toMatchObject({ block: "table", dim: "supplier", filters: {} });
  });
});

const REVIEW_PHRASINGS: string[] = [
"cine castiga asfaltarea in buzau",
"CINE CÂȘTIGĂ CONTRACTELE DE DESZĂPEZIRE ÎN RÂMNICU SĂRAT ANUL TRECUT",
"ce instituții din Râmnicu Sărat cumpără cel mai mult",
"care institutie din ramnicu sarat cheltuie cel mai mult",
"cum au evoluat achizitiile in Ramnicu Sarat intre 2020 si 2024",
"ce cumpara primaria din Buzau",
"pe ce se duc banii la Sălcioara",
"pe ce se duc banii la Salcioara Ialomita",
"ce spitale din buzau cumpara medicamente",
"scolile din ramnicu sarat ce cumpara",
"cat a cheltuit Cluj pe laptopuri in 2023",
"cât a cheltuit Cluj-Napoca pe laptopuri în 2023",
"licitatii pentru drumuri in prahova anul trecut",
"achizitii directe de calculatoare in iasi in ultimii 3 ani",
"achizitii directe cu un singur ofertant in Bacau",
"firmele lui Popescu Ion",
"firmele lui Ion Popescu",
"cine ia bani de la CNAIR",
"compara Spitalul Judetean de Urgenta Buzau cu Spitalul Judetean de Urgenta Braila",
"semnale la primaria Buzau",
"ce merita verificat in Vaslui",
"care firma are cel mai mare risc in Buzau",
"top 5 firme care castiga iluminat in Timisoara 2019-2021",
"iluminat public in sectorul 3",
"cine face iluminatul public in bucuresti",
"deszapezire",
"medicamnte spitale",
"asfaltare comune buzau dupa 2020",
"inainte de 2019 cat s a cheltuit pe mobilier in Brasov",
"din 2022 incoace cine a castigat cele mai multe contracte la Primaria Constanta",
"ce firme mici castiga lucrari in Suceava",
"firme cu peste 100 de angajati care fac drumuri in Arges",
"cine castiga contracte pe locuitor in Olt",
"ce primarii cheltuie cel mai mult pe locuitor in Teleorman",
"pomul de craciun",
"<script>alert(1)</script> cine castiga",
"'; drop table users; -- asfalt buzau",
"vreau sa stiu va rog frumos daca puteti sa imi spuneti cine a castigat banii pentru asfaltul de pe strada mea din comuna Berca judetul Buzau in anul 2024 ca am auzit ca e o firma a primarului si as vrea sa verific daca e adevarat sau nu",
"Erbasu",
"constructii erbasu",
"cine castiga in Sfantu Gheorghe",
"cine castiga in Targu Jiu",
"cine castiga in tg mures",
"cine castiga in Bistrita",
"cheltuieli Alba Iulia 2025",
"cheltuieli Alba 2027",
"cat costa pixurile la ministerul educatiei",
"ce a cumparat primaria Ploiesti de la firma Erbasu",
"cine castiga in 2020 2021",
"cine castiga anul acesta in Iasi",
"cine castiga in Alba",
"cheltuieli Alba",
"Alba Iulia",
"cine castiga la Alba Iulia",
"cheltuieli Arad 2024",
"cheltuieli Olt 2024",
"Neamt 2023",
"cheltuieli Sibiu",
"cheltuieli Valcea",
"cheltuieli Mures",
"ce cumpara Piatra Neamt",
"cat a cheltuit Baia Mare",
"cat a cheltuit Satu Mare",
"cat a cheltuit Turnu Magurele",
"Craiova cine castiga",
"Constanta asfaltare",
"ce firme lucreaza cu primaria Brasov",
"ce spitale cumpara cele mai multe medicamente",
"cine vinde lapte scolilor din Iasi",
"cine a castigat cel mai mult in judetul Ilfov in 2023",
"pe ce cheltuie Spitalul Judetean de Urgenta Buzau",
"firmele lui Ion Ionescu",
"firmele lui Gheorghe Pop",
"firmele administrate de Vasile Popa",
"compara Buzau cu Braila",
"compara primaria Buzau cu primaria Braila",
"cum a crescut cheltuiala pe asfalt in Buzau intre 2019 si 2024",
"ce firme au crescut cel mai mult intre 2022 si 2024 in Cluj",
"cine castiga cele mai multe contracte in Vrancea",
"cate achizitii directe a facut primaria Focsani in 2024",
"de la cine cumpara primaria Pitesti calculatoare",
"pe ce se duc banii in Voluntari",
"cine castiga la Primaria Sectorului 1",
"cine castiga la primaria capitalei",
"lucrari de reabilitare scoli Bacau 2021",
"servicii de curatenie spitale Dolj",
"benzina primarii",
"combustibil Buzau 2024",
"masini de politie",
"autobuze Cluj",
"ministerul sanatatii medicamente 2020",
"cine castiga in Romania",
"Cine câștigă în Ştefăneşti",
"cine castiga in ultimii 2 ani in Galati",
"cine castiga in anul 2015",
"cine castiga intre 2024 si 2020",
"cine castiga pana in 2021 in buzau",
"semnale firme Buzau",
"care spital din Iasi are cel mai mare risc",
"ce primarie are cel mai mare risc in Buzau",
"cine castiga la Scoala Gimnaziala nr. 1",
"ce cumpara Directia de Asistenta Sociala",
"ce cumpara Directia de Asistenta Sociala Buzau",
"cine cumpara de la firma Proactiv",
"Proactiv",
"firma Mediplus Exim",
"Compania de Utilitati Publice",
"cine castiga la Compania de Utilitati Publice",
"firmele lui Ion Pop",
"firmele lui Maria Popescu",
"firmele lui Ion Stan",
"firmele lui Mihai Popescu",
"firmele lui Popa Ion",
"firmele lui Liviu Dragnea",
"cine castiga la Colegiul National Dimitrie Cantemir",
"cat a cheltuit Turnu Magurele",
"cine castiga in Turnu Magurele",
"Satu Mare",
"cine castiga la Spitalul Judetean",
"cine castiga la Spitalul Judetean Arad",
"cine castiga licitatiile la primarie",
"cate licitatii a facut Ministerul Transporturilor anul trecut",
"Cine câștigă cele mai multe licitații de asfaltare din comunele din județul Buzău, în ultimii 5 ani, cu un singur ofertant?"
];

describe("every spec and alternative says its own scope (regression set)", () => {
  const own = [
    "cine face iluminatul în buzău și cât costă", "pe ce cheltuie primăria din Râmnicu Sărat", "laptopuri pentru școli",
    "firme de asfalt din buzău", "Sălcioara", "primăria Buzău", "ce cumpără Sălcioara din județul Dâmbovița",
    "câte achiziții directe a făcut primăria comunei Sălcioara din Ialomița în 2025", "cat a cheltuit primaria sectorului 3 pe curățenie",
    "care spital are cel mai ridicat indice de risc", "ce e suspect la asfaltarea din prahova in 2024", "laptopuri pentru scolile din municipiul buzau",
  ];
  it.each([...own, ...REVIEW_PHRASINGS])("%s", async (q) => {
    const { r } = await ask(q);
    const emitted = [...(r.spec && r.sentence ? [{ spec: r.spec, sentence: r.sentence }] : []), ...r.alternatives];
    for (const { spec, sentence } of emitted) {
      expect(validateSpec(spec), sentence).not.toHaveProperty("error");
      expect(sentenceScopeProblems(spec, sentence), sentence).toEqual([]);
    }
  });
});

describe("re-review of 4cda2e6", () => {
  it("a name the index cannot search at all is not searched; the person is asked for the full name", async () => {
    const { i, r } = await ask("firmele lui Ab Cd");
    expect(r.spec).toBeNull();
    expect(i.personAlternatives).toEqual([]);
    expect(i.notes.join(" ")).toMatch(/prea scurt pentru o căutare sigură/);
  });
  it("a name made only of a/i/s/t is searched as written only (no all-wildcard scan) and never picked silently", async () => {
    const { i, r } = await ask("firmele lui Tasia Stati");
    expect(r.spec).toBeNull();
    expect(i.person).toBeNull();
  });
  it("hyphenated surnames match («Maria Popescu-Ionescu»)", async () => {
    expect((await ask("firmele lui Maria Popescu-Ionescu")).i.person?.key).toBe("popescu-ionescu maria|1980");
  });
  it("fullwidth letters are normalized (NFKC)", async () => {
    const { i } = await ask("ｃｉｎｅ ｃâｓｔｉｇă ｉｎ ｂｕｚăｕ");
    expect(i.place).toMatchObject({ kind: "county", county: "Buzău" });
  });
  it("«compară Buzău cu Brăila»: town halls offered as a comparison, never another question type", async () => {
    const { i, r } = await ask("compara Buzau cu Braila");
    expect(i.intent).toBe("compare");
    expect(r.spec).toBeNull();
    expect(r.alternatives.map((a) => a.spec.block)).toEqual(["compare"]);
    expect(r.alternatives[0]!.spec.filters).toMatchObject({ authorityId: 2144364, compareWithId: 3000001 });
  });
  it("«compară primăria Buzău cu primăria Brăila» compares directly", async () => {
    expect((await ask("compară primăria Buzău cu primăria Brăila")).r.spec).toMatchObject({ block: "compare", filters: { authorityId: 2144364, compareWithId: 3000001 } });
  });
  it.each(["cine castiga in Turnu Severin", "cine castiga in Dr. Tr. Severin"])("short municipality names: «%s» → Drobeta-Turnu Severin", async (q) => {
    expect((await ask(q)).i.place?.name).toBe("Municipiul Drobeta-Turnu Severin");
  });
  it("«și» inside an institution name; the county narrows the choice", async () => {
    expect((await ask("ce cumpara Directia Generala de Asistenta Sociala si Protectia Copilului Iasi")).i.authority?.id).toBe(2145066);
    expect((await ask("ce cumpara Directia Generala de Asistenta Sociala si Protectia Copilului din Iasi")).i.authority?.id).toBe(2145066);
  });
  it("«ce primărie are cel mai mare risc» says that every institution is ranked", async () => {
    const { r } = await ask("ce primarie are cel mai mare risc in Buzau");
    expect(r.spec).toMatchObject({ block: "entity_card", rankBy: "risk", filters: { county: "Buzău" } });
    expect(r.sentence).toContain("nu doar primăriile");
  });
  it("«Consiliul Județean Buzău» is the named council; «consiliile județene» stays a kind", async () => {
    expect((await ask("ce cumpara Consiliul Judetean Buzau")).i.authority?.id).toBe(2144001);
    expect((await ask("ce cumpara consiliile judetene din Moldova")).i.authorityKind?.kind).toBe("consiliu_judetean");
  });
  it("«stradal» is a subject word, not a street: «iluminat stradal Baia Mare anul trecut»", async () => {
    const { i } = await ask("iluminat stradal Baia Mare anul trecut");
    expect(i.place?.name).toBe("Municipiul Baia Mare");
    expect(i.subjects[0]?.term).toBe("34993000-4");
    expect(i.leftover).toEqual([]);
  });
  it("a plural kind before a town does not hide the town («laptopuri școli Târgu Mureș»)", async () => {
    const { i, r } = await ask("laptopuri scoli Targu Mures");
    expect(i.leftover).toEqual([]);
    expect(r.spec?.filters).toMatchObject({ authorityKind: "scoala", county: "Mureș" });
  });
  it("«firmele lui» without a name is not a national ranking", async () => {
    const { r } = await ask("firmele lui %% __");
    expect(r.spec).toBeNull();
    expect(r.interpretation.notes.join(" ")).toMatch(/Scrie numele persoanei/);
  });
  it("a name searched only as written that finds nobody says so, with the diacritics caveat", async () => {
    const { r } = await ask("firmele lui Ana Tita");
    expect(r.spec).toBeNull();
    expect(r.interpretation.notes.join(" ")).toMatch(/scris exact așa\. Același nume scris cu diacritice nu a putut fi căutat sigur/);
  });
  it("an exhaustive search that finds nobody says a plain «Nu am găsit»", async () => {
    const { r } = await ask("firmele lui Maria Popescu");
    expect(r.interpretation.notes.join(" ")).toMatch(/Nu am găsit în Registrul Comerțului o persoană cu numele „Maria Popescu” \(cu data nașterii cunoscută\)/);
  });
});

