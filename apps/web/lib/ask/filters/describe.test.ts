import { describe, expect, it } from "vitest";
import { countWords } from "../answer-text";
import type { Grounding } from "../ground";
import { buildPills } from "../pills";
import { transitionQuestion, type QuestionSpec } from "../question-ui";
import { sourceCsvMessage } from "../source-csv";
import { parseSpec, type AskSpec } from "../spec";
import { FIXTURE_IDENTITIES } from "../fixtures/golden-fixture";
import { legacyCorpus } from "../fixtures/legacy-corpus";
import {
  caveatsBefore, chipsBefore, conditionPillsBefore, describePopulationBefore, notesBefore, scopeBefore, summaryBefore, topPillBefore,
} from "../fixtures/grammars-before-describe";
import { connectionEvidenceSpec } from "../../connection-evidence-shared";
import { formatInt } from "../../format";
import { DESCRIBED_FILTERS, describeConditions, populationDetail, unnamedEntityIds } from "./describe";
import { questionTitle, savedQuestionSummary } from "./title";
import { DA_BOUND_VALUE, selectionOrigin, splitExcluded } from "./origin";
import { FILTER_DEFS, SPEC_PATH_OWNERS } from "./registry";
import { entityCaptureSpec, NATIONAL_DA_COUNT_SPEC } from "../site-links";
import { DA_PLAFOND_RON } from "../predicates";
import type { PeerFacts } from "../peer-groups-shared";

/*
 * describeConditions replaces six grammars (plan §2.2, §5 F0). Each output is
 * compared with the frozen grammar it replaces (fixtures/grammars-before-describe.ts)
 * on every spec of the legacy corpus and on edge cases; the only differences
 * allowed are the ones the plan fixes, applied by `fixed` below and listed in
 * the stage notes: numerals through countWords (G10), the labels of selections
 * produced by other pages (§2.6), exclusions read "Fără X" (§2.8) and the
 * kit's vocabulary (§4, plan G3: `kit*` below, F1b-polish).
 */

/** G10 on a text of the old grammars: every count with its noun through countWords. */
function fixed(text: string): string {
  const employees = (n: string) => countWords(Number(n), "angajat", "angajați");
  return text
    // The title's tail already said «de»; it now also groups thousands, as countWords does.
    .replace(/(\d+)–(\d+)(?: de)? angajați/g, (_, a, b) => `${formatInt(Number(a))}–${employees(b)}`)
    .replace(/(?<![–\d.])(\d+)(?: de)? angajați/g, (_, n) => employees(n))
    .replace(/(\d+) condiții în (\d+) grupuri/g, (_, n, g) => `${countWords(Number(n), "condiție", "condiții")} în ${countWords(Number(g), "grup", "grupuri")}`)
    .replace(/(≥|cel puțin|Minimum|Pragul de) (\d+) înregistrări/g, (_, before, n) => `${before} ${countWords(Number(n), "înregistrare", "înregistrări")}`)
    .replace(/top (\d+) (autorități|furnizori|județe)/g, (_, n, noun) => `top ${countWords(Number(n), ({ autorități: "autoritate", furnizori: "furnizor", județe: "județ" } as Record<string, string>)[noun]!, noun)}`)
    .replace(/fără (\d+) subclase/g, (_, n) => `fără ${countWords(Number(n), "subclasă", "subclase")}`)
    .replace(/\+(\d+) CPV/g, (_, n) => `+${countWords(Number(n), "CPV", "CPV")}`);
}

/** Kit §4, place by place: the words of the old grammars the kit retires (plan G3, F1b-polish). */
const KIT_PILLS: Readonly<Record<string, string>> = {
  "toți anii disponibili": "toți anii",
  "toate sursele: achiziții directe + contracte prin proceduri": "toate achizițiile: directe și din proceduri",
  "doar contracte prin proceduri": "doar contractele din proceduri", "doar achiziții directe": "doar achizițiile directe",
  "doar comune": "doar primării de comună", "doar orașe/municipii": "doar primării de oraș și municipiu", "doar școli/licee": "doar școli",
  "un singur ofertant": "o singură ofertă",
};
const kitPill = (text: string) => KIT_PILLS[text] ?? text.replace(/^conduse de /, "conduse azi de ");
/** The list pill of a ranking: institutions, never "autorități" (pills.ts). */
const kitTop = (text: string) => text.replace(/autorități/, "instituții").replace(/autoritate\b/, "instituție").replace("toate instituțiile", "toate instituțiile publice");
const KIT_SCOPE_LABELS: Readonly<Record<string, string>> = { "Sursele întrebării": "Ce fel de achiziții", "Tip instituție": "Tipul instituției" };
const KIT_SCOPE_VALUES: Readonly<Record<string, string>> = {
  "Achiziții directe și contracte prin proceduri": "Toate achizițiile: directe și din proceduri", "Achiziții directe": "Achizițiile directe", "Contracte prin proceduri": "Contractele din proceduri",
  "Comune": "Primării de comună", "Orașe și municipii": "Primării de oraș și municipiu", "Școli și licee": "Școli",
  "Doar proceduri cu un singur ofertant confirmat": "Doar contractele cu o singură ofertă confirmată",
};
const kitScope = (row: { label: string; value: string }) => ({
  label: KIT_SCOPE_LABELS[row.label] ?? row.label,
  value: (KIT_SCOPE_VALUES[row.value] ?? row.value).replace(/^Profiluri istorice:/, "Profil istoric:"),
});
/**
 * S3 F2-merge-fixes (MF-bare-ids): a precise selection in the chip's words, naming every entity it
 * knows and counting the others, where the old grammar wrote the ids ("instituții includ 2146445").
 */
