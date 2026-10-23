import { describe, expect, it } from "vitest";
import { memoryVocabulary, type MemoryFixture } from "./memory-vocabulary";
import { ENTITY_HINT, PERSON_HINT, RulesInterpreter } from "./rules";
import { FIXTURE } from "./rules.fixture";
import { resultFor } from "./to-spec";
import { applyInterpretation } from "../topic-search/interpretation";
import { parseTopicScope } from "../topic-search/shared";

/**
 * The first-visitor test of 23 Oct 2026 (vocabulary track): the words people
 * typed, with the vocabulary of migration 0082 on top of the shared fixture.
 */
const NOW = new Date("2026-10-23T08:00:00Z");
const fx: MemoryFixture = {
  ...FIXTURE,
  catalog: [
    ...FIXTURE.catalog,
    { code: "44212100-3", name: "Pod" },
    { code: "45221000-2", name: "Lucrări de construcţii de poduri şi tuneluri, puţuri şi pasaje subterane" },
    { code: "77310000-6", name: "Amenajare şi întreţinere de spaţii verzi" },
    { code: "77313000-7", name: "Servicii de întreţinere a parcurilor" },
    { code: "39221121-5", name: "Căni" },
    { code: "39241100-3", name: "Cuţite" },
    { code: "30197321-6", name: "Cuţite de deschis scrisori" },
    { code: "44110000-4", name: "Materiale de construcţii" },
  ],
  synonyms: [
    ...FIXTURE.synonyms.filter((s) => s.term !== "lucrari"),
    { term: "pod", prefix: "45221000" },
    { term: "parcuri", prefix: "77310000" },
    { term: "parcuri", prefix: "43325000" },
    { term: "spatii verzi", prefix: "77310000" },
    { term: "lucrari de drumuri", prefix: "45233000" },
    { term: "lucrari drumuri", prefix: "45233000" },
    { term: "iluminat public", prefix: "34993000" },
  ],
  suppliers: [...FIXTURE.suppliers, { id: 8100001, name: "ECO GARDEN CONSTRUCT SRL", county: "Bacau", total: 20_000_000, cui: "28133414" }],
  authorities: [
    ...FIXTURE.authorities.map((a) => (a.id === 2146486 ? { ...a, cui: "3897151" } : a)),
    { id: 7000001, name: "SPITALUL CLINIC JUDETEAN DE URGENTA CRAIOVA", county: "Dolj", total: 2_000_000_000 },
    { id: 7000002, name: "SPITALUL CLINIC JUDETEAN DE URGENTA ARAD", county: "Arad", total: 1_500_000_000 },
    { id: 7000003, name: "SPITALUL JUDETEAN DE URGENTA BACAU", county: "Bacau", total: 1_400_000_000 },
    { id: 7000004, name: "SPITALUL CLINIC JUDETEAN DE URGENTA SIBIU", county: "Sibiu", total: 1_300_000_000 },
    { id: 7000005, name: "SPITALUL JUDETEAN DE URGENTA PITESTI", county: "Arges", total: 1_200_000_000 },
    { id: 7000006, name: "SPITALUL JUDETEAN DE URGENTA PIATRA NEAMT", county: "Neamt", total: 1_100_000_000 },
    { id: 7000007, name: "SPITALUL JUDETEAN DE URGENTA SLATINA", county: "Olt", total: 1_000_000_000 },
    { id: 2108775, name: "MUNICIPIUL CLUJ-NAPOCA", county: "Cluj", total: 5_000_000_000, cui: "4305857" },
  ],
};
const interpreter = new RulesInterpreter(memoryVocabulary(fx));
async function ask(q: string) {
  const i = await interpreter.interpret(q, { now: NOW });
  return { i, r: resultFor(i) };
}

