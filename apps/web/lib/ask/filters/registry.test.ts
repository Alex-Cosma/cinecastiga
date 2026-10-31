import { beforeAll, describe, expect, it } from "vitest";
import { defaultQuestion, questionErrors, questionKey, transitionQuestion } from "../question-ui";
import { COMPARE_RULES, IMPLEMENTED_KEYS, NETWORK_RULES, NEWER_VERSION_LINK, parseSpec, peersRule, READ_AHEAD_KEYS, runnableError, SEAT_RULES, SELECTION_RULES, TIMESERIES_RULES, TREND_RULES, unimplementedSpecKeys, WINNERS_RULES, validateSpec, type AskSpec, type Block } from "../spec";
import { legacyCorpus } from "../fixtures/legacy-corpus";
import { FIXTURE_IDENTITIES } from "../fixtures/golden-fixture";
import { BLOCK_FILTERS } from "./blocks";
import { filterContext, formOf, kindRollupAnswers, NATIONAL_ENTITY_SCAN, nationalEntityScan, PROFILE_FORMS, TRANSACTION_FORMS } from "./context";
import { legacyConditions, presentConditions } from "./legacy-conditions";
import { selectionOrigin } from "./origin";
import { choiceState, windowFilters, writeChoice, type Choice } from "./pickers";
import { baseQuestions, builderErrors, choicesOn, engineError, REQUIRED_INPUTS, type PlacedChoice } from "./probe";
import { availability, conditionSet, FILTER_DEFS, FILTERS, offeredFilters, placedSlots, SPEC_PATH_OWNERS, visibleFilters } from "./registry";
import { sentenceTokens } from "./sentence";
import { SCOPE_CHANGES, TODAY_REFUSALS, TODAY_SCOPE } from "./today";
import { chooseValue, type Transition } from "./transition";
import type { FilterId, FilterSpec } from "./types";

// The filter registry's contract (plan §2.1, §2.2, §6.1), on F1b's offers (BLOCK_FILTERS).

const YEAR = 2026;
const ctxOf = (spec: FilterSpec) => filterContext(spec, { year: YEAR });
const isImplemented = (id: FilterId) => FILTERS[id].keys.length > 0 && FILTERS[id].keys.every((key) => IMPLEMENTED_KEYS.has(key));
const bases = baseQuestions(YEAR);
/** Links, saved questions and other pages' questions, as the builder opens them (restore.ts: parseSpec, then transitionQuestion). */
const restored = legacyCorpus(FIXTURE_IDENTITIES).flatMap((entry) => {
  const parsed = parseSpec(entry.spec);
  if ("error" in parsed || unimplementedSpecKeys(parsed).length) return [];
  return [{ id: entry.id, origin: entry.origin, spec: transitionQuestion(parsed as unknown as FilterSpec).spec as FilterSpec }];
});
/** The ones the engine runs as they are. */
const runnable = restored.filter((entry) => engineError(entry.spec) === null);

describe("one owner for every key (R2)", () => {
  it("gives each path of AskSpec to exactly one filter", () => {
    const owned = FILTER_DEFS.flatMap((def) => def.keys.map((key) => [key, def.id] as const));
    expect(new Set(FILTER_DEFS.map((def) => def.id)).size).toBe(FILTER_DEFS.length);
    expect(new Set(owned.map(([key]) => key)).size).toBe(owned.length);
    expect(Object.fromEntries(owned)).toEqual(Object.fromEntries(Object.entries(SPEC_PATH_OWNERS).filter(([, owner]) => owner !== "question")));
  });

  it("owns every path parseSpec reads: the engine's and those read ahead", () => {
    const read = [...IMPLEMENTED_KEYS, ...Object.keys(READ_AHEAD_KEYS)]
      .filter((path) => !path.startsWith("options.members")) // a watch's, not the spec's
      .map((path) => path === "filters.authorityKind=local_admin" ? "filters.authorityKind" : path);
    expect([...new Set(read)].sort()).toEqual(Object.keys(SPEC_PATH_OWNERS).sort());
  });
});

