import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { questionKey, transitionQuestion } from "../question-ui";
import { NEWER_VERSION_LINK, validateSpec, type Block } from "../spec";
import { legacyCorpus } from "../fixtures/legacy-corpus";
import { FIXTURE_IDENTITIES } from "../fixtures/golden-fixture";
import { filterContext, formOf } from "./context";
import { baseQuestions, builderErrors, engineError, offersOn, refusalKind } from "./probe";
import { FILTER_DEFS, FILTERS, offeredFilters, placedSlots, unofferedPaths } from "./registry";
import { refusalOf, todayAvailability, TODAY_IGNORED_OFFERS, TODAY_REFUSALS } from "./today";
import { TODAY_BLOCK_FILTERS } from "./today-blocks";
import type { FilterSpec } from "./types";

/*
 * Today's builder (QuestionBuilder.tsx), as F0 described it (plan §2.2, §6.1):
 * every choice it offers and every pair of choices, walked against the engine,
 * finds TODAY_REFUSALS. It keeps describing that code until the builder
 * renders from BLOCK_FILTERS (F1b's offers, registry.test.ts); then this file
 * and today-blocks.ts leave with it.
 */

const YEAR = 2026;
const T = TODAY_BLOCK_FILTERS;
const ctxOf = (spec: FilterSpec) => filterContext(spec, { year: YEAR });
const bases = baseQuestions(YEAR);
/** Questions as old links, saved questions and other pages open them, where the builder can run them as they are. */
const restored = legacyCorpus(FIXTURE_IDENTITIES).flatMap((entry) => {
  const parsed = validateSpec(entry.spec, { refuseNewer: NEWER_VERSION_LINK });
  if ("error" in parsed) return [];
  const spec = transitionQuestion(parsed as unknown as FilterSpec).spec as FilterSpec;
  return builderErrors(spec).length ? [] : [{ id: entry.id, origin: entry.origin, spec }];
});

/** Every choice from each catalogue question and, one more, from each of its results; one choice from each restored question. */
function walk() {
  const problems: string[] = [];
  const hits = new Map<string, number>();
  const visited = new Set<string>();
  let singles = 0, pairs = 0, accepted = 0;
  const visit = (from: FilterSpec, deeper: boolean) => {
    const ctx = ctxOf(from);
    for (const offer of offersOn(from, ctx, T)) {
      deeper ? singles++ : pairs++;
      const errors = builderErrors(offer.to);
      const declared = refusalOf(offer.filter, offer.value, from, ctx);
      const where = `${ctx.form} ${offer.filter}${offer.picker ? " (focal)" : ""} = ${JSON.stringify(offer.value)} on ${questionKey(from)}`;
      if (!errors.length) {
        accepted++;
        if (declared) problems.push(`declared ${declared.id}, accepted: ${where}`);
        // What the builder runs, /api/ask runs too.
        const engine = engineError(offer.to);
        if (engine) problems.push(`builder accepts, engine refuses (${engine}): ${where}`);
        const key = questionKey(offer.to);
        if (deeper && !visited.has(key)) { visited.add(key); visit(offer.to, false); }
        continue;
      }
      if (!declared) { problems.push(`refused, not declared (${errors[0]}): ${where}`); continue; }
      if (declared.kind !== refusalKind(errors)) problems.push(`${declared.id} is ${declared.kind}, the builder says ${errors.join(" / ")}: ${where}`);
      if (!errors.some((error) => error.startsWith(declared.reason))) problems.push(`${declared.id}: "${declared.reason}" not in ${errors.join(" / ")}: ${where}`);
      hits.set(declared.id, (hits.get(declared.id) ?? 0) + 1);
    }
  };
  for (const base of bases) {
    expect(builderErrors(base.spec), base.name).toEqual([]);
    visit(base.spec, true);
  }
  for (const entry of restored) {
    const ctx = ctxOf(entry.spec);
    for (const offer of offersOn(entry.spec, ctx, T)) {
      singles++;
      const errors = builderErrors(offer.to);
      const declared = refusalOf(offer.filter, offer.value, entry.spec, ctx);
      if (Boolean(errors.length) !== Boolean(declared)) problems.push(`${entry.id}: ${offer.filter} = ${JSON.stringify(offer.value)} ${errors.length ? `refused (${errors[0]}), not declared` : `accepted, declared ${declared!.id}`}`);
      else if (declared) hits.set(declared.id, (hits.get(declared.id) ?? 0) + 1);
    }
  }
  return { problems, hits, singles, pairs, accepted };
}