const kitPopulation = (spec: { population?: AskSpec["population"] }, text: string) =>
  spec.population ? text.replace(describePopulationBefore(spec.population), populationDetail(spec.population, {}, true)) : text;
const KIT_CHIPS: Readonly<Record<string, string>> = { "toți anii disponibili": "toți anii", "primăriile de oraș": "primăriile de oraș și municipiu", "Un singur ofertant": "O singură ofertă" };
const kitChip = (text: string) => KIT_CHIPS[text] ?? text.replace(/^Conduse de /, "Conduse azi de ");

/** A grounding as the engine would resolve the spec's names (the pills read names only from it). */
function groundingOf(spec: AskSpec, cpv?: Grounding["cpv"]): Grounding {
  const f = spec.filters, entity = (name: unknown, id: unknown) => ({ query: String(name ?? id), entityId: String(id ?? 1), nameDisplay: String(name ?? `#${id}`), county: null, alternatives: [] });
  return {
    ...(f.authorityName || f.authorityId ? { authority: entity(f.authorityName, f.authorityId) } : {}),
    ...(f.supplierName || f.supplierId ? { supplier: entity(f.supplierName, f.supplierId) } : {}),
    ...(f.compareWith || f.compareWithId ? { compare: entity(f.compareWith, f.compareWithId) } : {}),
    ...(f.county ? { county: { query: String(f.county), canonical: String(f.county).normalize("NFD").replace(/[̀-ͯ]/g, "") } } : {}),
    ...(f.uatSiruta ? { uat: { siruta: Number(f.uatSiruta), name: null, county: null, authorityIds: [], nAuthorities: 0 } } : {}),
    ...(f.adminPersonKey ? { admin: { query: "", personKey: String(f.adminPersonKey), display: f.adminName ?? "POPESCU ION (n. 1970)", supplierIds: [], nFirms: 2, alternatives: [] } as unknown as NonNullable<Grounding["admin"]> } : {}),
    ...(cpv ? { cpv } : f.cpvTerm ? { cpv: { term: String(f.cpvTerm), prefixes: ["45"], matchedNames: ["Lucrări de construcții"], method: "synonym" as const } } : {}),
  };
}

const corpus = legacyCorpus(FIXTURE_IDENTITIES).flatMap((entry) => {
  const spec = parseSpec(entry.spec);
  return "error" in spec ? [] : [{ id: entry.id, origin: entry.origin, spec }];
});
const edge = (spec: Partial<AskSpec>): AskSpec => ({ block: "table", measure: "value", dim: "supplier", filters: {}, ...spec } as AskSpec);
const edges: AskSpec[] = [
  edge({ filters: { minEmployees: 1 } }), edge({ filters: { maxEmployees: 20 } }), edge({ filters: { minEmployees: 1000, maxEmployees: 2000 } }),
  edge({ filters: { minEmployees: 0, maxEmployees: 0 } }), edge({ filters: { maxEmployees: 0 } }), edge({ filters: { minEmployees: 101 } }),
  edge({ minimumRecords: { role: "supplier", count: 1 } }), edge({ minimumRecords: { role: "authority", count: 20 } }), edge({ minimumRecords: { role: "supplier", count: 101 } }),
  edge({ topN: 25 }), edge({ topN: 1 }), edge({ block: "trend", dim: "authority", topN: 50, filters: { yearFrom: 2024, yearTo: 2025 } }),
  edge({ population: { operator: "and", groups: [{ operator: "and", conditions: Array.from({ length: 8 }, (_, i) => ({ field: "value" as const, op: "gte" as const, value: String(i) })) }, { operator: "and", conditions: Array.from({ length: 8 }, (_, i) => ({ field: "value" as const, op: "lte" as const, value: String(i) })) }, { operator: "and", conditions: Array.from({ length: 4 }, (_, i) => ({ field: "date" as const, op: "gte" as const, value: `2024-0${i + 1}-01` })) }] } }),
];
const cpvGroundings: (Grounding["cpv"] | undefined)[] = [
  undefined,
  { term: "45", prefixes: ["45", "71"], matchedNames: [], method: "code" },
  { term: "drumuri", prefixes: ["4523"], matchedNames: Array.from({ length: 25 }, (_, i) => `Nume ${i}`), method: "synonym", excludePrefixes: ["452331"] },
  { term: "medicamente", prefixes: ["336"], matchedNames: ["A", "B", "C"], method: "synonym", excludePrefixes: Array.from({ length: 20 }, (_, i) => `33${i}`) },
];