describe("the rules of a key (plan §2.4)", () => {
  // spec.ts cannot import the registry, whose definitions read spec.ts: a rule lives in spec.ts
  // (TREND_RULES, F2) and the filter declares that same function, which runnableError runs.
  it("are those runnableError runs; no filter declares a rule it would not run", () => {
    const ruled = FILTER_DEFS.filter((def) => def.validate);
    expect(ruled.map((def) => def.id)).toEqual(["purchaseKind", "procedure", "firmSeat", "seatCounty", "purchaseValue", "newSince", "mainClient", "dominantSupplier", "peers", "trendOrder", "trendMinBase", "trendFirstOnly", "timeseriesGrain", "timeseriesSplit", "timeseriesMonths", "networkPartners", "sharedPartners"]);
    expect(ruled.map((def) => def.validate)).toEqual([
      SELECTION_RULES.purchaseKind, SELECTION_RULES.procedure, SEAT_RULES.firmSeat, SEAT_RULES.seatCounty, SELECTION_RULES.purchaseValue, WINNERS_RULES.newSince, WINNERS_RULES.mainClient, WINNERS_RULES.dominantSupplier, peersRule, TREND_RULES.order, TREND_RULES.minBase, TREND_RULES.firstOnly,
      TIMESERIES_RULES.grain, TIMESERIES_RULES.split, TIMESERIES_RULES.months, NETWORK_RULES.partners, COMPARE_RULES.sharedPartners,
    ]);
    // F4 (plan §3): one seat at a time, abroad without a size, a county of the seat where firms are the subject.
    const firms = { block: "table", dim: "supplier", measure: "value" } as const;
    for (const [raw, rule] of [
      [{ ...firms, filters: { firmSeat: "other", seatCounty: "Cluj" } }, SEAT_RULES.firmSeat],
      [{ ...firms, filters: { firmSeat: "abroad", minEmployees: 1, maxEmployees: 9 } }, SEAT_RULES.firmSeat],
      [{ ...firms, dim: "authority", filters: { seatCounty: "Cluj" } }, SEAT_RULES.seatCounty],
      [{ block: "stat", measure: "value", filters: { seatCounty: "Cluj" } }, SEAT_RULES.seatCounty],
      [{ block: "scatter", dim: "supplier", measure: "value", filters: { county: "Cluj", seatCounty: "Iasi" } }, SEAT_RULES.seatCounty],
    ] as const) {
      const parsed = parseSpec(raw);
      if ("error" in parsed) throw new Error(parsed.error);
      expect(rule(parsed), JSON.stringify(raw)).not.toBeNull();
      expect(validateSpec(raw)).toEqual({ error: rule(parsed) });
    }
    // A buyer's county and the firms' own seat are two places on a ranking; a profile refuses the seat against a buyer.
    expect(validateSpec({ ...firms, filters: { county: "Cluj", seatCounty: "Iasi" } })).not.toHaveProperty("error");
    expect(validateSpec({ ...firms, filters: { county: "Cluj", firmSeat: "other", minEmployees: 1, maxEmployees: 9 } })).not.toHaveProperty("error");
    expect(validateSpec({ block: "scatter", dim: "supplier", measure: "value", filters: { firmSeat: "same" } })).toHaveProperty("error");
    // F3 (plan §3): a CPV code without codes of the kind, a procedure off the contracts, a size above the DA ceiling on DAs.
    const stat = { block: "stat", measure: "value", filters: {} } as const;
    for (const [raw, rule] of [
      [{ ...stat, filters: { cpvTerm: "45", purchaseKind: "produse" } }, SELECTION_RULES.purchaseKind],
      [{ ...stat, filters: { cpvTerm: "33600000", purchaseKind: "lucrari" } }, SELECTION_RULES.purchaseKind],
      [{ ...stat, dataset: "da", filters: { procedure: "deschisa" } }, SELECTION_RULES.procedure],
      [{ ...stat, dataset: "da", filters: { purchaseValueMin: 2_500_000 } }, SELECTION_RULES.purchaseValue],
    ] as const) {
      const parsed = parseSpec(raw);
      if ("error" in parsed) throw new Error(parsed.error);
      expect(rule(parsed), JSON.stringify(raw)).not.toBeNull();
      expect(validateSpec(raw)).toEqual({ error: rule(parsed) });
    }
    // The kind of a domain in words is matched on the server (predicateContext); a procedure brings the contracts.
    expect(validateSpec({ ...stat, filters: { cpvTerm: "asfaltare", purchaseKind: "produse" } })).not.toHaveProperty("error");
    expect(validateSpec({ ...stat, filters: { cpvTerm: "45233140", purchaseKind: "lucrari" } })).not.toHaveProperty("error");
    expect(validateSpec({ ...stat, filters: { procedure: "altele" } })).toMatchObject({ dataset: "contracts" });
    expect(validateSpec({ ...stat, dataset: "da", filters: { purchaseValueMin: 2_000_000 } })).not.toHaveProperty("error");
    // F6a: the comparison group only on the distribution, "același tip" only of an institution.
    const distribution = { block: "distribution", measure: "value", filters: { supplierId: 7 } } as const;
    for (const raw of [{ ...distribution, peers: { similar: true } }, { block: "scatter", dim: "authority", measure: "value", filters: {}, peers: { activity: true } }]) {
      const parsed = parseSpec(raw);
      if ("error" in parsed) throw new Error(parsed.error);
      expect(peersRule(parsed), JSON.stringify(raw)).not.toBeNull();
      expect(validateSpec(raw)).toEqual({ error: peersRule(parsed) });
    }
    expect(validateSpec({ ...distribution, peers: { activity: true } })).not.toHaveProperty("error");
    const trend = { block: "trend", dim: "supplier", measure: "value", filters: { yearFrom: 2024, yearTo: 2025 } } as const;
    for (const [raw, rule] of [
      [{ ...trend, trend: { change: "down", order: "lei" } }, TREND_RULES.order],
      [{ ...trend, trend: { change: "up", minBase: 100_000 } }, TREND_RULES.minBase],
      [{ ...trend, trend: { change: "up", order: "lei", minBase: 100_000 } }, TREND_RULES.minBase],
      [{ ...trend, trend: { change: "up", firstOnly: true } }, TREND_RULES.firstOnly],
      [{ ...trend, dim: "county", trend: { change: "new", firstOnly: true } }, TREND_RULES.firstOnly],
    ] as const) {
      const parsed = parseSpec(raw);
      if ("error" in parsed) throw new Error(parsed.error);
      expect(rule(parsed), JSON.stringify(raw)).not.toBeNull();
      expect(validateSpec(raw)).toEqual({ error: rule(parsed) });
    }
    expect(validateSpec({ ...trend, trend: { change: "up", order: "percent", minBase: 100_000 } })).not.toHaveProperty("error");
    expect(validateSpec({ ...trend, trend: { change: "new", firstOnly: true, months: "auto" } })).not.toHaveProperty("error");
  });
});

describe("keys a later stage implements (F3: the common selection)", () => {
  // The evolution's options (F3-rows) are tested with their block, below.
  const f3 = FILTER_DEFS.filter((def) => def.since === "F3" && def.keys.every((key) => key.startsWith("filters.")));

  it("are the kind, the procedure and the size, selections on the records of every answer over them", () => {
    expect(f3.map((def) => [def.id, def.keys])).toEqual([
      ["purchaseKind", ["filters.purchaseKind"]], ["procedure", ["filters.procedure"]],
      ["purchaseValue", ["filters.purchaseValueMin", "filters.purchaseValueMax"]],
    ]);
    for (const def of f3) {
      for (const key of def.keys) expect(IMPLEMENTED_KEYS.has(key), key).toBe(true);
      for (const form of TRANSACTION_FORMS) expect([def.id, form, def.engine[form], def.scope(form)]).toEqual([def.id, form, "row", "selection"]);
      for (const form of PROFILE_FORMS) expect(def.engine[form], `${def.id} on ${form}`).toBeUndefined();
    }
  });

  it("write values the engine runs on the questions that offer them", () => {
    const stat = transitionQuestion(defaultQuestion(), "stat").spec as FilterSpec;
    for (const def of f3) for (const value of def.choices(stat, ctxOf(stat)))
      expect(validateSpec(def.write(stat, value)), `${def.id} = ${JSON.stringify(value)}`).not.toHaveProperty("error");
    // A procedure brings its stream; any other stream takes it away (dataset's write), a size stays.
    const open = FILTERS.procedure.write(stat, "deschisa");
    expect([open.dataset, open.filters.procedure]).toEqual(["contracts", "deschisa"]);
    expect(FILTERS.dataset.write(open, "contracts").filters.procedure).toBe("deschisa");
    expect(FILTERS.dataset.write(open, "all").filters).not.toHaveProperty("procedure");
    expect(FILTERS.purchaseValue.read(FILTERS.purchaseValue.write(stat, { purchaseValueMin: 1_000_000 }))).toEqual({ purchaseValueMin: 1_000_000 });
  });
});

