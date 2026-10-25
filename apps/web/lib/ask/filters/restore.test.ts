import { describe, expect, it } from "vitest";
import { localityScopeError } from "../question-ui";
import { NEWER_VERSION_LINK, parseSpec, runnableError, unimplementedSpecKeys, validateSpec, type AskSpec } from "../spec";
import { FIXTURE_IDENTITIES } from "../fixtures/golden-fixture";
import { legacyCorpus } from "../fixtures/legacy-corpus";
import { INVALID_LINK, restoreLink, withoutLinkConditions } from "./restore";

/*
 * Opening a link in the builder (plan §2.4, §2.6): every link of the corpus,
 * plus the shapes that must stay errors. What runs today runs as it is; a
 * refused condition opens the builder with its chip and reason, and removing
 * the refused chips is enough to run it, unless the question itself still
 * needs an input.
 */

const corpus = legacyCorpus(FIXTURE_IDENTITIES);
const errorOf = (spec: AskSpec) => runnableError(spec) ?? localityScopeError(spec);

describe("a link opened in the builder", () => {
  it("is an error only when its shape is, or when it comes from a newer release (F0a)", () => {
    for (const entry of corpus) {
      const restored = restoreLink(entry.spec), parsed = parseSpec(entry.spec);
      if ("error" in parsed) expect(restored, entry.id).toEqual({ kind: "error", error: INVALID_LINK });
      else if (unimplementedSpecKeys(parsed).length) expect(restored, entry.id).toEqual({ kind: "error", error: NEWER_VERSION_LINK, newer: true });
      else expect(restored.kind, entry.id).toBe("draft");
    }
    expect(restoreLink({ block: "table", measure: "value", filters: {}, colour: "red" })).toEqual({ kind: "error", error: INVALID_LINK });
    expect(restoreLink({ block: "timeseries", measure: "value", filters: {}, timeseries: { grain: "month" } })).toEqual({ kind: "error", error: NEWER_VERSION_LINK, newer: true });
    expect(restoreLink({ block: "trend", measure: "value", filters: {}, trend: { change: "up" } }).kind).toBe("draft");
  });

  it("runs exactly what /api/ask runs today, keeping the stream the link names", () => {
    let runs = 0;
    for (const entry of corpus) {
      const restored = restoreLink(entry.spec);
      if (restored.kind !== "draft") continue;
      const today = validateSpec(entry.spec);
      expect(restored.run, entry.id).toBe(!("error" in today) && localityScopeError(today) === null);
      if (restored.run) runs++;
      // A link the builder repaired (a measure only rankings of institutions have) waits, with the note that says so.
      else if (restored.reason === null) expect(restored.notes.length, entry.id).toBeGreaterThan(0);
    }
    expect(runs).toBeGreaterThan(150);
    const named = restoreLink({ block: "stat", measure: "value", dataset: "all", filters: {} });
    expect(named.kind === "draft" && named.spec.dataset).toBe("all");
  });

  it("opens a refused link with the chips that cause the refusal; removing them runs it", () => {
    let refusedLinks = 0;
    for (const entry of corpus) {
      const restored = restoreLink(entry.spec);
      if (restored.kind !== "draft" || restored.reason === null) continue;
      const refused = restored.conditions.filter((c) => c.status === "refused");
      for (const c of refused) expect(c.reason, `${entry.id} ${c.key}`).toBe(restored.reason);
      const cleared = withoutLinkConditions(restored.spec, refused);
      const left = errorOf(cleared.spec as unknown as AskSpec);
      if (refused.length) {
        refusedLinks++;
        expect(left, entry.id).toBeNull();
      } else {
        // Not a chip's: the question's own input (an entity to choose, two years), asked by the builder.
        expect(left, entry.id).toBe(restored.reason);
      }
    }
    expect(refusedLinks).toBeGreaterThanOrEqual(8);
  });

  it("says why on each refused chip, in the engine's words", () => {
    const trend = restoreLink(corpus.find((entry) => entry.id === "legacy:minimum-trend-refused")!.spec);
    expect(trend.kind === "draft" && [trend.run, trend.conditions.map((c) => [c.label, c.status])]).toEqual([false, [["Din link: firme cu cel puțin 2 înregistrări în selecție", "refused"]]]);
    expect(trend.kind === "draft" && trend.reason).toMatch(/^Filtrul «cel puțin N înregistrări»/);
    // The chip says it short, like a profile's (S2 review, problem 4).
    expect(trend.kind === "draft" && trend.conditions[0]!.why).toBe("Un prag de înregistrări nu se aplică diferenței dintre doi ani.");
    const profile = restoreLink(corpus.find((entry) => entry.id === "legacy:profile-years-refused")!.spec);
    expect(profile.kind === "draft" && profile.conditions.map((c) => c.label)).toEqual(["Din link: în 2025"]);
    // A precise selection a question's "Selecție avansată" offers is that place's chip, not the link's.
    const population = restoreLink(corpus.find((entry) => entry.id === "legacy:population-counties")!.spec);
    expect(population.kind === "draft" && [population.conditions, population.advanced.map((c) => c.label)]).toEqual([[], ["Selecție avansată: doar județele Cluj, Buzău"]]);
  });
});