describe("today's builder: what it offers, the engine refuses (TODAY_REFUSALS)", () => {
  let result: ReturnType<typeof walk>;
  beforeAll(() => { result = walk(); });

  it("walks every offered choice and every pair of choices", () => {
    expect(result.singles).toBeGreaterThan(5_000);
    expect(result.pairs).toBeGreaterThan(100_000);
  });

  it("finds a refusal exactly where TODAY_REFUSALS marks one, with its message", () => {
    expect(result.problems.slice(0, 20)).toEqual([]);
  });

  it("finds each marked refusal at least once", () => {
    expect(TODAY_REFUSALS.filter((r) => !result.hits.has(r.id)).map((r) => r.id)).toEqual([]);
  });

  // The list F1b removes (stage notes, F0-registry.md; registry.test.ts checks each fix).
  it("marks these offers as refused by the engine", () => {
    expect(TODAY_REFUSALS.filter((r) => r.kind === "engine").map((r) => `${r.id}: ${r.filter}`)).toEqual([
      "trend-threshold: minimumRecords", "profile-threshold: minimumRecords", "profile-population: population", "profile-contracts: dataset",
      "risk-records: rankBy", "risk-named: rankBy", "risk-firm-buyer: rankBy", "risk-locality: rankBy",
      "firm-profile-buyer: dim", "firm-focal-buyer: supplier", "county-ranking: dim", "ranking-pair: authority", "ranking-pair-firm: supplier",
    ]);
  });
});

describe("today's availability", () => {
  const base = (name: string) => bases.find((b) => b.name === name)!.spec;
  const withFilters = (spec: FilterSpec, filters: FilterSpec["filters"]) => ({ ...spec, filters: { ...spec.filters, ...filters } });

  it("says offered, refused or hidden, as the builder offers today", () => {
    expect(todayAvailability("cpvTerm", base("table firms"))).toEqual({ state: "offered" });
    expect(todayAvailability("cpvTerm", base("scatter institutions"))).toEqual({ state: "hidden" });
    expect(todayAvailability("county", base("scatter institutions"))).toEqual({ state: "offered" });
    expect(todayAvailability("minimumRecords", base("trend firms"))).toEqual({ state: "refused", reason: TODAY_REFUSALS[0]!.reason, refusal: "trend-threshold", partial: true });
    expect(todayAvailability("population", base("trend firms"))).toEqual({ state: "offered" });
    expect(todayAvailability("dataset", base("scatter firms"))).toMatchObject({ state: "refused", refusal: "profile-contracts", partial: true });
    expect(todayAvailability("rankBy", withFilters(base("leader value institutions"), { cpvTerm: "medicamente" }))).toMatchObject({ state: "refused", refusal: "risk-records", partial: true });
    expect(todayAvailability("rankBy", base("leader value institutions"))).toEqual({ state: "offered" });
    expect(todayAvailability("dim", withFilters(base("table firms"), { county: "Cluj" }))).toMatchObject({ state: "refused", refusal: "county-ranking", partial: true });
    expect(todayAvailability("minimumRecords", base("compare institutions"))).toEqual({ state: "hidden" });
    expect(todayAvailability("locality", base("map"))).toEqual({ state: "hidden" });
    // The focal picker offers both roles; changing the role empties the second entity (an input, not a refusal).
    expect(todayAvailability("supplier", base("compare institutions"))).toEqual({ state: "offered" });
  });

  it("is hidden exactly when no control of the question writes the filter", () => {
    for (const { spec } of [...bases, ...restored.slice(0, 60)]) {
      const ctx = ctxOf(spec), offered = offeredFilters(spec, ctx, T);
      for (const def of FILTER_DEFS) expect(todayAvailability(def.id, spec, ctx).state === "hidden", `${def.id} on ${questionKey(spec)}`).toBe(!offered.has(def.id));
    }
  });

  it("offers no control whose key the engine ignores there, except those listed", () => {
    const ignored = new Set<string>();
    const problems: string[] = [];
    for (const { spec } of [...bases, ...restored]) {
      const ctx = ctxOf(spec);
      for (const id of offeredFilters(spec, ctx, T)) {
        if (FILTERS[id].engine[ctx.form] !== undefined) continue;
        if (TODAY_IGNORED_OFFERS.some((o) => o.filter === id && o.forms.includes(ctx.form))) { ignored.add(`${id} ${ctx.form}`); continue; }
        // Otherwise every value its control offers is refused (TODAY_REFUSALS) or removes it.
        const unrefused = FILTERS[id].choices(spec, ctx).filter((value) => value !== undefined && !refusalOf(id, value, spec, ctx));
        if (unrefused.length) problems.push(`${id} on ${ctx.form}: ${JSON.stringify(unrefused)}`);
      }
    }
    expect(problems).toEqual([]);
    expect([...ignored].sort()).toEqual(["dataset distribution", "dataset entity_card:risk", "dataset scatter"]);
  });
});