describe("keys F3-rows implements (the evolution's options, plan §4.3)", () => {
  const ts = FILTER_DEFS.filter((def) => def.since === "F3" && def.keys.some((key) => key.startsWith("timeseries.")));
  const base = transitionQuestion(defaultQuestion(), "timeseries").spec as FilterSpec;
  const years = { ...base, filters: { ...base.filters, yearFrom: 2024, yearTo: 2025 } } as FilterSpec;

  it("are the pace, the split and the same months, applied on the evolution only, with their level and scope", () => {
    expect(ts.map((def) => [def.id, def.keys, def.engine, def.scope("timeseries")])).toEqual([
      ["timeseriesGrain", ["timeseries.grain"], { timeseries: "row" }, "display"],
      ["timeseriesSplit", ["timeseries.split"], { timeseries: "display" }, "display"],
      ["timeseriesMonths", ["timeseries.months"], { timeseries: "row" }, "selection"],
    ]);
    for (const def of ts) for (const key of def.keys) expect(IMPLEMENTED_KEYS.has(key), key).toBe(true);
  });

  it("write values the engine runs where they are offered", () => {
    for (const spec of [base, years, { ...years, dataset: "da" } as FilterSpec, { ...years, filters: { ...years.filters, cpvTerm: "45" } } as FilterSpec])
      for (const def of ts) for (const value of def.choices(spec, ctxOf(spec)))
        expect(validateSpec(def.write(spec, value)), `${def.id} = ${JSON.stringify(value)} on ${JSON.stringify(spec)}`).not.toHaveProperty("error");
    // Month by month needs at most 36 months; the channels split every purchase; the domains, more than one domain.
    expect(FILTERS.timeseriesGrain.choices(base, ctxOf(base))).toEqual([]);
    expect(FILTERS.timeseriesGrain.choices(years, ctxOf(years))).toEqual(["month"]);
    expect(FILTERS.timeseriesSplit.choices(years, ctxOf(years))).toEqual([undefined, "channel", "domain"]);
    const da = { ...years, dataset: "da" } as FilterSpec, works = { ...years, filters: { ...years.filters, purchaseKind: "lucrari" } } as FilterSpec;
    expect(FILTERS.timeseriesSplit.choices(da, ctxOf(da))).toEqual([undefined, "domain"]);
    expect(FILTERS.timeseriesSplit.choices(works, ctxOf(works))).toEqual([undefined, "channel"]);
    // The same months: the answer's switch offers them (data.ref); the control only takes them away.
    expect(FILTERS.timeseriesMonths.choices(years, ctxOf(years))).toEqual([]);
    expect(FILTERS.timeseriesMonths.choices(FILTERS.timeseriesMonths.write(years, "auto"), ctxOf(years))).toEqual([undefined]);
    expect(FILTERS.timeseriesSplit.write(FILTERS.timeseriesSplit.write(years, "channel"), undefined)).not.toHaveProperty("timeseries");
  });

  it("refuse with their rule's words what the engine cannot run (TIMESERIES_RULES)", () => {
    const ts0 = { block: "timeseries", measure: "value", filters: {} } as const;
    for (const [raw, rule] of [
      [{ ...ts0, timeseries: { grain: "month" } }, TIMESERIES_RULES.grain],
      [{ ...ts0, filters: { yearFrom: 2018, yearTo: 2025 }, timeseries: { grain: "month" } }, TIMESERIES_RULES.grain],
      [{ ...ts0, filters: { yearFrom: 2024, yearTo: 2025 }, timeseries: { grain: "month", months: [1, 6] } }, TIMESERIES_RULES.months],
      [{ ...ts0, filters: { yearFrom: 2024, yearTo: 2025, monthFrom: 1, monthTo: 3 }, timeseries: { months: "auto" } }, TIMESERIES_RULES.months],
      [{ ...ts0, dataset: "da", timeseries: { split: "channel" } }, TIMESERIES_RULES.split],
      [{ ...ts0, filters: { cpvTerm: "45" }, timeseries: { split: "domain" } }, TIMESERIES_RULES.split],
    ] as const) {
      const parsed = parseSpec(raw);
      if ("error" in parsed) throw new Error(parsed.error);
      expect(rule(parsed), JSON.stringify(raw)).not.toBeNull();
      expect(validateSpec(raw)).toEqual({ error: rule(parsed) });
    }
    expect(validateSpec({ ...ts0, filters: { yearFrom: 2023, yearTo: 2025 }, timeseries: { grain: "month", split: "domain" } })).not.toHaveProperty("error");
    expect(validateSpec({ ...ts0, timeseries: { split: "channel", months: [1, 6] } })).not.toHaveProperty("error");
  });

  it("never drop silently: month by month takes the same months away with a note", () => {
    const same = FILTERS.timeseriesMonths.write(years, [1, 6]);
    const to = chooseValue(same, { id: "timeseriesGrain" }, { filter: "timeseriesGrain", value: "month" });
    expect(to.spec.timeseries).toEqual({ grain: "month" });
    expect(to.dropped).toContain("timeseriesMonths");
    expect(to.notes.length).toBeGreaterThanOrEqual(to.dropped.length);
    // Another question keeps none of them (BLOCK_OPTION_KEYS): the options belong to the evolution.
    expect(transitionQuestion(FILTERS.timeseriesSplit.write(years, "domain"), "stat").spec).not.toHaveProperty("timeseries");
  });
});

