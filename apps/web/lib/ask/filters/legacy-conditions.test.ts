import { describe, expect, it } from "vitest";
import { localityScopeError } from "../question-ui";
import { parseSpec, runnableError, type AskSpec } from "../spec";
import { FIXTURE_IDENTITIES } from "../fixtures/golden-fixture";
import { legacyCorpus } from "../fixtures/legacy-corpus";
import { formOf } from "./context";
import { advancedConditions, legacyConditions } from "./legacy-conditions";
import { ORIGIN_LABEL, type OriginHint } from "./origin";
import { FILTERS } from "./registry";

/*
 * legacyConditions on the legacy-link corpus (plan §2.6, §6.1 legacy.test.ts):
 * what each old link carries that the plan's questions stop offering, where it
 * comes from and whether the engine applies or refuses it. Pinned entry by
 * entry, so a change of words or status is a deliberate edit here.
 */

const corpus = legacyCorpus(FIXTURE_IDENTITIES).flatMap((entry) => {
  const spec = parseSpec(entry.spec);
  return "error" in spec ? [] : [{ ...entry, spec }];
});
/** The comparison pages bind their group and pass it (lib/peers-evidence.ts peerEvidenceOptions). */
const hintOf = (source: string): OriginHint | undefined => /peers-(shared|evidence-shared)\.ts/.test(source) ? { origin: "peers" } : undefined;
const conditionsOf = (entry: (typeof corpus)[number]) => legacyConditions(entry.spec, { origin: hintOf(entry.source) });
const errorOf = (spec: AskSpec) => runnableError(spec) ?? localityScopeError(spec);

describe("legacy conditions of old links (plan §2.6)", () => {
  it("pins what each link of the corpus carries from an older builder", () => {
    const shown = Object.fromEntries(corpus.map((entry): [string, string[]] => [entry.id, conditionsOf(entry).map((c) => `${c.status} · ${c.label}`)]).filter(([, list]) => list.length));
    expect(shown).toEqual({
      "site:capture-entity": ["applied · Activitatea entității: entitatea #9100000002 (ca instituție sau ca firmă)"],
      "site:connection-evidence": ["applied · Selecția relației: 2 instituții"],
      "site:peer-source": ["applied · Grupul de comparație: CPV 45"],
      "site:peer-evidence": ["applied · Grupul de comparație: CPV 45"],
      // A named institution says no place: the county it carries is the link's (F1b: the question shows what its sentence says).
      "saved:resolved": ["applied · Din link: din județul Cluj"],
      // The threshold counts the ranked role only in "Selecție avansată" (advancedConditions); another role is the link's.
      "legacy:minimum-table-supplier-role": ["applied · Din link: firme cu cel puțin 2 înregistrări în selecție"],
      "legacy:minimum-stat": ["applied · Din link: firme cu cel puțin 3 înregistrări în selecție"],
      "legacy:minimum-map": ["applied · Din link: instituții cu cel puțin 4 înregistrări în selecție"],
      "legacy:minimum-trend-refused": ["refused · Din link: firme cu cel puțin 2 înregistrări în selecție"],
      "legacy:minimum-profile-refused": ["refused · Din link: instituții cu cel puțin 2 înregistrări în selecție"],
      "legacy:single-bidder-stat": ["applied · Din link: doar contracte cu un singur ofertant"],
      "legacy:single-bidder-table": ["applied · Din link: doar contracte cu un singur ofertant"],
      "legacy:employees-under-5": ["applied · Din link: firme cu cel mult 4 angajați"],
      "legacy:contracts-distribution-refused": ["refused · Din link: doar contracte din proceduri"],
      "legacy:contracts-scatter-refused": ["refused · Din link: doar contracte din proceduri"],
      // The trend says no person (plan §4.7): applied, as a chip.
      "legacy:admin-trend": ["applied · Din link: firmele conduse azi de POPESCU FIXTURE ION"],
      "legacy:months-trend-refused": ["refused · Din link: în ian. 2024 – iun. 2025"],
      "legacy:locality-map-refused": ["refused · Din link: primăria Aiud (Alba)"],
      "legacy:profile-years-refused": ["refused · Din link: în 2025"],
      "legacy:profile-firm-kind-refused": ["refused · Din link: doar spitale"],
      "combo:table:employees": ["applied · Din link: firme cu 10–500 de angajați"],
      "combo:table:single-bidder": ["applied · Din link: doar contracte cu un singur ofertant"],
      // The map's buyers are kinds (plan §4.4), and it offers no firm size.
      "combo:map:buyer": ["applied · Din link: instituția „Municipiul Fixture Nord”"],
      "combo:map:employees-year": ["applied · Din link: firme cu cel puțin 1 angajat"],
      // "Spitale" waits for D1 on "Cine conduce?" (sentence.ts KINDS_AFTER_D1).
      "combo:entity_card:risk-kind": ["applied · Din link: doar spitale"],
    });
  });

  it("never shows a link of the site as «Din link»: its pages have their own labels", () => {
    const site = corpus.filter((entry) => entry.origin === "site");
    expect(site.length).toBeGreaterThan(30);
    expect(site.flatMap((entry) => conditionsOf(entry).filter((c) => c.origin === "link").map((c) => `${entry.id}: ${c.label}`))).toEqual([]);
    // The home page's direct-acquisition count states the ceiling itself: no chip, and the spec is not rewritten.
    expect(conditionsOf(corpus.find((entry) => entry.id === "site:home-da-count")!)).toEqual([]);
  });

  it("refuses only what the engine refuses, and applies only what it applies", () => {
    for (const entry of corpus)
      for (const c of conditionsOf(entry)) {
        expect(c.words, entry.id).not.toBe("");
        expect(c.label === `Din link: ${c.words}` || Object.values(ORIGIN_LABEL).some((label) => c.label === `${label}: ${c.words}`), c.label).toBe(true);
        expect(`${c.label} ${c.reason ?? ""}`).not.toMatch(/[şţŞŢ]/);
        if (c.status === "refused") expect(c.reason, entry.id).toBeTruthy();
        else expect(FILTERS[c.key].engine[formOf(entry.spec)], `${entry.id} ${c.key}`).toBeDefined();
      }
    // A refusal that is the question's own (a missing entity, a degenerate ranking on its axis) has no chip.
    for (const entry of corpus) {
      const refused = conditionsOf(entry).filter((c) => c.status === "refused");
      if (refused.length) expect(errorOf(entry.spec), entry.id).not.toBeNull();
    }
  });
});

