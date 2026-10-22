import { describe, expect, it } from "vitest";
import type { SuggestResponse } from "@/app/api/suggest/route";
import { memoryVocabulary } from "./intent/memory-vocabulary";
import { RulesInterpreter } from "./intent/rules";
import { FIXTURE } from "./intent/rules.fixture";
import { resultFor } from "./intent/to-spec";
import type { EntityHit } from "./search";
import { buildSuggestionGroups, flattenSuggestions, weakSubject } from "./search-suggestions";

const NOW = new Date("2026-10-22T12:00:00Z");
const interpreter = new RulesInterpreter(memoryVocabulary(FIXTURE));
const intentFor = async (q: string) => resultFor(await interpreter.interpret(q, { now: NOW }));
const vocab = (v: Partial<SuggestResponse> = {}): SuggestResponse => ({ cpv: [], uat: [], authority: [], supplier: [], person: [], ...v });
const entity = (id: number, name: string, roles: string[], county = "Buzau"): EntityHit => ({ id, name, cui: String(id), county, roles, total: 1 });
const ids = (groups: ReturnType<typeof buildSuggestionGroups>) => groups.map((g) => g.id);

describe("home search suggestions", () => {
  it("leads a subject with the interpreter's sentence, then subjects, and ends with the words search", async () => {
    const intent = await intentFor("iluminat");
    const groups = buildSuggestionGroups({
      text: "iluminat", intent,
      vocab: vocab({ cpv: [{ term: "iluminat", cpvName: "Aparatură de iluminat" }, { term: "34993000-4", cpvName: "Iluminat stradal" }] }),
      entities: [entity(9, "ILUMINAT TRAFIC MARKER", ["supplier"])],
    });
    expect(ids(groups)).toEqual(["likely", "subjects", "suppliers", "words"]);
    expect(groups[0]!.items[0]).toMatchObject({ label: intent.sentence, href: "/intreaba?q=iluminat" });
    expect(groups[1]!.items.map((s) => [s.label, s.href])).toEqual([["Iluminat", "/cauta?q=iluminat"], ["Iluminat stradal", "/cauta?q=Iluminat+stradal"]]);
    expect(groups.at(-1)!.items[0]!.href).toBe("/cauta?q=iluminat&literal=1");
  });

  it("combines the subject with the places named in the words", async () => {
    const groups = buildSuggestionGroups({ text: "iluminat buzau", intent: await intentFor("iluminat buzau"), vocab: vocab(), entities: [] });
    const places = groups.find((g) => g.id === "places")!.items;
    expect(places.map((p) => [p.label, p.href])).toEqual([
      ["iluminat · Județul Buzău", "/cauta?q=iluminat&place=county%3Abuzau"],
      ["iluminat · Municipiul Buzău (Buzău)", "/cauta?q=iluminat&place=uat%3A44818"],
    ]);
    expect(ids(groups).slice(0, 3)).toEqual(["likely", "subjects", "places"]);
  });

  it("offers a place named by the last word, not one it merely begins", async () => {
    const groups = buildSuggestionGroups({
      text: "iluminat buzau", intent: null, vocab: vocab(),
      lastWord: { word: "buzau", vocab: vocab({ uat: [{ siruta: 44818, name: "Buzău", tip: "municipiu", county: "buzau", population: 1 }, { siruta: 1, name: "Sita Buzăului", tip: "comună", county: "covasna", population: 1 }] }) },
    });
    expect(groups.find((g) => g.id === "places")!.items.map((p) => p.href)).toEqual(["/cauta?q=iluminat&place=county%3Abuzau", "/cauta?q=iluminat&place=uat%3A44818"]);
    const nova = buildSuggestionGroups({ text: "apa nova", intent: null, vocab: vocab(), lastWord: { word: "nova", vocab: vocab({ uat: [{ siruta: 2, name: "Novaci", tip: "oraș", county: "gorj", population: 1 }] }) } });
    expect(nova.find((g) => g.id === "places")).toBeUndefined();
    // institution words before the place name an institution, not a subject to search there
    const primaria = buildSuggestionGroups({ text: "primaria buzau", intent: null, vocab: vocab(), lastWord: { word: "buzau", vocab: vocab() } });
    expect(primaria.find((g) => g.id === "places")).toBeUndefined();
    // the whole text still completes a name being typed
    const typing = buildSuggestionGroups({ text: "buz", intent: null, vocab: vocab() });
    expect(typing.find((g) => g.id === "places")!.items[0]!.label).toBe("Județul Buzău");
  });

  it("lets names lead when the subject reading leaves words unexplained", async () => {
    const intent = await intentFor("apa nova");
    expect(intent.interpretation.leftover).toContain("nova");
    const groups = buildSuggestionGroups({ text: "apa nova", intent, vocab: vocab({ cpv: [{ term: "apa", cpvName: "Apă" }] }), entities: [entity(13102711, "S.C. APA NOVA PLOIESTI S.R.L.", ["authority"])] });
    expect(ids(groups)).toEqual(["authorities", "subjects", "words"]);
  });

  it("offers no subject-and-place reading that leaves a word unexplained", async () => {
    const intent = await intentFor("drumuri si poduri buzau");
    const groups = buildSuggestionGroups({ text: "drumuri si poduri buzau", intent, vocab: vocab() });
    expect(ids(groups)).not.toContain("likely");
    expect(groups.find((g) => g.id === "places")?.items.some((p) => p.label.includes("Poduri"))).toBeFalsy();
  });

  it("puts names first when the subject is only a fragment of a catalogue word", async () => {
    const intent = await intentFor("construct");
    // the fixture has no catalogue label for it: model the live reading ("Construcţie de canale")
    const live = { ...intent, interpretation: { ...intent.interpretation, subjects: [{ term: "45247110-4", label: "Construcţie de canale", cpvName: "Construcţie de canale", source: "catalog" as const, matched: { text: "construct", from: 0, to: 1 } }], confidenceLabel: "high" as const } };
    expect(weakSubject(live.interpretation.subjects[0]!)).toBe(true);
    const groups = buildSuggestionGroups({ text: "construct", intent: live, vocab: vocab({ cpv: [{ term: "45247110-4", cpvName: "Construcţie de canale" }] }), entities: [entity(1, "PORR CONSTRUCT", ["supplier"])] });
    expect(ids(groups)).toEqual(["suppliers", "subjects", "words"]);
  });

  it("works without the interpreter: entities still come, nothing is guessed", () => {
    const groups = buildSuggestionGroups({ text: "primaria buzau", intent: null, vocab: null, entities: [entity(2144364, "MUNICIPIUL BUZAU", ["authority"])] });
    expect(ids(groups)).toEqual(["authorities", "words"]);
    expect(groups[0]!.items[0]).toMatchObject({ href: "/entitati/2144364", detail: "Instituție publică · Buzau · CUI 2144364" });
  });

  it("offers an ambiguous reading as a choice, never as an answer", async () => {
    const intent = await intentFor("iluminat salcioara");
    expect(intent.spec).toBeNull();
    const groups = buildSuggestionGroups({ text: "iluminat salcioara", intent, vocab: vocab(), entities: [] });
    expect(groups[0]!.items[0]).toMatchObject({ label: intent.problem, href: "/intreaba?q=iluminat%20salcioara" });
    expect(groups.find((g) => g.id === "places")!.items.map((p) => p.href).sort()).toEqual(["/cauta?q=iluminat&place=uat%3A68789", "/cauta?q=iluminat&place=uat%3A94330"]);
  });

  it("shows persons only when the words read as a name, linking to the firms they lead", () => {
    const person = { key: "popescu ion|1960", name: "POPESCU ION", birthYear: 1960, birthDateImplausible: false, birthLocality: "Buzău", nFirms: 3 };
    const named = buildSuggestionGroups({ text: "popescu ion", intent: null, vocab: vocab({ person: [person] }) });
    expect(ids(named)).toEqual(["persons", "words"]);
    expect(named[0]!.items[0]!.href).toMatch(/^\/intreaba\?spec=/);
    const subject = buildSuggestionGroups({ text: "lemne", intent: null, vocab: vocab({ cpv: [{ term: "lemne", cpvName: "Lemn de foc" }], person: [person] }) });
    expect(ids(subject)).not.toContain("persons");
  });

  it("ignores a stale interpretation and keeps keyboard order = display order", async () => {
    const stale = await intentFor("iluminat");
    const groups = buildSuggestionGroups({ text: "drumuri", intent: stale, vocab: vocab({ cpv: [{ term: "drumuri", cpvName: "Lucrări de drumuri" }] }) });
    expect(ids(groups)).toEqual(["subjects", "words"]);
    expect(flattenSuggestions(groups).map((s) => s.id)).toEqual(["cpv:drumuri", "words"]);
    expect(buildSuggestionGroups({ text: "a" })).toEqual([]);
  });
});