describe("keys a later stage implements (F2: the trend's; F6a: the distribution's group)", () => {
  const later = FILTER_DEFS.filter((def) => def.since === "F2" || def.since === "F6a");

  it("are the trend's five lenses, applied on the trend only, with the plan's level and scope", () => {
    expect(later.map((def) => [def.id, def.since, def.engine, def.scope("trend")])).toEqual([
      ["peers", "F6a", { distribution: "profile" }, "selection"],
      ["trendChange", "F2", { trend: "group" }, "group"],
      ["trendMonths", "F2", { trend: "row" }, "selection"],
      ["trendOrder", "F2", { trend: "display" }, "display"],
      ["trendMinBase", "F2", { trend: "group" }, "group"],
      ["trendFirstOnly", "F2", { trend: "group" }, "group"],
    ]);
    for (const def of later) for (const key of def.keys) expect(IMPLEMENTED_KEYS.has(key), key).toBe(true);
  });

  it("keep a group's own options when the group changes (trend final §4.3)", () => {
    const base = { block: "trend", dim: "supplier", measure: "value", filters: { yearFrom: 2024, yearTo: 2025 } } as FilterSpec;
    const percent = FILTERS.trendOrder.write(FILTERS.trendChange.write(base, "up"), "percent");
    expect(percent.trend).toEqual({ change: "up", order: "percent", minBase: 1_000_000 });
    expect(FILTERS.trendChange.write(percent, "down").trend).toEqual({ change: "down" });
    expect(FILTERS.trendOrder.write(percent, "lei").trend).toEqual({ change: "up", order: "lei" });
    const first = FILTERS.trendFirstOnly.write(FILTERS.trendChange.write(base, "new"), true);
    expect(FILTERS.trendChange.write(first, "gone").trend).toEqual({ change: "gone" });
    expect(FILTERS.trendMonths.write(FILTERS.trendMonths.write(base, "auto"), undefined)).not.toHaveProperty("trend");
    // Every value a control writes passes validateSpec on the question it offers it on.
    for (const def of later.filter((d) => d.id.startsWith("trend"))) {
      let spec = base;
      if (def.id === "trendOrder" || def.id === "trendMinBase") spec = FILTERS.trendOrder.write(FILTERS.trendChange.write(base, "up"), "percent");
      if (def.id === "trendFirstOnly") spec = FILTERS.trendChange.write(base, "new");
      const values = def.choices(spec, ctxOf(spec));
      expect(values.length, def.id).toBeGreaterThan(0);
      for (const value of values) expect(validateSpec(def.write(spec, value)), `${def.id} = ${JSON.stringify(value)}`).not.toHaveProperty("error");
    }
    // Counties without a firm or a domain: all 42 buy in both years, so new and gone are not offered.
    expect(FILTERS.trendChange.choices({ ...base, dim: "county" }, ctxOf({ ...base, dim: "county" }))).toEqual(["up", "down", "all"]);
  });
});

describe("keys read ahead of the engine (F0a)", () => {
  const ahead = FILTER_DEFS.filter((def) => def.stage !== undefined);

  it("are the filters with a key outside IMPLEMENTED_KEYS, applied nowhere, each with its stage", () => {
    expect(ahead.map((def) => def.id).sort()).toEqual(FILTER_DEFS.filter((def) => def.keys.some((key) => !IMPLEMENTED_KEYS.has(key))).map((def) => def.id).sort());
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
    // A key of a later stage (`since`) had no scope in the engine of 4e90b00.
    const applied = FILTER_DEFS.filter((def) => Object.keys(def.engine).length > 0 && !def.since);
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
    // A change on one subject (F3: the ranked firms) is read on a question of that subject.
    for (const change of SCOPE_CHANGES)
      expect(FILTERS[change.filter].scope(change.form, change.dim ? { block: change.form.split(":")[0]!, dim: change.dim, measure: "value", filters: {} } as FilterSpec : undefined))
        .not.toBe(TODAY_SCOPE[change.filter]?.[change.form]);
  });

  it("has no group key today: every condition of the engine is a selection or display", () => {
    const groups = Object.entries(TODAY_SCOPE).flatMap(([id, forms]) => Object.entries(forms).filter(([, scope]) => scope === "group").map(([form]) => `${id} on ${form}`));
    expect(groups).toEqual([]);
  });
});

/** The conditions of a spec the question shows neither as its own nor as a chip it carried in. */
const isOrigin = (spec: FilterSpec, id: FilterId) => id === "population" && selectionOrigin(spec.population) !== null;

/**
 * R1 on F1b's offers (plan §2.1, §6.1 "matricea pe perechi"): every row of every window on each catalogue
 * question and, one more, on each of its results (the pairs); one row on each question the corpus opens. A
 * row is offered, disabled with its reason or hidden; each offered one is applied as the builder applies it
 * (the window's write, then transition.ts).
 */
