import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { defaultQuestion, questionKey, transitionQuestion } from "../question-ui";
import { IMPLEMENTED_KEYS, NEWER_VERSION_LINK, parseSpec, READ_AHEAD_KEYS, unimplementedSpecKeys, validateSpec, type Block } from "../spec";
import { legacyCorpus } from "../fixtures/legacy-corpus";
import { FIXTURE_IDENTITIES } from "../fixtures/golden-fixture";
import { BLOCK_FILTERS } from "./blocks";
import { filterContext, formOf } from "./context";
import { baseQuestions, builderErrors, engineError, offersOn, refusalKind } from "./probe";
import { availability, FILTER_DEFS, FILTERS, offeredFilters, placedSlots, SPEC_PATH_OWNERS, unofferedPaths } from "./registry";
import { refusalOf, SCOPE_CHANGES, TODAY_IGNORED_OFFERS, TODAY_REFUSALS, TODAY_SCOPE } from "./today";
import type { FilterId, FilterSpec } from "./types";

// The filter registry's contract (plan §2.1, §2.2, §6.1), on the builder of today.

const YEAR = 2026;
const ctxOf = (spec: FilterSpec) => filterContext(spec, { year: YEAR });
const isImplemented = (id: FilterId) => FILTERS[id].keys.length > 0 && FILTERS[id].keys.every((key) => IMPLEMENTED_KEYS.has(key));
const bases = baseQuestions(YEAR);
/** Questions as old links, saved questions and other pages open them, where the builder can run them as they are. */
const restored = legacyCorpus(FIXTURE_IDENTITIES).flatMap((entry) => {
  const parsed = validateSpec(entry.spec, { refuseNewer: NEWER_VERSION_LINK });
  if ("error" in parsed) return [];
  const spec = transitionQuestion(parsed as unknown as FilterSpec).spec as FilterSpec;
  return builderErrors(spec).length ? [] : [{ id: entry.id, origin: entry.origin, spec }];
});

describe("one owner for every key (R2)", () => {
  it("gives each path of AskSpec to exactly one filter", () => {
    const owned = FILTER_DEFS.flatMap((def) => def.keys.map((key) => [key, def.id] as const));
    expect(new Set(FILTER_DEFS.map((def) => def.id)).size).toBe(FILTER_DEFS.length);
    expect(new Set(owned.map(([key]) => key)).size).toBe(owned.length);
    expect(Object.fromEntries(owned)).toEqual(Object.fromEntries(Object.entries(SPEC_PATH_OWNERS).filter(([, owner]) => owner !== "question")));
  });

  it("owns every path parseSpec reads: the engine's and those read ahead", () => {
    const read = [...IMPLEMENTED_KEYS, ...Object.keys(READ_AHEAD_KEYS)]
      .filter((path) => path !== "options.members") // a watch's, not the spec's
      .map((path) => path === "filters.authorityKind=local_admin" ? "filters.authorityKind" : path);
    expect([...new Set(read)].sort()).toEqual(Object.keys(SPEC_PATH_OWNERS).sort());
  });
});

describe("keys read ahead of the engine (F0a)", () => {
  const ahead = FILTER_DEFS.filter((def) => def.stage !== undefined);

  it("are the filters with a key outside IMPLEMENTED_KEYS, applied nowhere, each with its stage", () => {
    expect(ahead.map((def) => def.id).sort()).toEqual(FILTER_DEFS.filter((def) => def.viewOf || def.keys.some((key) => !IMPLEMENTED_KEYS.has(key))).map((def) => def.id).sort());
    for (const def of ahead) {
      expect(def.engine, def.id).toEqual({});
      for (const key of def.keys) expect(READ_AHEAD_KEYS[key as keyof typeof READ_AHEAD_KEYS], `${def.id} ${key}`).toBe(def.stage);
    }
  });

  it.each(ahead.filter((def) => def.sample).map((def) => [def.id, def] as const))("%s parses on its question and is refused as newer", (_id, def) => {
    const sample = def.sample!;
    const start = transitionQuestion(defaultQuestion(), sample.block).spec as FilterSpec;
    const base = { ...start, ...sample.base, filters: { ...start.filters, ...sample.base?.filters } } as FilterSpec;
    const spec = def.write(base, sample.value);
    expect(def.read(spec)).toEqual(sample.value);
    expect("error" in parseSpec(spec), JSON.stringify(parseSpec(spec))).toBe(false);
    const present = def.keys.filter((key) => presentKey(spec, key));
    expect(present.length).toBeGreaterThan(0);
    expect(unimplementedSpecKeys(spec)).toEqual(expect.arrayContaining(present));
    expect(validateSpec(spec, { refuseNewer: NEWER_VERSION_LINK })).toEqual({ error: NEWER_VERSION_LINK, newer: true });
    expect(def.read(def.write(spec, undefined))).toBeUndefined();
  });

  it("are offered on no question, nor any filter the engine does not apply today", () => {
    const offeredAhead: string[] = [];
    for (const { spec } of [...bases, ...restored])
      for (const { slot } of placedSlots(spec, ctxOf(spec)))
        for (const id of [slot.id, ...(slot.writes ?? [])]) if (!isImplemented(id)) offeredAhead.push(`${spec.block} ${id}`);
    expect(offeredAhead).toEqual([]);
    for (const def of ahead) for (const { spec } of bases) expect(availability(def.id, spec, ctxOf(spec)), def.id).toEqual({ state: "hidden" });
  });
});