describe("today's places", () => {
  const states = [...bases, ...restored];

  it("has one entry for each of the 13 questions", () => {
    expect(Object.keys(T).sort()).toEqual(([...new Set(bases.map((b) => b.spec.block))] as Block[]).sort());
  });

  it("names only registered filters, in the places the builder has today, without condition rows", () => {
    for (const { spec } of states) {
      const ctx = ctxOf(spec);
      for (const { placement, slot } of placedSlots(spec, ctx, T)) {
        expect(FILTERS[slot.id], slot.id).toBeDefined();
        for (const id of slot.writes ?? []) expect(FILTERS[id], id).toBeDefined();
        expect(["sentence", "invite", "under", "presentation", "advanced"]).toContain(placement);
      }
      expect(T[ctx.block].rows(spec, ctx)).toEqual([]);
    }
  });

  it("shows the profile badge on the three profiles only", () => {
    for (const { spec } of states) {
      const ctx = ctxOf(spec);
      expect(T[ctx.block].scopeLine(spec, ctx), questionKey(spec)).toBe(["distribution", "scatter", "entity_card:risk"].includes(formOf(spec)) ? "historical-da" : null);
    }
  });

  // Today a phrase, a chip or "Mai multe filtre" offers every condition a link applies, so none needs
  // an origin label. BLOCK_FILTERS offers less: those are what legacyConditions labels (restore.test.ts).
  it("carries no applied condition of a link its question does not offer", () => {
    const unoffered = restored.flatMap((entry) => unofferedPaths(entry.spec, ctxOf(entry.spec), T).filter((u) => u.applied).map((u) => `${entry.id}: ${u.path}`));
    expect(unoffered).toEqual([]);
    expect(restored.filter((entry) => entry.origin === "site").length).toBeGreaterThan(30);
  });
});

describe("the builder it describes", () => {
  // TODAY_BLOCK_FILTERS, the defs and today.ts describe this code; the walk above checks them against the
  // engine. A change to the builder's offers changes this hash: describe it there, then update the hash.
  // F0-describe: the chips take their words from describeConditions; the offers are the same.
  it("is the QuestionBuilder of F0", () => {
    const source = readFileSync(new URL("../../../app/intreaba/QuestionBuilder.tsx", import.meta.url), "utf8");
    const between = (from: string, to: string) => {
      const start = source.indexOf(from), end = source.indexOf(to, start);
      expect(start >= 0 && end > start, `${from} … ${to}`).toBe(true);
      return source.slice(start, end);
    };
    const offers = [
      between("const FIELDS", "function Glyph"),
      between("function updateFilter", "async function apply"),
      between("const namedAuthority =", "const catalogResults"),
      between("function pickLocality", "function optionList"),
      between("function submitBounds", "const navigation"),
      ...source.split("\n").filter((line) => line.includes("cq-more-filters") || line.includes("qb-presentation")),
    ].join("\n");
    expect(createHash("sha256").update(offers).digest("hex")).toBe("d54bf559ca023d5d9d38c8300953ce53bbfcb5b7257d8f6b3f0893654bcf8219");
  });
});