function walk() {
  const problems: string[] = [];
  const visited = new Set<string>();
  const disabled = new Map<string, number>();
  let singles = 0, pairs = 0;
  /** What the walk reads of the draft before a choice, once per draft. */
  interface From { spec: FilterSpec; present: Map<FilterId, unknown>; visible: Set<FilterId>; refused: Set<FilterId> | null }
  const check = (from: From, placed: PlacedChoice, to: Transition, where: string) => {
    const errors = questionErrors(to.spec);
    // What the builder accepts, the engine runs (validateSpec = parseSpec + runnableError, then the locality rule);
    // a window that empties a required input (the second entity, a focal one) asks for it again.
    const engine = engineError(to.spec);
    if (errors.length && !errors.every((error) => REQUIRED_INPUTS.includes(error))) problems.push(`refused (${errors.join(" / ")}): ${where}`);
    else if (!errors.length && engine) problems.push(`builder accepts, engine refuses (${engine}): ${where}`);
    // No condition hidden: the question shows it, or it is a link's chip it carried in (still a chip).
    const visible = visibleFilters(to.spec), present = presentConditions(to.spec);
    for (const id of present.keys())
      if (!visible.has(id) && !(from.present.has(id) && (!from.visible.has(id) || isOrigin(from.spec, id)))) problems.push(`hidden ${id}: ${where}`);
    // Never a silent drop: what left outside the chosen window has a note or waits in the parked row.
    const window = new Set(windowFilters(placed.slot));
    // A condition kept under another key (F4: a firm profile's county as its seat) is kept.
    const kept = new Set([...present.keys(), ...to.dropped, ...(to.parked?.items.map((item) => item.id) ?? []),
      ...Object.entries(to.renamed ?? {}).filter(([, now]) => present.has(now as FilterId)).map(([was]) => was as FilterId)]);
    for (const id of from.present.keys()) if (!kept.has(id) && !window.has(id)) problems.push(`dropped ${id} silently: ${where}`);
    if (to.notes.length < to.dropped.length) problems.push(`${to.dropped.length} dropped, ${to.notes.length} notes: ${where}`);
    // A new refused chip would be offered, then refused (a chip is refused only on a question the engine refuses).
    if (engine) {
      from.refused ??= new Set(legacyConditions(from.spec).filter((c) => c.status === "refused").map((c) => c.key));
      for (const c of legacyConditions(to.spec)) if (c.status === "refused" && !from.refused.has(c.key)) problems.push(`refused chip ${c.key}: ${where}`);
    }
  };
  const visit = (spec: FilterSpec, deeper: boolean, sample = false) => {
    const from: From = { spec, present: presentConditions(spec), visible: visibleFilters(spec), refused: null };
    const ctx = ctxOf(spec);
    const seen = new Set<string>();
    for (const placed of choicesOn(spec, ctx)) {
      const where = `${ctx.form} ${placed.placement} ${placed.slot.id}${placed.slot.picker ? ` (${placed.slot.picker})` : ""} = ${JSON.stringify(placed.choice.value)} on ${questionKey(spec)}`;
      if (placed.state.state === "hidden") continue;
      if (placed.state.state === "disabled") {
        // Disabled says why, and is honest: the engine would refuse the choice (a ranking pinned to one row), or it
        // would read both marts whole until S5 (goods or services per entity nationally, S4 review): said as such.
        if (!placed.state.reason) problems.push(`disabled without a reason: ${where}`);
        const slow = placed.state.reason === NATIONAL_ENTITY_SCAN && nationalEntityScan(writeChoice(spec, placed.slot, placed.choice));
        if (!slow && !runnableError(writeChoice(spec, placed.slot, placed.choice) as unknown as AskSpec)) problems.push(`disabled, engine accepts: ${where}`);
        disabled.set(placed.state.reason, (disabled.get(placed.state.reason) ?? 0) + 1);
        continue;
      }
      const to = chooseValue(spec, placed.slot, placed.choice);
      const key = `${placed.choice.filter}|${questionKey(to.spec)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deeper || sample ? singles++ : pairs++;
      check(from, placed, to, where);
      const result = questionKey(to.spec);
      if (deeper && !visited.has(result) && !questionErrors(to.spec).length) { visited.add(result); visit(to.spec, false); }
    }
  };
  for (const base of bases) {
    expect(builderErrors(base.spec), base.name).toEqual([]);
    visit(base.spec, true);
  }
  for (const entry of restored) visit(entry.spec, false, true);
  return { problems, disabled, singles, pairs };
}

describe("R1: what a question offers, the engine accepts (plan §2.1)", () => {
  let result: ReturnType<typeof walk>;
  // ~3 s alone; the whole suite on a shared machine (load ~30) took it past the default 10 s hook timeout.
  beforeAll(() => { result = walk(); }, 120_000);

  it("walks every offered choice and every pair of choices", () => {
    expect(result.singles).toBeGreaterThan(15_000);
    expect(result.pairs).toBeGreaterThan(90_000);
  });

  it("never offers a choice the engine refuses, hides a condition or drops one silently", () => {
    expect(result.problems.slice(0, 20)).toEqual([]);
  });

  it("disables only rankings pinned to one row and kinds a CPV code has no codes of, each with its reason", () => {
    expect([...result.disabled.keys()].sort()).toEqual([
      // F3 (kit §5.3): the walk's codes, 33600000 (medicines, goods), 45 and 45233140 (works).
      "CPV 33600000 nu are coduri de lucrări. Alege alt tip sau „Orice”.", "CPV 33600000 nu are coduri de servicii. Alege alt tip sau „Orice”.",
      "CPV 45 nu are coduri de produse. Alege alt tip sau „Orice”.", "CPV 45 nu are coduri de servicii. Alege alt tip sau „Orice”.",
      // F4: the corpus' comparison on the group 4523 (works).
      "CPV 4523 nu are coduri de produse. Alege alt tip sau „Orice”.", "CPV 4523 nu are coduri de servicii. Alege alt tip sau „Orice”.",
      "CPV 45233140 nu are coduri de produse. Alege alt tip sau „Orice”.", "CPV 45233140 nu are coduri de servicii. Alege alt tip sau „Orice”.",
      // F4: abroad beside a size (a foreign firm has no MF filing).
      "Firmele străine nu au bilanț și nici număr la Registrul Comerțului. Scoate angajații sau alege alt sediu.",
      "Scoate firma aleasă ca să clasezi firmele.", "Scoate instituția aleasă ca să clasezi instituțiile.",
      "Scoate județul ca să clasezi județele.", "Scoate localitatea ca să clasezi județele.",
      // S4 review: goods or services per institution or firm, nationally, wait on S5's rollup (PRECOMPUTE.md).
      NATIONAL_ENTITY_SCAN,
    ].sort());
  });
});

describe("what F1b does about each refusal of today's builder (TODAY_REFUSALS)", () => {
  const base = (name: string) => structuredClone(bases.find((b) => b.name === name)!.spec);
  const sentenceSlot = (spec: FilterSpec, id: FilterId) => BLOCK_FILTERS[spec.block as Block].sentence(spec, ctxOf(spec)).find((s) => s.id === id)!;
  const axis = (spec: FilterSpec, value: "value" | "risk") => chooseValue(spec, sentenceSlot(spec, "rankBy"), { filter: "rankBy", value });
  const subject = (spec: FilterSpec, value: Choice["value"]) => chooseValue(spec, sentenceSlot(spec, "dim"), { filter: "dim", value });
  const fixes: Record<string, () => void> = {
    // No threshold, precise selection or contracts stream offered where the engine refuses them.
    "trend-threshold": () => expect(placedSlots(base("trend firms"), ctxOf(base("trend firms"))).some((p) => p.slot.id === "minimumRecords")).toBe(false),
    "profile-threshold": () => { for (const name of ["scatter firms", "distribution institution", "leader risk firms"]) expect(availability("minimumRecords", base(name))).toEqual({ state: "hidden" }); },
    "profile-population": () => { for (const name of ["scatter firms", "distribution institution", "leader risk firms"]) expect(availability("population", base(name))).toEqual({ state: "hidden" }); },
    "profile-contracts": () => { for (const name of ["scatter firms", "distribution firm", "leader risk institutions"]) expect(availability("dataset", base(name))).toEqual({ state: "hidden" }); },
    // The axis parks what the index cannot apply, and the value axis brings it back.
    "risk-records": () => {
      const spec = { ...base("leader value institutions"), filters: { cpvTerm: "medicamente", yearFrom: 2025, yearTo: 2025 } };
      const risk = axis(spec, "risk");
      expect(engineError(risk.spec)).toBeNull();
      expect(risk.parked?.items.map((item) => item.label)).toEqual(["„medicamente”", "2025"]);
    },
    "risk-named": () => expect(axis({ ...base("leader value firms"), filters: { authorityName: "Comuna Exemplu", authorityId: 101 } }, "risk").parked?.items.map((i) => i.id)).toEqual(["authority"]),
    "risk-firm-buyer": () => expect(axis({ ...base("leader value firms"), filters: { authorityKind: "comuna" } }, "risk").parked?.items.map((i) => i.id)).toEqual(["authorityKind"]),
    "risk-locality": () => expect(axis({ ...base("leader value institutions"), filters: { uatSiruta: 54975, uatName: "Municipiul Cluj-Napoca (Cluj)", county: "Cluj" } }, "risk").parked?.items.map((i) => i.id)).toEqual(["locality"]),
    // A firm subject or focal entity drops the kind of institution, with its note.
    "firm-profile-buyer": () => {
      const to = subject({ ...base("scatter institutions"), filters: { authorityKind: "spital" } }, { dim: "supplier" });
      expect([to.spec.filters.authorityKind, to.dropped, engineError(to.spec)]).toEqual([undefined, ["authorityKind"], null]);
      expect(to.notes).toEqual(["Am scos „doar spitale”: nu se potrivește cu alegerea nouă."]);
    },
    "firm-focal-buyer": () => {
      const spec = { ...base("distribution institution"), filters: { ...base("distribution institution").filters, authorityKind: "comuna" } };
      const to = chooseValue(spec, sentenceSlot(spec, "authority"), { filter: "supplier", value: { name: "Firma Exemplu SRL", id: 202 } });
      expect([to.spec.filters.authorityKind, to.dropped, engineError(to.spec)]).toEqual([undefined, ["authorityKind"], null]);
    },
    // A ranking pinned to one row is disabled in "Ce clasăm?", with the reason (the walk checks each one).
    "county-ranking": () => {
      const spec = { ...base("table firms"), filters: { county: "Cluj" } };
      expect(choicesOn(spec).find((p) => p.slot.picker === "subject" && (p.choice.value as { dim: string }).dim === "county")?.state).toEqual({ state: "disabled", reason: "Scoate județul ca să clasezi județele." });
    },
    "ranking-pair": () => {
      const spec = { ...base("table firms"), filters: { authorityName: "Comuna Exemplu", authorityId: 101 } };
      expect(choicesOn(spec).filter((p) => p.slot.picker === "subject" && (p.choice.value as { dim: string }).dim === "authority").map((p) => p.state.state)).toEqual(Array(6).fill("disabled"));
    },
    "ranking-pair-firm": () => {
      const spec = { ...base("table institutions"), filters: { supplierName: "Firma Exemplu SRL", supplierId: 202 } };
      expect(choicesOn(spec).find((p) => p.slot.picker === "subject" && (p.choice.value as { dim: string }).dim === "supplier")?.state.state).toBe("disabled");
    },
  };

  it.each(TODAY_REFUSALS.filter((r) => r.kind === "engine").map((r) => [r.id] as const))("%s", (id) => {
    expect(fixes[id], `no check for ${id}`).toBeDefined();
    fixes[id]!();
  });
});

describe("availability (plan §2.2)", () => {
  const base = (name: string) => bases.find((b) => b.name === name)!.spec;

  it("is offered where a control writes the filter, else hidden", () => {
    expect(availability("cpvTerm", base("table firms"))).toEqual({ state: "offered" });
    expect(availability("cpvTerm", base("scatter institutions"))).toEqual({ state: "hidden" });
    expect(availability("county", base("scatter institutions"))).toEqual({ state: "offered" });
    expect(availability("locality", base("map"))).toEqual({ state: "hidden" });
    expect(availability("employees", base("table firms"))).toEqual({ state: "offered" });
    expect(availability("employees", base("timeseries"))).toEqual({ state: "hidden" });
    expect(availability("employees", base("network institution"))).toEqual({ state: "offered" });
    expect(availability("employees", base("network firm"))).toEqual({ state: "hidden" });
    for (const { spec } of [...bases, ...restored.slice(0, 60)]) {
      const ctx = ctxOf(spec), offered = offeredFilters(spec, ctx);
      for (const def of FILTER_DEFS) expect(availability(def.id, spec, ctx).state === "hidden", `${def.id} on ${questionKey(spec)}`).toBe(!offered.has(def.id));
    }
  });

  it("keeps goods and services from a national answer per entity only where they read both marts whole (S4 review, S5 PRE-answers)", () => {
    const firms = base("table firms");
    const kindSlot = { id: "purchaseKind", label: "Ce s-a cumpărat", window: "Ce s-a cumpărat?" } as const;
    const state = (spec: FilterSpec, value: string) => choiceState(kindSlot as never, { filter: "purchaseKind", value } as Choice, spec, ctxOf(spec)).state;
    const at = (spec: FilterSpec) => ["produse", "servicii", "lucrari"].map((value) => state(spec, value));
    // The nightly agg_entity_kind_year answers the national rankings, trends and leaders per entity by kind.
    expect([nationalEntityScan(firms), kindRollupAnswers(firms, ctxOf(firms)), at(firms)]).toEqual([true, true, ["offered", "offered", "offered"]]);
    // Not beside the other side's condition (the firms' size on a ranking of institutions), months or a threshold.
    const institutions = { ...firms, dim: "authority" as const, filters: { ...firms.filters, minEmployees: 1, maxEmployees: 9 } };
    expect([nationalEntityScan(institutions), at(institutions)]).toEqual([true, ["disabled", "disabled", "offered"]]);
    expect(at({ ...firms, filters: { ...firms.filters, monthFrom: 1, monthTo: 6, yearFrom: 2025, yearTo: 2025 } })).toEqual(["disabled", "disabled", "offered"]);
    // Firms left out of a ranking of firms stay on the rollup; institutions left out of it do not.
    const out = (field: "authority" | "supplier") => ({ ...firms, population: { operator: "and" as const, groups: [{ operator: "and" as const, conditions: [{ field, op: "not_in" as const, values: ["1"] }] }] } });
    expect([at(out("supplier")), at(out("authority"))]).toEqual([["offered", "offered", "offered"], ["disabled", "disabled", "offered"]]);
    // A size: the kit's ranges on the rollup, bounds typed in live.
    const sizeSlot = { id: "purchaseValue", label: "Mărimea achiziției", window: "Cât de mare e fiecare achiziție?" } as const;
    const size = (spec: FilterSpec, value: object) => choiceState(sizeSlot as never, { filter: "purchaseValue", value } as Choice, spec, ctxOf(spec)).state;
    expect([size(firms, { purchaseValueMin: 1_000_000 }), size(firms, { purchaseValueMin: 50_000, purchaseValueMax: 250_000 })]).toEqual(["offered", "disabled"]);
    expect(size({ ...firms, filters: { ...firms.filters, county: "Cluj" } }, { purchaseValueMin: 50_000, purchaseValueMax: 250_000 })).toBe("offered");
    // A county, a kind of institution, a domain or the contracts bound the records; the counties are a rollup's.
    for (const filters of [{ county: "Cluj" }, { authorityKind: "spital" }, { cpvTerm: "medicamente" }] as FilterSpec["filters"][])
      expect(at({ ...firms, filters: { ...firms.filters, ...filters } })).toEqual(["offered", "offered", "offered"]);
    expect(at({ ...firms, dataset: "contracts" })).toEqual(["offered", "offered", "offered"]);
    expect(at({ ...firms, dim: "county" })).toEqual(["offered", "offered", "offered"]);
    // A goods ranking a link opened stays choosable as it is.
    expect(state({ ...firms, filters: { ...firms.filters, purchaseKind: "produse" } }, "produse")).toBe("offered");
  });

  // Nothing generic under any question any more (R3, G1): the threshold and the precise selection live in
  // "⋯ › Selecție avansată" only (variant A), the single bidder and the comparison mode nowhere.
  it("offers no generic control, and no control whose key the engine ignores there", () => {
    const problems: string[] = [];
    for (const { spec } of [...bases, ...restored]) {
      const ctx = ctxOf(spec);
      for (const { placement, slot } of placedSlots(spec, ctx)) {
        if (["singleBidder", "comparisonMode"].includes(slot.id) || ["population", "minimumRecords"].includes(slot.id) && placement !== "advanced") problems.push(`${slot.id} in ${placement} on ${ctx.form}`);
      }
      for (const id of offeredFilters(spec, ctx)) if (FILTERS[id].engine[ctx.form] === undefined) problems.push(`${id} ignored on ${ctx.form}`);
    }
    expect(problems).toEqual([]);
  });
});

describe("places (BLOCK_FILTERS)", () => {
  const states = [...bases, ...restored];
  /** R10's window titles (kit §2), with the windows the plan keeps from today (F1b-s-windows). */
  const WINDOWS = ["Ce fel de achiziții?", "Ce s-a cumpărat?", "Cine a cumpărat?", "Unde?", "De la cine?", "Unde au sediul firmele?", "În ce perioadă?", "Când?",
    "Câți angajați au firmele?", "Cine conduce firmele?", "Selecție avansată", "Ce luni compari?", "Cât de mare e fiecare achiziție?",
    // F4: the network's „Cu semnale” and a comparison's „Doar clienții comuni” are switches (kit component 5); their places keep a
    // title for their (?) and a screen reader.
    "Cu semnale", "Doar clienții comuni",
    // F5: „Firme noi”, and the switches „Principalul lor client public” and „O firmă ia peste jumătate” (their (?)).
    "Ce firme noi?", "Principalul lor client public", "O firmă ia peste jumătate"];

  it("has one entry for each of the 13 questions", () => {
    expect(Object.keys(BLOCK_FILTERS).sort()).toEqual(([...new Set(bases.map((b) => b.spec.block))] as Block[]).sort());
  });

  it("names only registered filters; invitations, rows and P9 with their names and windows", () => {
    for (const { spec } of states)
      for (const { placement, slot } of placedSlots(spec, ctxOf(spec))) {
        expect(FILTERS[slot.id], slot.id).toBeDefined();
        for (const id of slot.writes ?? []) expect(FILTERS[id], id).toBeDefined();
        expect(["sentence", "invite", "row", "under", "presentation", "strip", "advanced"]).toContain(placement);
        if (["invite", "row", "under", "advanced"].includes(placement)) {
          expect(slot.label, `${placement} ${slot.id}`).toBeTruthy();
          expect(WINDOWS, `${placement} ${slot.id}`).toContain(slot.window);
        }
      }
  });

  // P2: the unset fragments of the sentence, named, in its order, at most four; set, each becomes its phrase.
  it("invites only unset fragments the sentence does not show, and each becomes its phrase", () => {
    const problems: string[] = [];
    for (const { spec } of states) {
      const ctx = ctxOf(spec);
      const invites = BLOCK_FILTERS[ctx.block].invites(spec, ctx);
      if (invites.length > 4) problems.push(`${invites.length} invitations on ${questionKey(spec)}`);
      const said = new Set(sentenceTokens(spec, ctx).flatMap((t) => t.kind === "slot" ? [t.filter, ...t.says] : []));
      for (const invite of invites) {
        const own = [invite.id, ...(invite.writes ?? [])];
        if (own.some((id) => said.has(id) || conditionSet(spec, id))) problems.push(`${invite.id} already there on ${questionKey(spec)}`);
        // Each of its rows that sets a condition (not the first row, the default) makes the sentence say it.
        const rows = choicesOn(spec, ctx).filter((p) => p.placement === "invite" && p.slot.id === invite.id && p.state.state === "offered");
        const set = rows.map((p) => ({ p, to: chooseValue(spec, p.slot, p.choice) })).filter(({ p, to }) => conditionSet(to.spec, p.choice.filter));
        if (!set.length) problems.push(`${invite.id} sets nothing on ${questionKey(spec)}`);
        for (const { p, to } of set) if (!visibleFilters(to.spec).has(p.choice.filter)) problems.push(`${invite.id} = ${JSON.stringify(p.choice.value)} is not said on ${questionKey(spec)}`);
      }
    }
    expect(problems).toEqual([]);
  });

  // Plan §2.1 P3a/P3b: a group row narrows the list and keeps the total; a selection row changes it.
  // The group row is the ranked firms' size (CÂȘTIGĂTORII), moved to the group under its version (SCOPE_CHANGES):
  // the trend of firms (trend-2), "Cine câștigă?" (table:employees-2, F3) and "Cine conduce?" by value.
  it("draws the partners' selection rows on the network and the flow, and the ranked firms' winners as a group", () => {
    // F5: a ranking of institutions has its own group row, INSTITUȚIILE („O firmă ia peste jumătate”).
    const winners = (spec: FilterSpec, ctx: ReturnType<typeof ctxOf>) => spec.dim === "supplier" && ["trend", "table", "entity_card:value"].includes(ctx.form)
      || spec.dim === "authority" && ctx.form === "table";
    // F6c: on the index of firms the band selects the profiles in it: the same row, a selection (no total in lei to keep).
    const profiles = (spec: FilterSpec, ctx: ReturnType<typeof ctxOf>) => spec.dim === "supplier" && ctx.form === "entity_card:risk";
    for (const { spec } of states) {
      const ctx = ctxOf(spec);
      const rows = BLOCK_FILTERS[ctx.block].rows(spec, ctx);
      for (const row of rows) {
        expect(row.kind, row.label).toBe(winners(spec, ctx) ? "group" : "selection");
        for (const chip of row.chips) expect(FILTERS[chip.id].scope(ctx.form, spec), `${row.label} ${chip.id}`).toBe(row.kind);
        // A key moved to the group has its version; F5's keys are groups from the start (no answer of before had them).
        if (row.kind === "group") for (const chip of row.chips)
          expect(SCOPE_CHANGES.some((c) => c.filter === chip.id && c.form === ctx.form) || FILTERS[chip.id].since === "F5", chip.id).toBe(true);
      }
      expect(rows.length > 0, questionKey(spec)).toBe(["network", "sankey"].includes(ctx.block) || winners(spec, ctx) || profiles(spec, ctx));
      // P4 the question owns: the size of a purchase on the total and the ranking (F3), the trend's "Aceleași luni", the shared
      // clients of two firms (F4).
      expect(BLOCK_FILTERS[ctx.block].under(spec, ctx).map((slot) => slot.id)).toEqual(ctx.block === "trend" ? ["trendMonths"]
        : ctx.block === "timeseries" ? ["timeseriesMonths"] : ["stat", "table"].includes(ctx.block) ? ["purchaseValue"]
          : ctx.block === "compare" && ctx.role === "supplier" ? ["sharedPartners"] : []);
    }
  });

  it("puts the trend's keys in its places: the change in the sentence and the strip, the months under it, order and base in P5, «Prima dată» in the strip", () => {
    const trend = bases.find((b) => b.name === "trend firms")!.spec;
    expect(trend.trend).toEqual({ change: "up", months: "auto" });
    const percent = FILTERS.trendOrder.write(trend, "percent");
    const at = (spec: FilterSpec) => placedSlots(spec, ctxOf(spec)).filter((p) => p.slot.id.startsWith("trend")).map((p) => `${p.placement} ${p.slot.id}`);
    expect(at(percent)).toEqual(["sentence trendChange", "under trendMonths", "presentation trendOrder", "presentation trendMinBase", "strip trendChange", "strip trendFirstOnly"]);
    for (const id of ["trendChange", "trendMonths", "trendOrder", "trendMinBase", "trendFirstOnly"] as const) expect(offeredFilters(percent, ctxOf(percent)).has(id), id).toBe(true);
    // Every trend option a spec carries is the question's own: no "Din link" chip for it.
    const all = { ...trend, trend: { change: "new", months: [1, 5], firstOnly: true } } as FilterSpec;
    expect(legacyConditions(all)).toEqual([]);
    expect(legacyConditions(percent)).toEqual([]);
  });

  it("shows the profile line on the three profiles only", () => {
    for (const { spec } of states) {
      const ctx = ctxOf(spec);
      expect(BLOCK_FILTERS[ctx.block].scopeLine(spec, ctx), questionKey(spec)).toBe(["distribution", "scatter", "entity_card:risk"].includes(formOf(spec)) ? "historical-da" : null);
    }
  });

  it("runs every link the engine runs, with its conditions shown or as chips", () => {
    expect(runnable.length).toBeGreaterThan(150);
    for (const entry of runnable) {
      const visible = visibleFilters(entry.spec);
      const chips = new Set(legacyConditions(entry.spec).map((c) => c.key));
      for (const id of presentConditions(entry.spec).keys())
        expect(visible.has(id) || chips.has(id) || id === "population", `${entry.id}: ${id}`).toBe(true);
    }
  });
});
