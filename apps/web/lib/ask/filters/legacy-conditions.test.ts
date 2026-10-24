import { describe, expect, it } from "vitest";
import { localityScopeError } from "../question-ui";
import { parseSpec, runnableError, type AskSpec } from "../spec";
import { FIXTURE_IDENTITIES } from "../fixtures/golden-fixture";
import { legacyCorpus } from "../fixtures/legacy-corpus";
import { formOf } from "./context";
import { legacyConditions } from "./legacy-conditions";
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
    const shown = Object.fromEntries(corpus.map((entry) => [entry.id, conditionsOf(entry).map((c) => `${c.status} · ${c.label}`)]).filter(([, list]) => list.length));
    expect(shown).toEqual({
      "site:capture-entity": ["applied · Activitatea entității: entitatea #9100000002 (ca instituție sau ca firmă)"],
      "site:connection-evidence": ["applied · Selecția relației: 2 instituții"],
      "site:peer-source": ["applied · Grupul de comparație: CPV 45"],
      "site:peer-evidence": ["applied · Grupul de comparație: CPV 45"],
      "legacy:minimum-table-supplier-role": ["applied · Din link: firme cu cel puțin 2 înregistrări în selecție"],
      "legacy:minimum-table-authority-role": ["applied · Din link: instituții cu cel puțin 3 înregistrări în selecție"],
      "legacy:minimum-stat": ["applied · Din link: firme cu cel puțin 3 înregistrări în selecție"],
      "legacy:minimum-map": ["applied · Din link: instituții cu cel puțin 4 înregistrări în selecție"],
      "legacy:minimum-leader-value": ["applied · Din link: firme cu cel puțin 5 înregistrări în selecție"],
      "legacy:minimum-trend-refused": ["refused · Din link: firme cu cel puțin 2 înregistrări în selecție"],
      "legacy:minimum-profile-refused": ["refused · Din link: instituții cu cel puțin 2 înregistrări în selecție"],
      "legacy:single-bidder-stat": ["applied · Din link: doar contracte cu un singur ofertant"],
      "legacy:single-bidder-table": ["applied · Din link: doar contracte cu un singur ofertant"],
      "legacy:employees-under-5": ["applied · Din link: firme cu cel mult 4 angajați"],
      "legacy:contracts-distribution-refused": ["refused · Din link: doar contracte din proceduri"],
      "legacy:contracts-scatter-refused": ["refused · Din link: doar contracte din proceduri"],
      "legacy:population-exclude-cpv": ["applied · Din link: selecție precisă, 1 condiție"],
      "legacy:population-exclude-firm": ["applied · Din link: selecție precisă, 1 condiție"],
      "legacy:population-include-buyers": ["applied · Din link: selecție precisă, 1 condiție"],
      "legacy:population-counties": ["applied · Din link: selecție precisă, 1 condiție"],
      "legacy:population-date-value": ["applied · Din link: selecție precisă, 3 condiții"],
      "legacy:population-or-groups": ["applied · Din link: selecție precisă, 4 condiții"],
      "legacy:population-on-trend": ["applied · Din link: selecție precisă, 1 condiție"],
      "legacy:months-trend-refused": ["refused · Din link: în perioada 2024-01–2025-06"],
      "legacy:locality-map-refused": ["refused · Din link: primăria mun. Aiud (Alba)"],
      "legacy:profile-years-refused": ["refused · Din link: în 2025"],
      "legacy:profile-firm-kind-refused": ["refused · Din link: doar spitale"],
      "combo:table:employees": ["applied · Din link: firme cu 10–500 de angajați"],
      "combo:table:single-bidder": ["applied · Din link: doar contracte cu un singur ofertant"],
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