function presentKey(spec: FilterSpec, key: string): boolean {
  const [head, sub] = key.split(".") as [string, string];
  const holder = head === "filters" ? spec.filters : (spec as unknown as Record<string, Record<string, unknown> | undefined>)[head];
  return holder?.[sub] !== undefined;
}

describe("today's scope of each key (TODAY_SCOPE, plan §2.2)", () => {
  it("is fixed for every key the engine applies, on each question it applies it to", () => {
    const applied = FILTER_DEFS.filter((def) => Object.keys(def.engine).length > 0);
    expect(Object.keys(TODAY_SCOPE).sort()).toEqual(applied.map((def) => def.id).sort());
    const changed: string[] = [];
    for (const def of applied) {
      const today = TODAY_SCOPE[def.id]!;
      // Support is never withdrawn from a question silently.
      for (const form of Object.keys(today)) expect(def.engine[form as keyof typeof def.engine], `${def.id} on ${form}`).toBeDefined();
      for (const [form, scope] of Object.entries(today))
        if (def.scope(form as keyof typeof today) !== scope && !SCOPE_CHANGES.some((c) => c.filter === def.id && c.form === form))
          changed.push(`${def.id} on ${form}: ${scope} → ${def.scope(form as keyof typeof today)}`);
    }
    // A key that moves from the records to a group needs its answer version (plan §2.6).
    expect(changed).toEqual([]);
    for (const change of SCOPE_CHANGES) expect(FILTERS[change.filter].scope(change.form)).not.toBe(TODAY_SCOPE[change.filter]?.[change.form]);
  });

  it("has no group key today: every condition of the engine is a selection or display", () => {
    const groups = Object.entries(TODAY_SCOPE).flatMap(([id, forms]) => Object.entries(forms).filter(([, scope]) => scope === "group").map(([form]) => `${id} on ${form}`));
    expect(groups).toEqual([]);
  });
});

