import { describe, expect, it } from "vitest";
import { countWords } from "../answer-text";
import type { Grounding } from "../ground";
import { buildPills } from "../pills";
import { describeQuestion, transitionQuestion, type QuestionSpec } from "../question-ui";
import { sourceCsvMessage } from "../source-csv";
import { parseSpec, type AskSpec } from "../spec";
import { FIXTURE_IDENTITIES } from "../fixtures/golden-fixture";
import { legacyCorpus } from "../fixtures/legacy-corpus";
import {
  caveatsBefore, chipsBefore, conditionPillsBefore, notesBefore, scopeBefore, summaryBefore, tailBefore, topPillBefore,
} from "../fixtures/grammars-before-describe";
import { connectionEvidenceSpec } from "../../connection-evidence-shared";
import { formatInt } from "../../format";
import { DESCRIBED_FILTERS, describeConditions, savedQuestionSummary } from "./describe";
import { DA_BOUND_VALUE, selectionOrigin, splitExcluded } from "./origin";
import { FILTER_DEFS, SPEC_PATH_OWNERS } from "./registry";
import { titleTail } from "./words";
import { entityCaptureSpec, NATIONAL_DA_COUNT_SPEC } from "../site-links";
import { DA_PLAFOND_RON } from "../predicates";

/*
 * describeConditions replaces six grammars (plan §2.2, §5 F0). Each output is
 * compared with the frozen grammar it replaces (fixtures/grammars-before-describe.ts)
 * on every spec of the legacy corpus and on edge cases; the only differences
 * allowed are the ones the plan fixes, applied by `fixed` below and listed in
 * the stage notes: numerals through countWords (G10), the labels of selections
 * produced by other pages (§2.6) and exclusions read "Fără X" (§2.8).
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
        expect(describeConditions(spec, { grounding }).pills, JSON.stringify(spec)).toEqual(conditionPillsBefore(spec, grounding).map(fixed));
        if (spec.block === "table" || spec.block === "trend") expect(buildPills(spec, grounding)).toContain(fixed(topPillBefore(spec)));
      }
  });

  it("gives the saved summary, the watch receipt, the caveats and the notes", () => {
    for (const spec of all) {
      if (relabelled(spec)) continue;
      const described = describeConditions(spec);
      expect(described.summary, JSON.stringify(spec)).toEqual(summaryBefore(spec).map(fixed));
      const before = scopeBefore(spec);
      expect(described.scope).toEqual(before.items.map((row) => ({ ...row, value: fixed(row.value) })));
      expect(described.receipt).toEqual(before.receipt);
      expect(described.caveats).toEqual(caveatsBefore(spec).map(fixed));
      const notes = notesBefore(spec);
      expect(described.byId.population?.note ?? null).toEqual(notes.population);
      expect(described.byId.minimumRecords?.note ?? null).toEqual(notes.minimumRecords && fixed(notes.minimumRecords));
    }
  });

  it("gives the builder's chips, and the title and the interpreter the same tail", () => {
    for (const spec of all) {
      if (relabelled(spec)) continue;
      const draft = transitionQuestion(spec as unknown as QuestionSpec).spec;
      for (const cpvName of [undefined, "Lucrări de construcții"]) {
        const { byId } = describeConditions(draft, { cpvName });
        const chips = Object.fromEntries(Object.entries(byId).filter(([, w]) => w.chip !== undefined).map(([id, w]) => [id, w.chip!]));
        expect(chips, JSON.stringify(draft)).toEqual(Object.fromEntries(Object.entries(chipsBefore(draft, cpvName)).map(([id, text]) => [id, fixed(text)])));
      }
      for (const channelSaid of [false, true]) expect(titleTail(spec, channelSaid)).toBe(tailBefore(spec, channelSaid).map((p) => `, ${fixed(p)}`).join(""));
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
          ...Object.values(d.byId).flatMap((w) => [w.chip ?? "", w.note ?? "", w.words ?? ""]), savedQuestionSummary(spec), describeQuestion(spec));
      }
    for (const [exported, total] of [[1, 1], [20, 20], [100_000, 200_000], [100_000, 120_001], [0, 0]] as const) texts.push(sourceCsvMessage(exported, total));
    expect(texts.flatMap(offending)).toEqual([]);
    expect(texts.join(" ")).not.toMatch(/[şţŞŢ]/);
    expect(describeConditions(edge({ filters: { minEmployees: 1 } })).pills).toContain("cel puțin 1 angajat");
    expect(describeConditions(edge({ population: { operator: "and", groups: [{ operator: "and", conditions: [{ field: "cpv", op: "not_in", values: ["45"] }] }] } })).pills).toContain("Selecție precisă · 1 condiție în 1 grup");
    expect(sourceCsvMessage(100_000, 200_000)).toContain("primele 100.000 din 200.000 de înregistrări");
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
    expect(describeConditions(entityCaptureSpec("77")).byId.population?.note).toBe("Activitatea entității: entitatea #77 (ca instituție sau ca firmă).");

    // A comparison group's spec is one CPV division: labelled only by the page that binds the group.
    const peer: AskSpec = { block: "stat", measure: "value", dataset: "all", filters: {}, population: { operator: "and", groups: [{ operator: "and", conditions: [{ field: "cpv", op: "in", values: ["45"] }] }] } };
    expect(describeConditions(peer).byId.population?.note).toBe("Selecție precisă aplicată: (CPV includ 45).");
    expect(describeConditions(peer, { origin: { origin: "peers", members: 29, role: "authority" } }).byId.population?.note).toBe("Grupul de comparație: 29 de instituții · CPV 45.");
    expect(describeConditions(peer, { origin: { origin: "peers", role: "supplier" } }).byId.population?.note).toBe("Grupul de comparație: CPV 45.");
    // A precise selection a person built names its entities: never read as another page's.
    const named: AskSpec = { ...peer, population: { operator: "or", groups: [{ operator: "or", conditions: [{ field: "authority", op: "in", values: ["77"], labels: ["Comuna X"] }, { field: "supplier", op: "in", values: ["77"], labels: ["Comuna X"] }] }] } };
    expect(describeConditions(named).byId.population?.origin).toBeUndefined();
  });

  it("reads exclusions as «Fără X» in the receipt, the title's tail and the total line (plan §2.8, G7, G8)", () => {
    const spec: AskSpec = { block: "table", measure: "value", dim: "supplier", filters: {}, population: { operator: "and", groups: [
      { operator: "and", conditions: [{ field: "supplier", op: "not_in", values: ["202"], labels: ["SYSTRA SA"] }] },
      { operator: "and", conditions: [{ field: "value", op: "gte", value: "1000" }] },
    ] } };
    const d = describeConditions(spec);
    expect(d.scope).toContainEqual({ label: "Scoase din calcul", value: "Fără SYSTRA SA (202)" });
    expect(d.receipt?.groups).toEqual([{ title: "Grupul 1 · toate condițiile", items: ["Valoare de cel puțin 1.000 lei"] }]);
    expect(d.tail).toBe("fără SYSTRA SA");
    expect(d.totalLine).toBe("fără SYSTRA SA, selecție precisă, 1 condiție");
    expect(describeQuestion(spec)).toBe("Cine câștigă contractele de la instituțiile din toată țara, în toți anii, fără SYSTRA SA?");
    // Kept as today: the pills, the caveat and the note describe the whole precise selection.
    expect(d.pills).toContain("Selecție precisă · 2 condiții în 2 grupuri");
    expect(d.byId.population?.note).toBe("Selecție precisă aplicată: (firme exclud SYSTRA SA) ȘI (lei pe înregistrare ≥ 1000).");
    const three = { ...spec, population: { operator: "and" as const, groups: [{ operator: "and" as const, conditions: [{ field: "supplier" as const, op: "not_in" as const, values: ["1", "2", "3"], labels: ["A", "B", "C"] }] }] } };
    expect(describeConditions(three).tail).toBe("fără 3 firme");
    // Unlabelled lists stay a precise selection: their chip could only show a number.
    expect(describeConditions({ ...spec, population: { operator: "and", groups: [{ operator: "and", conditions: [{ field: "supplier", op: "not_in", values: ["202"] }] }] } }).tail).toBe("");
  });
});

describe("the words of every condition", () => {
  it("cover every key of today's engine but the shape of the answer and the ignored comparison mode", () => {
    const implemented = new Set(FILTER_DEFS.filter((def) => Object.keys(def.engine).length).map((def) => def.id));
    const owners = new Set(Object.values(SPEC_PATH_OWNERS).filter((id) => id !== "question" && implemented.has(id)));
    expect(new Set(DESCRIBED_FILTERS)).toEqual(new Set([...owners].filter((id) => !["dim", "measure", "topN", "rankBy"].includes(id))));
  });

  it("give a total line for every selection outside the sentence (G8)", () => {
    expect(describeConditions({ block: "network", measure: "value", filters: { supplierId: 1, supplierName: "X", yearFrom: 2024, yearTo: 2024, cpvTerm: "asfaltare" } }).totalLine)
      .toBe("pentru „asfaltare”, în 2024");
    expect(describeConditions({ block: "stat", measure: "value", dataset: "da", filters: { minEmployees: 1, maxEmployees: 9 } }).totalLine).toBe("firme cu 1–9 angajați, doar achiziții directe");
    expect(describeConditions({ block: "stat", measure: "value", filters: {} }).totalLine).toBeNull();
    // On a firm profile the county is the firm's seat.
    expect(describeConditions({ block: "scatter", measure: "value", dim: "supplier", filters: { county: "Cluj" } }).totalLine).toBe("cu sediul în județul Cluj");
  });

  it("keep the home page's direct-acquisition bound the engine's ceiling", () => {
    expect(DA_BOUND_VALUE).toBe(String(DA_PLAFOND_RON));
    expect(NATIONAL_DA_COUNT_SPEC.population?.groups[0]?.conditions[0]).toMatchObject({ value: DA_BOUND_VALUE });
  });
});