/** The specs whose population the plan words differently: another page's selection or exclusions. */
const relabelled = (spec: AskSpec) => Boolean(selectionOrigin(spec.population) || splitExcluded(spec.population).excluded.length);

describe("describeConditions says what the six grammars said (plan §2.2)", () => {
  const all = [...corpus.map((c) => c.spec), ...edges];

  it("covers the corpus, with its precise selections, thresholds and site selections", () => {
    expect(corpus.length).toBeGreaterThan(200);
    expect(corpus.filter((c) => c.spec.population).length).toBeGreaterThan(10);
    expect(corpus.filter((c) => c.spec.population && relabelled(c.spec)).length).toBeGreaterThanOrEqual(2);
  });

  it("gives the pills of pills.ts, with G10 numerals", () => {
    for (const spec of all)
      for (const cpv of cpvGroundings) {
        if (relabelled(spec)) continue;
        const grounding = groundingOf(spec, cpv);
        // F6a: a verification without a period says "până acum" (final fact_check §1), never "toți anii".
        const kit = (p: string) => spec.block === "fact_check" && p === "toți anii" ? "până acum" : p;
        expect(describeConditions(spec, { grounding }).pills, JSON.stringify(spec)).toEqual(conditionPillsBefore(spec, grounding).map((p) => kit(kitPill(fixed(p)))));
        // A ranking without topN is the complete one, in pages: its pill no longer says "top 10" (pills.ts, after the S1 review).
        if (spec.block === "table" && spec.topN == null) expect(buildPills(spec, grounding)[1]).toMatch(/^(toate instituțiile publice|toți furnizorii|toate județele)$/);
        else if (spec.block === "table" || spec.block === "trend") expect(buildPills(spec, grounding)).toContain(kitTop(fixed(topPillBefore(spec))));
      }
  });

  it("gives the saved summary, the watch receipt, the caveats and the notes", () => {
    for (const spec of all) {
      if (relabelled(spec)) continue;
      const described = describeConditions(spec);
      expect(described.summary, JSON.stringify(spec)).toEqual(summaryBefore(spec).map((text) => fixed(kitPopulation(spec, text))));
      const before = scopeBefore(spec);
      expect(described.scope).toEqual(before.items.map((row) => kitScope({ ...row, value: fixed(row.value) })));
      expect(described.receipt).toEqual(before.receipt);
      expect(described.caveats).toEqual(caveatsBefore(spec).map((text) => fixed(kitPopulation(spec, text))));
      const notes = notesBefore(spec);
      expect(described.byId.population?.note ?? null).toEqual(notes.population && kitPopulation(spec, notes.population));
      expect(described.byId.minimumRecords?.note ?? null).toEqual(notes.minimumRecords && fixed(notes.minimumRecords));
    }
  });

  // The interpreter's tail is the title's since F2 (lib/intent/to-spec.ts sentenceFor = questionTitle; rules.test.ts).
  it("gives the builder's chips", () => {
    for (const spec of all) {
      if (relabelled(spec)) continue;
      const draft = transitionQuestion(spec as unknown as QuestionSpec).spec;
      for (const cpvName of [undefined, "Lucrări de construcții"]) {
        const { byId } = describeConditions(draft, { cpvName });
        const chips = Object.fromEntries(Object.entries(byId).filter(([, w]) => w.chip !== undefined).map(([id, w]) => [id, w.chip!]));
        expect(chips, JSON.stringify(draft)).toEqual(Object.fromEntries(Object.entries(chipsBefore(draft, cpvName)).map(([id, text]) => [id, kitChip(fixed(kitPopulation(draft, text)))])));
      }
    }
  });
});