describe("the chips of «Selecție avansată» (plan §1.1 variant A, P9)", () => {
  const advancedOf = (entry: (typeof corpus)[number]) => advancedConditions(entry.spec, { origin: hintOf(entry.source) });

  it("are the precise selections and the ranked role's thresholds the question's P9 offers", () => {
    const shown = Object.fromEntries(corpus.map((entry): [string, string[]] => [entry.id, advancedOf(entry).map((c) => c.label)]).filter(([, list]) => list.length));
    expect(shown).toEqual({
      "legacy:minimum-table-authority-role": ["Selecție avansată: instituții cu cel puțin 3 înregistrări în selecție"],
      "legacy:minimum-leader-value": ["Selecție avansată: firme cu cel puțin 5 înregistrări în selecție"],
      "legacy:population-exclude-cpv": ["Selecție avansată: selecție precisă, 1 condiție"],
      "legacy:population-exclude-firm": ["Selecție avansată: selecție precisă, 1 condiție"],
      "legacy:population-include-buyers": ["Selecție avansată: selecție precisă, 1 condiție"],
      "legacy:population-counties": ["Selecție avansată: selecție precisă, 1 condiție"],
      "legacy:population-date-value": ["Selecție avansată: selecție precisă, 3 condiții"],
      "legacy:population-or-groups": ["Selecție avansată: selecție precisă, 4 condiții"],
      "legacy:population-on-trend": ["Selecție avansată: selecție precisă, 1 condiție"],
    });
  });

  it("never repeat a link's chip, a page's selection or an exclusion", () => {
    for (const entry of corpus) {
      const legacy = new Set(conditionsOf(entry).map((c) => c.key));
      for (const c of advancedOf(entry)) expect(legacy.has(c.key), `${entry.id} ${c.key}`).toBe(false);
    }
    // Labelled exclusions are "Fără X" chips (kit §5.15); the rest of the selection is P9's.
    const spec = { block: "stat", measure: "value", filters: {}, population: { operator: "and", groups: [
      { operator: "and", conditions: [{ field: "supplier", op: "not_in", values: ["202"], labels: ["SYSTRA SA"] }] },
    ] } } as unknown as AskSpec;
    expect([advancedConditions(spec), legacyConditions(spec)]).toEqual([[], []]);
  });
});