/** Every choice from each catalogue question and, one more, from each of its results; one choice from each restored question. */
function walk() {
  const problems: string[] = [];
  const hits = new Map<string, number>();
  const visited = new Set<string>();
  let singles = 0, pairs = 0, accepted = 0;
  const visit = (from: FilterSpec, deeper: boolean) => {
    const ctx = ctxOf(from);
    for (const offer of offersOn(from, ctx)) {
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
    for (const offer of offersOn(entry.spec, ctx)) {
      singles++;
      const errors = builderErrors(offer.to);
      const declared = refusalOf(offer.filter, offer.value, entry.spec, ctx);
      if (Boolean(errors.length) !== Boolean(declared)) problems.push(`${entry.id}: ${offer.filter} = ${JSON.stringify(offer.value)} ${errors.length ? `refused (${errors[0]}), not declared` : `accepted, declared ${declared!.id}`}`);
      else if (declared) hits.set(declared.id, (hits.get(declared.id) ?? 0) + 1);
    }
  }
  return { problems, hits, singles, pairs, accepted };
}

describe("R1: what a question offers, the engine accepts (plan §2.1)", () => {
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

  // The list F1b removes (stage notes, F0-registry.md); a new entry is a new R1 violation of today's builder.
  it("marks these offers as refused by the engine", () => {
    expect(TODAY_REFUSALS.filter((r) => r.kind === "engine").map((r) => `${r.id}: ${r.filter}`)).toEqual([
      "trend-threshold: minimumRecords", "profile-threshold: minimumRecords", "profile-population: population", "profile-contracts: dataset",
      "risk-records: rankBy", "risk-named: rankBy", "risk-firm-buyer: rankBy", "risk-locality: rankBy",
      "firm-profile-buyer: dim", "firm-focal-buyer: supplier", "county-ranking: dim", "ranking-pair: authority", "ranking-pair-firm: supplier",
    ]);
  });
});

describe("availability (plan §2.2)", () => {
  const base = (name: string) => bases.find((b) => b.name === name)!.spec;
  const withFilters = (spec: FilterSpec, filters: FilterSpec["filters"]) => ({ ...spec, filters: { ...spec.filters, ...filters } });

  it("says offered, refused or hidden, as the builder offers today", () => {
    expect(availability("cpvTerm", base("table firms"))).toEqual({ state: "offered" });
    expect(availability("cpvTerm", base("scatter institutions"))).toEqual({ state: "hidden" });
    expect(availability("county", base("scatter institutions"))).toEqual({ state: "offered" });
    expect(availability("minimumRecords", base("trend firms"))).toEqual({ state: "refused", reason: TODAY_REFUSALS[0]!.reason, refusal: "trend-threshold", partial: true });
    expect(availability("population", base("trend firms"))).toEqual({ state: "offered" });
    expect(availability("dataset", base("scatter firms"))).toMatchObject({ state: "refused", refusal: "profile-contracts", partial: true });
    expect(availability("rankBy", withFilters(base("leader value institutions"), { cpvTerm: "medicamente" }))).toMatchObject({ state: "refused", refusal: "risk-records", partial: true });
    expect(availability("rankBy", base("leader value institutions"))).toEqual({ state: "offered" });
    expect(availability("dim", withFilters(base("table firms"), { county: "Cluj" }))).toMatchObject({ state: "refused", refusal: "county-ranking", partial: true });
    expect(availability("minimumRecords", base("compare institutions"))).toEqual({ state: "hidden" });
    expect(availability("locality", base("map"))).toEqual({ state: "hidden" });
    // The focal picker offers both roles; changing the role empties the second entity (an input, not a refusal).
    expect(availability("supplier", base("compare institutions"))).toEqual({ state: "offered" });
  });

  it("is hidden exactly when no control of the question writes the filter", () => {
    for (const { spec } of [...bases, ...restored.slice(0, 60)]) {
      const ctx = ctxOf(spec), offered = offeredFilters(spec, ctx);
      for (const def of FILTER_DEFS) expect(availability(def.id, spec, ctx).state === "hidden", `${def.id} on ${questionKey(spec)}`).toBe(!offered.has(def.id));
    }
  });

  it("offers no control whose key the engine ignores there, except those listed", () => {
    const ignored = new Set<string>();
    const problems: string[] = [];
    for (const { spec } of [...bases, ...restored]) {
      const ctx = ctxOf(spec);
      for (const id of offeredFilters(spec, ctx)) {
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

describe("places (BLOCK_FILTERS)", () => {
  const states = [...bases, ...restored];

  it("has one entry for each of the 13 questions", () => {
    expect(Object.keys(BLOCK_FILTERS).sort()).toEqual(([...new Set(bases.map((b) => b.spec.block))] as Block[]).sort());
  });

  it("names only registered filters, in the places the builder has today", () => {
    for (const { spec } of states)
      for (const { placement, slot } of placedSlots(spec, ctxOf(spec))) {
        expect(FILTERS[slot.id], slot.id).toBeDefined();
        for (const id of slot.writes ?? []) expect(FILTERS[id], id).toBeDefined();
        expect(["sentence", "invite", "under", "presentation", "advanced"]).toContain(placement);
      }
  });

  // Plan §2.1 P3a/P3b: a group row narrows the list and keeps the total; a selection row changes it.
  it("draws condition rows only with keys of their kind; today there are none", () => {
    for (const { spec } of states) {
      const ctx = ctxOf(spec);
      const rows = BLOCK_FILTERS[ctx.block].rows(spec, ctx);
      for (const row of rows)
        for (const id of row.chips) {
          expect(FILTERS[id].scope(ctx.form), `${row.label} ${id}`).toBe(row.kind);
          if (row.kind === "group") expect(["firmSeat", "seatCounty", "admin"]).not.toContain(id);
        }
      // F3 brings the first group row (CÂȘTIGĂTORII, with table:employees-2).
      expect(rows).toEqual([]);
    }
  });

  it("shows the profile line on the three profiles only", () => {
    for (const { spec } of states) {
      const ctx = ctxOf(spec);
      expect(BLOCK_FILTERS[ctx.block].scopeLine(spec, ctx), questionKey(spec)).toBe(["distribution", "scatter", "entity_card:risk"].includes(formOf(spec)) ? "historical-da" : null);
    }
  });
});

describe("links into Întreabă from the rest of the site (plan §2.6)", () => {
  // Today a phrase, a chip or "Mai multe filtre" offers every condition a link applies, so none needs
  // an origin label yet. From F1b the registry offers less: this list becomes what legacyConditions labels.
  it("carries no applied condition its question does not offer", () => {
    const unoffered = restored.flatMap((entry) => unofferedPaths(entry.spec, ctxOf(entry.spec)).filter((u) => u.applied).map((u) => `${entry.id}: ${u.path}`));
    expect(unoffered).toEqual([]);
    expect(restored.filter((entry) => entry.origin === "site").length).toBeGreaterThan(30);
  });
});

describe("the builder it describes", () => {
  // BLOCK_FILTERS, the defs and today.ts describe this code; the walk above checks them against the
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