describe("the changes the plan fixes", () => {
  it("routes every count with its noun through countWords (G10)", () => {
    // A number from 20 up (but not ending in 01–19) directly before a counted noun lacks its «de».
    const nouns = "înregistrări|înregistrare|firme|instituții|condiții|grupuri|angajați|subclase|autorități|furnizori|județe|perechi|CPV|coduri";
    const missingDe = new RegExp(`(?<![\\d.,])(\\d{1,3}(?:\\.\\d{3})*|\\d+) (?:${nouns})\\b`, "g");
    const offending = (text: string) => [...text.matchAll(missingDe)].filter((m) => {
      const n = Number(m[1]!.replace(/\./g, "")), lastTwo = n % 100;
      return n !== 0 && (lastTwo === 0 || lastTwo >= 20);
    }).map((m) => m[0]);
    const texts: string[] = [];
    for (const spec of [...corpus.map((c) => c.spec), ...edges])
      for (const cpv of cpvGroundings) {
        const grounding = groundingOf(spec, cpv);
        const d = describeConditions(spec, { grounding });
        texts.push(...buildPills(spec, grounding), ...d.summary, ...d.caveats, ...d.scope.map((r) => r.value), d.tail, d.totalLine ?? "",
          ...Object.values(d.byId).flatMap((w) => [w.chip ?? "", w.note ?? "", w.words ?? ""]), savedQuestionSummary(spec), questionTitle(spec));
      }
    for (const [exported, total] of [[1, 1], [20, 20], [100_000, 200_000], [100_000, 120_001], [0, 0]] as const) texts.push(sourceCsvMessage(exported, total));
    expect(texts.flatMap(offending)).toEqual([]);
    expect(texts.join(" ")).not.toMatch(/[şţŞŢ]/);
    expect(describeConditions(edge({ filters: { minEmployees: 1 } })).pills).toContain("cel puțin 1 angajat");
    expect(describeConditions(edge({ population: { operator: "and", groups: [{ operator: "and", conditions: [{ field: "cpv", op: "not_in", values: ["45"] }] }] } })).pills).toContain("Selecție precisă · 1 condiție în 1 grup");
    expect(sourceCsvMessage(100_000, 200_000)).toContain("primele 100.000 din 200.000 de înregistrări");
  });

  it("speaks the kit's vocabulary in every place, never the words it retires (kit §4, plan G3, §6.1)", () => {
    const retired = [
      "toți anii disponibili", "toate sursele", "un singur ofertant", "ofertanți", "consorți", "Doar înainte", "La prima apariție", "debut în arhivă", "Ascunde din",
      "Fără acest cumpărător", "De unde sunt firmele?", "Ce achiziții?", "Ce perioadă?", "banii rămân", "prin proceduri", "Orașe și municipii", "Școli și licee",
      "orașe/municipii", "școli/licee", "Tip instituție", "Sursele întrebării", "Profiluri istorice", "toată România", "Toată perioada", "Firme străine", "Mărimea firmelor",
    ];
    const texts: string[] = [];
    for (const spec of [...corpus.map((c) => c.spec), ...edges]) {
      const grounding = groundingOf(spec);
      const d = describeConditions(spec, { grounding });
      texts.push(...buildPills(spec, grounding), ...d.summary, ...d.caveats, ...d.scope.flatMap((r) => [r.label, r.value]), d.tail, d.totalLine ?? "",
        ...Object.values(d.byId).flatMap((w) => [w.chip ?? "", w.note ?? "", w.words ?? ""]), savedQuestionSummary(spec), questionTitle(spec));
    }
    const all = texts.join("\n");
    for (const word of retired) expect(all, word).not.toContain(word);
    expect(all).not.toMatch(/(?<!azi )[Cc]onduse de/);
    expect(all).not.toMatch(/\bComune\b|\bÎncă \d|\bautorități/);
    expect(describeConditions({ block: "stat", measure: "value", dataset: "contracts", filters: { singleBidder: true } }).byId.singleBidder?.words).toBe("doar contractele cu o singură ofertă");
  });

  it("labels the selections other pages produce (plan §2.6, kit §5.42)", () => {
    const pair = (a: string, s: string) => ({ authority: { id: a, name: `I${a}` }, supplier: { id: s, name: `F${s}` } });
    const relation = connectionEvidenceSpec({ version: "connection-evidence-1", dataset: "all", pairs: [pair("1", "101"), pair("1", "102")] } as never);
    const d = describeConditions(relation);
    expect(d.byId.population?.origin?.origin).toBe("relation");
    expect(d.pills).toContain("Selecția relației: 2 firme");
    expect(d.caveats).toEqual(["Selecția relației: 2 firme. Valorile se referă la cota alocată fiecărui furnizor."]);
    expect(d.byId.population?.note).toBe("Selecția relației: 2 firme.");
    expect(d.summary).toContain("Selecția relației: 2 firme");
    expect(d.scope).toContainEqual({ label: "Selecția relației", value: "2 firme" });
    // The receipt keeps the exact pairs.
    expect(d.receipt?.groups.map((g) => g.items)).toEqual([["Instituția este în: 1", "Firma este în: 101"], ["Instituția este în: 1", "Firma este în: 102"]]);
    expect(describeConditions(connectionEvidenceSpec({ version: "connection-evidence-1", dataset: "all", pairs: [pair("1", "101"), pair("2", "101"), pair("3", "101")] } as never)).pills).toContain("Selecția relației: 3 instituții");
    expect(describeConditions(connectionEvidenceSpec({ version: "connection-evidence-1", dataset: "all", pairs: [pair("1", "101"), pair("2", "102")] } as never)).pills).toContain("Selecția relației: 2 perechi instituție–firmă");

    const entity = describeConditions(entityCaptureSpec("77"), { entities: { "77": "Comuna X" } });
    expect(entity.pills).toContain("Activitatea entității: Comuna X (ca instituție sau ca firmă)");
    // Before its name is known: never the bare id (F2-merge-fixes); the server's grounding names it.
    expect(describeConditions(entityCaptureSpec("77")).byId.population?.note).toBe("Activitatea entității: o entitate (ca instituție sau ca firmă).");
    expect(describeConditions(entityCaptureSpec("77"), { grounding: { entities: { "77": "Comuna X" } } }).byId.population?.note).toBe("Activitatea entității: Comuna X (ca instituție sau ca firmă).");

    // A comparison group's spec is one CPV division: labelled only by the page that binds the group.
    const peer: AskSpec = { block: "stat", measure: "value", dataset: "all", filters: {}, population: { operator: "and", groups: [{ operator: "and", conditions: [{ field: "cpv", op: "in", values: ["45"] }] }] } };
    expect(describeConditions(peer).byId.population?.note).toBe("Selecție precisă aplicată: doar CPV 45.");
    // Counted as the comparison page counts them: the analysed entity and the other members.
    expect(describeConditions(peer, { origin: { origin: "peers", members: 29, focal: "Comuna X" } }).byId.population?.note).toBe("Grupul de comparație: Comuna X și 29 de alți membri · CPV 45.");
    expect(describeConditions(peer, { origin: { origin: "peers", members: 1 } }).byId.population?.note).toBe("Grupul de comparație: entitatea analizată și 1 alt membru · CPV 45.");
    expect(describeConditions(peer, { origin: { origin: "peers" } }).byId.population?.note).toBe("Grupul de comparație: CPV 45.");
    // A precise selection a person built names its entities: never read as another page's.
    const named: AskSpec = { ...peer, population: { operator: "or", groups: [{ operator: "or", conditions: [{ field: "authority", op: "in", values: ["77"], labels: ["Comuna X"] }, { field: "supplier", op: "in", values: ["77"], labels: ["Comuna X"] }] }] } };
    expect(describeConditions(named).byId.population?.origin).toBeUndefined();
  });

  it("never writes a bare id of an old link's selection: named from the grounding, else counted (F2-merge-fixes, TB-l-answer-caveat)", () => {
    const old: AskSpec = { block: "stat", measure: "value", dataset: "all", filters: {}, population: { operator: "or", groups: [
      { operator: "and", conditions: [{ field: "authority", op: "in", values: ["2146445"] }, { field: "cpv", op: "in", values: ["45", "71", "33"] }] },
      { operator: "or", conditions: [{ field: "supplier", op: "in", values: ["2124387", "2115381", "9"] }, { field: "county", op: "in", values: ["Buzău"] }] },
    ] } };
    const counted = describeConditions(old);
    for (const text of [...counted.caveats, counted.byId.population!.note!, ...counted.pills, ...counted.summary]) expect(text).not.toMatch(/\d{4,}/);
    expect(counted.byId.population?.note).toBe("Selecție precisă aplicată: (doar 1 instituție ȘI doar CPV 45, 71, 33) SAU (doar 3 firme SAU doar județul Buzău).");
    // The server looks the names up with the other groundings (ground.ts): every one it knows, not only two as a chip.
    const grounding: Grounding = { entities: { "2146445": "Municipiul Cluj-Napoca", "2124387": "DEDEMAN S.R.L.", "2115381": "SELGROS CASH&CARRY SRL", "9": "ALFA SRL" } };
    expect(describeConditions(old, { grounding }).caveats[0]).toBe("Selecție precisă aplicată: (doar instituția Municipiul Cluj-Napoca ȘI doar CPV 45, 71, 33) SAU (doar firmele DEDEMAN S.R.L., SELGROS CASH&CARRY SRL, ALFA SRL SAU doar județul Buzău). Datele și limitele sunt inclusive; valorile se referă la cota alocată fiecărui furnizor.");
    // The chip's (?) names at most two, the builder's lookup asks only for those; the server's, for every list.
    expect(unnamedEntityIds(old.population)).toEqual(["2146445"]);
    expect(unnamedEntityIds(old.population, true)).toEqual(["2146445", "2124387", "2115381", "9"]);
  });

  it("reads exclusions as «Fără X» in the receipt, the title's tail and the total line (plan §2.8, G7, G8)", () => {
    const spec: AskSpec = { block: "table", measure: "value", dim: "supplier", filters: {}, population: { operator: "and", groups: [
      { operator: "and", conditions: [{ field: "supplier", op: "not_in", values: ["202"], labels: ["SYSTRA SA"] }] },
      { operator: "and", conditions: [{ field: "value", op: "gte", value: "1000" }] },
    ] } };
    const d = describeConditions(spec);
    expect(d.scope).toContainEqual({ label: "Scoase din calcul", value: "Fără SYSTRA SA (202)" });
    expect(d.receipt?.groups).toEqual([{ title: "Grupul 1 · toate condițiile", items: ["Valoare de cel puțin 1.000 lei"] }]);
    // The tail is every condition under the sentence (G7, R11): here "Selecție avansată" holds the rest of the precise selection.
    expect(d.tail).toBe("fără SYSTRA SA, valoarea pe câștigător ≥ 1.000 lei");
    expect(d.totalLine).toBe("fără SYSTRA SA, valoarea pe câștigător ≥ 1.000 lei");
    expect(questionTitle(spec)).toBe("Ce firme câștigă achizițiile făcute de instituțiile publice din toată țara, în toți anii, fără SYSTRA SA, valoarea pe câștigător ≥ 1.000 lei?");
    // Kept as today: the pills, the caveat and the note describe the whole precise selection.
    expect(d.pills).toContain("Selecție precisă · 2 condiții în 2 grupuri");
    expect(d.byId.population?.note).toBe("Selecție precisă aplicată: (fără firma SYSTRA SA) ȘI (valoarea pe câștigător ≥ 1.000 lei).");
    const three = { ...spec, population: { operator: "and" as const, groups: [{ operator: "and" as const, conditions: [{ field: "supplier" as const, op: "not_in" as const, values: ["1", "2", "3"], labels: ["A", "B", "C"] }] }] } };
    expect(describeConditions(three).tail).toBe("fără 3 firme");
    // Unlabelled lists stay a precise selection: their chip could only show a number.
    expect(describeConditions({ ...spec, population: { operator: "and", groups: [{ operator: "and", conditions: [{ field: "supplier", op: "not_in", values: ["202"] }] }] } }).tail).toBe("fără 1 firmă");
  });
});