describe("vocabulary from the first-visitor test (migration 0082 and the rules around it)", () => {
  it("„pod” is bridge works, never the catalogue product „Pod”", async () => {
    for (const q of ["cat a costat podul din buzau", "pod buzau"]) {
      const { i, r } = await ask(q);
      expect(i.subjects.map((s) => s.term), q).toEqual(["pod"]);
      expect(r.spec?.filters.cpvTerm, q).toBe("pod");
    }
  });

  it("„lucrări (de) drumuri” is the whole road-works family, not the leaf „Lucrări de drumuri”", async () => {
    const typed = await ask("Lucrări de drumuri Bacău");
    expect(typed.i.subjects[0]!.label).toBe("lucrări de drumuri");
    for (const q of ["cine castiga cele mai multe lucrari de drumuri in bacau", "lucrari drumuri bacau"]) {
      const { i, r } = await ask(q);
      expect(i.subjects).toHaveLength(1);
      expect(r.spec?.filters.cpvTerm, q).toMatch(/^lucrari (de )?drumuri$/);
      expect(i.subjects[0]!.label, q).toMatch(/^lucrari (de )?drumuri$/);
    }
  });

  it("a broad synonym beats a narrower catalogue label for the same words beside a generic word", async () => {
    // without a dedicated row, „lucrări de canalizare” is the curated „canalizare”, not one catalogue leaf
    const { i } = await ask("lucrari de canalizare in buzau");
    expect(i.subjects.map((s) => s.term)).toEqual(["canalizare"]);
    // goods words change the subject: „materiale de construcții” stays the catalogue's building materials
    const goods = await ask("materiale de constructii pentru drumuri");
    expect(goods.i.subjects.map((s) => s.term)).not.toContain("constructii");
    const roads = new RulesInterpreter(memoryVocabulary({ ...fx, synonyms: fx.synonyms.filter((s) => !s.term.startsWith("lucrari")) }));
    const old = await roads.interpret("lucrari de drumuri bacau", { now: NOW });
    expect(old.subjects.map((s) => s.term)).toEqual(["drumuri"]);
  });

  it("two subjects are counted together, and the interpretation names both", async () => {
    const { i, r } = await ask("parcuri si spatii verzi timisoara");
    expect(i.subjects.map((s) => s.term)).toEqual(["parcuri", "spatii verzi"]);
    expect(r.spec?.filters.cpvTerm).toBe("parcuri + spatii verzi");
    expect(i.notes.join(" ")).toMatch(/Am adunat ambele domenii: „parcuri”, „spatii verzi”\. O achiziție care se potrivește cu mai multe e numărată o singură dată\./);
    expect(i.notes.join(" ")).not.toMatch(/primul domeniu/);
    expect(r.sentence).toMatch(/„parcuri și spatii verzi”/);
  });

  it("a typed CPV code is that domain, with or without its check digit", async () => {
    for (const q of ["45233140", "45233140-2", "cine castiga 45233140 in bacau"]) {
      const { i, r } = await ask(q);
      expect(i.subjects.map((s) => [s.term, s.source]), q).toEqual([["45233140-2", "catalog"]]);
      expect(i.subjects[0]!.label, q).toBe("Lucrări de drumuri");
      expect(r.spec?.filters.cpvTerm, q).toBe("45233140-2");
      expect(i.leftover, q).toEqual([]);
    }
  });

  it("RO followed by digits is a fiscal code (CUI)", async () => {
    for (const q of ["RO4305857", "ro 4305857", "cui 4305857"]) {
      const { i, r } = await ask(q);
      expect(i.authority?.name, q).toBe("MUNICIPIUL CLUJ-NAPOCA");
      expect(r.spec?.filters.authorityId, q).toBe(2108775);
    }
    const unknown = await ask("RO999999");
    expect(unknown.i.authority).toBeNull();
    expect(unknown.i.notes.join(" ")).toMatch(/Nu am găsit o firmă sau o instituție cu codul fiscal „RO999999”/);
  });

  it("SEAP jargon: a single offer is the single-bidder filter, never mugs", async () => {
    for (const q of ["oferta unica drumuri bacau", "ofertă unică drumuri bacau", "un singur ofertant drumuri bacau", "o singura oferta drumuri bacau"]) {
      const { i, r } = await ask(q);
      expect(i.singleBidder, q).toBe(true);
      expect(i.subjects.map((s) => s.term), q).toEqual(["drumuri"]);
      expect(r.spec?.filters.singleBidder, q).toBe(true);
      expect(i.leftover, q).toEqual([]);
    }
  });

  it("SEAP jargon: procedure types are procedures, never letter openers, and say what is not filtered", async () => {
    for (const [q, word] of [["licitatie deschisa drumuri bacau 2024", "deschisa"], ["procedura simplificata drumuri bacau", "simplificata"], ["negociere fara publicare drumuri bacau", "fara"]] as const) {
      const { i, r } = await ask(q);
      expect(i.subjects.map((s) => s.term), q).toEqual(["drumuri"]);
      expect(i.dataset, q).toBe("contracts");
      expect(r.spec?.dataset, q).toBe("contracts");
      expect(i.leftover.join(" "), q).toContain(word);
      expect(i.notes.join(" "), q).toMatch(/Nu putem filtra încă după tipul procedurii/);
    }
  });

  it("an institution name with words the registry leaves out, in a named place", async () => {
    const { i, r } = await ask("spitalul judetean de urgenta satu mare");
    expect(i.authority?.name).toBe("SPITALUL JUDETEAN SATU MARE");
    expect(i.entityAlternatives).toEqual([]);
    expect(i.notes.join(" ")).toMatch(/„urgenta”; am căutat instituția fără el/);
    expect(r.spec?.filters.authorityId).toBe(2146486);
  });

  it("choices for a partial institution name are those of the recognised place", async () => {
    const { i } = await ask("cat a cheltuit spitalul judetean de urgenta din judetul satu mare");
    expect(i.entityAlternatives.map((e) => e.county).filter((c) => c !== "Satu Mare")).toEqual([]);
    expect(i.authority?.name ?? i.entityAlternatives[0]?.name).toBe("SPITALUL JUDETEAN SATU MARE");
  });

  it("/cauta answers a typed CPV code and names every subject it counts", async () => {
    const onCauta = async (q: string) => {
      const scope = parseTopicScope(new URLSearchParams(`q=${encodeURIComponent(q)}`));
      return applyInterpretation(scope, resultFor(await interpreter.interpret(scope.q, { now: NOW })), null, NOW);
    };
    const code = await onCauta("45233140");
    expect(code.subject).toMatchObject({ term: "45233140-2", label: "Lucrări de drumuri" });
    expect(code.answer?.total.spec.filters.cpvTerm).toBe("45233140-2");
    const both = await onCauta("parcuri si spatii verzi");
    expect(both.answer?.total.spec.filters.cpvTerm).toBe("parcuri + spatii verzi");
    expect(both.answer?.total.sentence).toMatch(/„parcuri și spatii verzi”/);
  });

  it("a one-letter typo in a place after a marker, from six letters on („oradia”)", async () => {
    for (const q of ["primaria oradia", "cat a costat podul din oradia"]) {
      const { i } = await ask(q);
      expect(i.place?.name, q).toBe("Municipiul Oradea");
      expect(i.leftover, q).toEqual([]);
    }
  });

  it("English names of frequent subjects map to the curated Romanian term, and say so", async () => {
    const { i, r } = await ask("street lighting cluj");
    expect(i.subjects.map((s) => s.term)).toEqual(["iluminat public"]);
    expect(i.place?.county).toBe("Cluj");
    expect(i.leftover).toEqual([]);
    expect(i.notes).toContain("Am citit „street lighting” ca „iluminat public”.");
    expect(r.spec?.filters.cpvTerm).toBe("iluminat public");
    const roads = await ask("who wins road works in bacau");
    expect(roads.i.subjects.map((s) => s.term)).toEqual(["drumuri"]);
  });

  it("„administratorul la <firmă>” reads the firm and says where its administrators are", async () => {
    const { i } = await ask("cine e administratorul la constructii erbasu");
    expect(i.supplier?.name).toBe("CONSTRUCTII ERBASU S.A.");
    expect(i.leftover).toEqual([]);
    expect(i.notes).toContain("Administratorii unei firme apar pe pagina ei, la „Conducere”, din Registrul Comerțului.");
    const missing = await ask("administratorul firmei xyzabc");
    expect(missing.i.supplier).toBeNull();
    expect(missing.i.notes.join(" ")).toMatch(/Nu am găsit firma „xyzabc”/);
    // a name right after the word stays a person
    const person = await ask("administratorul popescu marian");
    expect(person.i.person?.name).toBe("POPESCU MARIAN");
  });

  it("a bare number: a fiscal code wins, a CPV code alone stays a domain, both are offered when it is both", async () => {
    const firm = await ask("28133414");
    expect(firm.i.supplier).toMatchObject({ id: 8100001, name: "ECO GARDEN CONSTRUCT SRL" });
    expect(firm.i.subjects).toEqual([]);
    const code = await ask("45233140");
    expect(code.i.subjects.map((s) => s.term)).toEqual(["45233140-2"]);
    expect(code.i.supplier).toBeNull();
    const both = new RulesInterpreter(memoryVocabulary({ ...fx, suppliers: [...fx.suppliers, { id: 8100002, name: "DRUM CONSTRUCT SRL", county: "Bacau", total: 1, cui: "45233140" }] }));
    const r = resultFor(await both.interpret("45233140", { now: NOW }));
    expect(r.spec).toBeNull();
    expect(r.problem).toMatch(/este codul fiscal al firmei „DRUM CONSTRUCT SRL” și codul CPV 45233140-2/);
    expect(r.alternatives.map((a) => [a.kind, a.spec.filters.cpvTerm ?? a.spec.filters.supplierId])).toEqual([["subject", "45233140-2"], ["entity", 8100002]]);
    // a number nobody has stays as typed
    expect((await ask("12345678")).i.supplier).toBeNull();
  });

  it("/cauta answers several subjects together, like Întreabă", async () => {
    const onCauta = async (q: string) => {
      const scope = parseTopicScope(new URLSearchParams(`q=${encodeURIComponent(q)}`));
      return applyInterpretation(scope, resultFor(await interpreter.interpret(scope.q, { now: NOW })), null, NOW);
    };
    for (const q of ["parcuri si spatii verzi timisoara", "cat a cheltuit primaria brasov pe parcuri si spatii verzi"]) {
      const t = await onCauta(q);
      expect(t.question?.sentence, q).toMatch(/„parcuri și spatii verzi”/);
      expect(t.answer?.total.spec.filters.cpvTerm, q).toBe("parcuri + spatii verzi");
      expect(t.answer?.total.spec.filters.uatSiruta, q).toBeGreaterThan(0);
      // the route lists the classes of what the answer counts ("Domenii incluse")
      expect(t.subject, q).toMatchObject({ term: "parcuri + spatii verzi", label: "parcuri și spatii verzi" });
    }
  });

  it("the hint for a partial list asks institutions for a locality, people for birth data", async () => {
    const hospitals = await ask("spitalul judetean de urgenta");
    expect(hospitals.i.choicesPartial?.hint).toBe(ENTITY_HINT);
    expect(ENTITY_HINT).not.toMatch(/naște/);
    const people = await ask("firmele lui popa ion");
    expect(people.i.choicesPartial?.hint).toBe(PERSON_HINT);
  });
});