describe("the words of every condition", () => {
  it("cover every key of today's engine but the shape of the answer and the ignored comparison mode", () => {
    const implemented = new Set(FILTER_DEFS.filter((def) => Object.keys(def.engine).length).map((def) => def.id));
    const owners = new Set(Object.values(SPEC_PATH_OWNERS).filter((id) => id !== "question" && implemented.has(id)));
    expect(new Set(DESCRIBED_FILTERS)).toEqual(new Set([...owners].filter((id) => !["dim", "measure", "topN", "rankBy"].includes(id))));
  });

  it("give a total line for every selection outside the basic sentence (G8)", () => {
    // What the sentence says is its own: the network's period and domain, a stat's stream and firms.
    expect(describeConditions({ block: "network", measure: "value", filters: { supplierId: 1, supplierName: "X", yearFrom: 2024, yearTo: 2024, cpvTerm: "asfaltare" } }).totalLine).toBeNull();
    expect(describeConditions({ block: "stat", measure: "value", dataset: "da", filters: { minEmployees: 1, maxEmployees: 9 } }).totalLine).toBeNull();
    expect(describeConditions({ block: "stat", measure: "value", filters: {} }).totalLine).toBeNull();
    // A partners' row (P3b) and a link's chip change the total outside it; the row says whose condition it is (kit G8).
    expect(describeConditions({ block: "network", measure: "value", filters: { authorityId: 1, authorityName: "X", minEmployees: 1, maxEmployees: 9 } }).totalLine).toBe("doar furnizorii cu 1–9 angajați");
    expect(describeConditions({ block: "network", measure: "value", filters: { authorityId: 1, authorityName: "X", adminPersonKey: "k", adminName: "ION" } }).tail).toBe("doar furnizorii conduși azi de ION");
    expect(describeConditions({ block: "sankey", measure: "value", filters: { supplierId: 2, supplierName: "PORR", county: "Ilfov" } }).totalLine).toBe("doar clienții din județul Ilfov");
    expect(describeConditions({ block: "sankey", measure: "value", filters: { supplierId: 2, supplierName: "PORR", county: "Ilfov", authorityKind: "spital" } }).totalLine).toBe("doar spitalele din județul Ilfov");
    // The flow's row has no person (blocks.ts partners): a link's administrator keeps the plain words of its chip.
    expect(describeConditions({ block: "sankey", measure: "value", filters: { authorityId: 1, authorityName: "X", adminPersonKey: "k", adminName: "ION" } }).totalLine).toBe("firmele conduse azi de ION");
    expect(describeConditions({ block: "stat", measure: "value", filters: { supplierId: 2, supplierName: "PORR", adminPersonKey: "k", adminName: "ION" } }).totalLine).toBe("firmele conduse azi de ION");
    // The selections glued to the ranked firms are said again: their size, administrator, seat (on a firm profile, the county).
    expect(describeConditions({ block: "table", measure: "value", dim: "supplier", filters: { minEmployees: 1, maxEmployees: 9, adminPersonKey: "k", adminName: "ION" } }).totalLine)
      .toBe("firmele conduse azi de ION, firme cu 1–9 angajați");
    expect(describeConditions({ block: "scatter", measure: "value", dim: "supplier", filters: { county: "Cluj" } }).totalLine).toBe("cu sediul în județul Cluj");
  });

  // F2, kit §4: „Noi” always with its year, „Nu mai apar”, „Aceleași luni: ian.–mai”, „Prima dată”.
  it("say a trend's group, months and order in every place, and only on a trend that has them", () => {
    const base = { block: "trend", dim: "supplier", measure: "value", topN: 10, filters: { yearFrom: 2024, yearTo: 2025 } } as const;
    const growth = describeConditions({ ...base, trend: { change: "up", months: "auto", order: "percent", minBase: 1_000_000 } });
    expect(growth.pills).toEqual(["2024 → 2025", "creșteri", "aceleași luni", "după creșterea în procente", "cel puțin 1 mil. lei în 2024", "toate achizițiile: directe și din proceduri"]);
    // „Grupa”, as the drawer's header and a watch's fixed group say it (MF-note-grupei).
    expect(growth.scope.filter((row) => ["Grupa", "Luni comparate", "Ordine", "Baza creșterii"].includes(row.label))).toEqual([
      { label: "Grupa", value: "Creșteri" },
      { label: "Luni comparate", value: "Aceleași luni în ambii ani, până la ultima lună completă" },
      { label: "Ordine", value: "Creșterea în procente" },
      { label: "Baza creșterii", value: "Cel puțin 1 mil. lei în 2024" },
    ]);
    // The months change both totals (a selection): the total line says them; the group narrows the list only.
    expect(growth.totalLine).toBe("pe aceleași luni");
    expect(growth.byId.trendMinBase?.words).toBe("dintre firmele cu cel puțin 1 mil. lei în 2024");
    const fresh = describeConditions({ ...base, trend: { change: "new", firstOnly: true, months: [1, 5] } });
    expect(fresh.byId.trendChange).toMatchObject({ chip: "Noi față de 2024", words: "noi față de 2024", summary: "Noi față de 2024" });
    expect(fresh.byId.trendFirstOnly).toMatchObject({ chip: "Prima dată în 2025", words: "prima dată în 2025" });
    // Across other years (trend final §1): the year without records.
    const apart = describeConditions({ ...base, filters: { yearFrom: 2023, yearTo: 2025 }, trend: { change: "gone" } });
    expect(apart.byId.trendChange).toMatchObject({ chip: "Fără înregistrări în 2025", words: "fără înregistrări în 2025" });
    expect(fresh.byId.trendMonths).toMatchObject({ chip: "Aceleași luni: ian.–mai", words: "pe aceleași luni: ian.–mai", scope: [{ label: "Luni comparate", value: "ian.–mai, în ambii ani" }] });
    // The title says the group and chosen months (title.ts): the saved summary does not repeat them.
    expect(fresh.summary).toEqual([]);
    expect(describeConditions({ ...base, trend: { change: "up", months: "auto" } }).summary).toEqual(["Aceleași luni"]);
    // A percent order without its base ranks from 1 mil. lei, and says it.
    expect(describeConditions({ ...base, trend: { change: "up", order: "percent" } }).byId.trendMinBase?.words).toBe("dintre firmele cu cel puțin 1 mil. lei în 2024");
    expect(describeConditions({ ...base, trend: { change: "gone", months: "whole" } }).byId).toMatchObject({
      trendChange: { chip: "Nu mai apar în 2025" }, trendMonths: { chip: "Ani întregi", words: "pe ani întregi" },
    });
    expect(describeConditions({ ...base, trend: { change: "all" } }).byId.trendChange).toMatchObject({ chip: "Toate", words: "toate schimbările" });
    // A trend without options reads as today.
    const today = describeConditions(base);
    for (const id of ["trendChange", "trendMonths", "trendOrder", "trendMinBase", "trendFirstOnly"] as const) expect(today.byId[id]).toBeUndefined();
  });

  it("keep the home page's direct-acquisition bound the engine's ceiling", () => {
    expect(DA_BOUND_VALUE).toBe(String(DA_PLAFOND_RON));
    expect(NATIONAL_DA_COUNT_SPEC.population?.groups[0]?.conditions[0]).toMatchObject({ value: DA_BOUND_VALUE });
    // It narrows nothing: no title words, no total line ("site:home-da-count").
    const home = describeConditions(NATIONAL_DA_COUNT_SPEC);
    expect([home.tail, home.totalWords, home.totalLine]).toEqual(["", [], null]);
  });

  it("say a precise selection's one or two conditions, else how many, with every group in the detail (kit P9)", () => {
    const value: AskSpec = { block: "stat", measure: "value", filters: { yearFrom: 2025, yearTo: 2025 }, population: { operator: "and", groups: [{ operator: "and", conditions: [{ field: "value", op: "gte", value: "100000" }] }] } };
    expect(describeConditions(value).tail).toBe("valoarea pe câștigător ≥ 100.000 lei");
    expect(questionTitle(value)).toBe("Cât valorează achizițiile făcute de instituțiile publice din toată țara, în 2025, valoarea pe câștigător ≥ 100.000 lei?");
    const two: AskSpec = { ...value, population: { operator: "or", groups: [
      { operator: "and", conditions: [{ field: "county", op: "in", values: ["Cluj"] }] },
      { operator: "and", conditions: [{ field: "date", op: "lte", value: "2025-06-30" }] },
    ] } };
    expect(describeConditions(two).tail).toBe("doar județul Cluj sau data ≤ 30.06.2025");
    const three: AskSpec = { ...value, population: { operator: "and", groups: [{ operator: "or", conditions: [
      { field: "cpv", op: "in", values: ["45"] }, { field: "cpv", op: "in", values: ["33"] }, { field: "supplier", op: "in", values: ["1", "2", "3"] },
    ] }] } };
    const d = describeConditions(three);
    expect(d.tail).toBe("selecție avansată, 3 condiții");
    // The (?) in the chip's words: firms an old link lists without labels are counted, never bare ids.
    expect(d.byId.population?.detail).toBe("doar CPV 45 SAU doar CPV 33 SAU doar 3 firme");
    // "Selecție precisă" is not the 13 questions' name for it any more (plan R3, §6.3).
    for (const spec of [value, two, three]) expect(`${questionTitle(spec)} ${d.totalLine}`).not.toMatch(/selecție precisă/i);
  });

  it("name the distribution group's rule in the pill, with RPL 2021 when it goes by population (final distribution §1.1)", () => {
    const spec = { block: "distribution", measure: "value", filters: { authorityId: 2144364, authorityName: "MUNICIPIUL BUZAU" }, peers: { similar: true } } as AskSpec;
    const facts = (similar: PeerFacts["similar"]) =>
      ({ role: "authority" as const, entityId: "2144364", name: "MUNICIPIUL BUZAU", county: "Buzău", nDas: 782, similar, activity: { min: 391, max: 1_564 } });
    const pills = (peerGroup?: ReturnType<typeof facts>) => buildPills(spec, {} as Grounding, peerGroup ? { peerGroup } : {});
    expect(pills(facts({ rule: "population", value: 103_481, min: 51_741, max: 206_962 }))).toEqual(expect.arrayContaining(["grupul de comparație: populație apropiată", "populație RPL 2021"]));
    const hospital = pills(facts({ rule: "kind", kind: "spital" }));
    expect(hospital).toContain("grupul de comparație: același tip");
    expect(hospital).not.toContain("populație RPL 2021");
    // Without the answer's facts (a saved question) both rules are named; another entity's facts are not used.
    expect(pills()).toContain("grupul de comparație: același tip sau populație apropiată");
    expect(pills({ ...facts({ rule: "kind", kind: "spital" }), entityId: "1" })).toContain("grupul de comparație: același tip sau populație apropiată");
  });
});
