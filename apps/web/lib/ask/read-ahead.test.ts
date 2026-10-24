import { describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import { runRows, runSpec } from "./compile";
import { defaultQuestion, QUESTION_TYPES, transitionQuestion } from "./question-ui";
import {
  IMPLEMENTED_KEYS, NEWER_VERSION_LINK, parseSpec, READ_AHEAD_KEYS, SPEC_JSON_SCHEMA, unimplementedSpecKeys, validateSpec,
  type AskSpec,
} from "./spec";

// F0a, "read first, write later" (plan §2.4, §3): every key a later stage
// writes is read today and refused by the engine until its stage implements it.

const trend = { block: "trend", dim: "supplier", measure: "value", filters: { yearFrom: 2024, yearTo: 2025 } };
const stat = { block: "stat", measure: "value", filters: {} };
const table = { block: "table", dim: "supplier", measure: "value", filters: {} };
/** One well-formed sample per key read ahead, on a question that otherwise runs today. */
const SAMPLES: Record<Exclude<keyof typeof READ_AHEAD_KEYS, "options.members">, Record<string, unknown>> = {
  "trend.change": { ...trend, trend: { change: "up" } },
  "trend.months": { ...trend, trend: { months: [1, 6] } },
  "trend.order": { ...trend, trend: { order: "percent" } },
  "trend.minBase": { ...trend, trend: { minBase: 100_000 } },
  "trend.firstOnly": { ...trend, trend: { firstOnly: true } },
  "timeseries.grain": { block: "timeseries", measure: "value", filters: { yearFrom: 2024, yearTo: 2025 }, timeseries: { grain: "month" } },
  "timeseries.split": { block: "timeseries", measure: "value", filters: {}, timeseries: { split: "channel" } },
  "timeseries.months": { block: "timeseries", measure: "value", filters: {}, timeseries: { months: "auto" } },
  "filters.purchaseKind": { ...stat, filters: { purchaseKind: "lucrari" } },
  "filters.procedure": { ...stat, dataset: "contracts", filters: { procedure: "negociere_fara_publicare" } },
  "filters.purchaseValueMin": { ...stat, filters: { purchaseValueMin: 1_000_000 } },
  "filters.purchaseValueMax": { ...stat, filters: { purchaseValueMax: 50_000 } },
  "filters.firmSeat": { ...table, filters: { firmSeat: "other" } },
  "filters.seatCounty": { block: "entity_card", dim: "supplier", rankBy: "value", measure: "value", filters: { seatCounty: "Cluj" } },
  "filters.sharedPartners": { block: "compare", measure: "value", filters: { supplierId: 1, compareWithId: 2, sharedPartners: true } },
  "sankey.shown": { block: "sankey", measure: "value", filters: { supplierId: 1 }, sankey: { shown: 10 } },
  "network.partners": { block: "network", measure: "value", filters: { authorityId: 1 }, network: { partners: "new" } },
  "network.since": { block: "network", measure: "value", filters: { authorityId: 1 }, network: { since: 2023 } },
  "network.order": { block: "network", measure: "value", filters: { authorityId: 1 }, network: { order: "years" } },
  "network.show": { block: "network", measure: "value", filters: { authorityId: 1 }, network: { show: 25 } },
  "network.signals": { block: "network", measure: "value", filters: { authorityId: 1 }, network: { signals: true } },
  "filters.newSince": { ...table, filters: { newSince: 2024 } },
  "filters.newScope": { ...table, filters: { newScope: "registry" } },
  "filters.mainClient": { ...table, filters: { authorityId: 1, mainClient: true } },
  "filters.dominantSupplier": { ...table, dim: "authority", filters: { dominantSupplier: true } },
  "filters.authorityKind=local_admin": { block: "map", measure: "value", filters: { authorityKind: "local_admin" } },
  "peers.similar": { block: "distribution", measure: "value", filters: { authorityId: 1 }, peers: { similar: true } },
  "peers.activity": { block: "distribution", measure: "value", filters: { authorityId: 1 }, peers: { activity: true } },
  "peers.domain": { block: "distribution", measure: "value", filters: { supplierId: 1 }, peers: { domain: true } },
  "scatter.flag": { block: "scatter", dim: "authority", measure: "value", filters: {}, scatter: { flag: "da_split" } },
  "scatter.rankBy": { block: "scatter", dim: "authority", measure: "value", filters: {}, scatter: { rankBy: "value" } },
};

/** Any query fails the test: the refusal comes before grounding, coverage or identities. */
const untouched = new Proxy(() => undefined, {
  apply() { throw new Error("the database was queried"); },
  get() { throw new Error("the database was queried"); },
}) as unknown as DbSql;

describe("keys read ahead of the engine", () => {
  it("has one sample per key of plan §3 and none of them is implemented yet", () => {
    expect(Object.keys(SAMPLES).sort()).toEqual(Object.keys(READ_AHEAD_KEYS).filter(key => key !== "options.members").sort());
    for (const key of Object.keys(READ_AHEAD_KEYS)) expect(IMPLEMENTED_KEYS.has(key), key).toBe(false);
  });

  it.each(Object.entries(SAMPLES))("parses and types %s, keeps it in the spec and refuses it as newer", (key, raw) => {
    const spec = validateSpec(raw);
    expect(spec, key).not.toHaveProperty("error");
    const [head, sub] = key.split("=")[0]!.split(".") as [string, string];
    expect(((spec as unknown as Record<string, Record<string, unknown>>)[head] ?? {})[sub]).toEqual((raw[head] as Record<string, unknown>)[sub]);
    expect(unimplementedSpecKeys(spec)).toEqual([key]);
    expect(validateSpec(raw, { refuseNewer: NEWER_VERSION_LINK })).toEqual({ error: NEWER_VERSION_LINK, newer: true });
  });

  it.each(Object.entries(SAMPLES))("runSpec and runRows refuse %s before any query", async (_key, raw) => {
    const spec = validateSpec(raw) as AskSpec;
    expect(await runSpec(untouched, spec, {})).toEqual({ error: NEWER_VERSION_LINK, caveats: [] });
    expect(await runRows(untouched, spec, {}, 0)).toEqual({ error: NEWER_VERSION_LINK });
  });

  it.each([
    [{ ...trend, trend: { change: "sideways" } }, "trend.change"],
    [{ ...trend, trend: { months: [6, 2] } }, "trend.months"],
    [{ ...trend, trend: { months: [0, 3] } }, "trend.months"],
    [{ ...trend, trend: { months: "partial" } }, "trend.months"],
    [{ ...trend, trend: { minBase: 999 } }, "trend.minBase"],
    [{ ...trend, trend: { minBase: 1500.5 } }, "trend.minBase"],
    [{ ...trend, trend: { firstOnly: false } }, "trend.firstOnly"],
    [{ block: "timeseries", measure: "value", filters: {}, timeseries: { grain: "week" } }, "timeseries.grain"],
    [{ block: "timeseries", measure: "value", filters: {}, timeseries: { months: "whole" } }, "timeseries.months"],
    [{ block: "network", measure: "value", filters: { authorityId: 1 }, network: { show: 20 } }, "network.show"],
    [{ block: "network", measure: "value", filters: { authorityId: 1 }, network: { since: 2020 } }, "network.since"],
    [{ block: "network", measure: "value", filters: { authorityId: 1 }, network: { partners: "before" } }, "network.partners"],
    [{ block: "sankey", measure: "value", filters: { supplierId: 1 }, sankey: { shown: 7 } }, "sankey.shown"],
    [{ block: "scatter", measure: "value", filters: {}, scatter: { flag: "da_unknown" } }, "scatter.flag"],
    [{ block: "distribution", measure: "value", filters: { authorityId: 1 }, peers: { similar: "yes" } }, "peers.similar"],
  ])("refuses a malformed value instead of dropping it (%o)", (raw, path) => {
    expect(parseSpec(raw)).toEqual({ error: `Valoare invalidă pentru ${path}.` });
  });

  it.each([
    [{ ...stat, filters: { purchaseKind: "bunuri" } }, "Valoare invalidă pentru purchaseKind."],
    [{ ...stat, filters: { procedure: "licitatie" } }, "Valoare invalidă pentru procedure."],
    [{ ...stat, filters: { purchaseValueMin: -1 } }, "Limită sau identificator invalid: purchaseValueMin."],
    [{ ...stat, filters: { purchaseValueMin: 10, purchaseValueMax: 5 } }, "Valoarea minimă depășește maximul; corectează limitele."],
    [{ ...table, filters: { firmSeat: "here" } }, "Valoare invalidă pentru firmSeat."],
    [{ ...table, filters: { seatCounty: 12 } }, "Valoare invalidă pentru seatCounty."],
    [{ ...table, filters: { newScope: "all" } }, "Valoare invalidă pentru newScope."],
    [{ ...table, filters: { newSince: 1980 } }, "Limită sau identificator invalid: newSince."],
    [{ ...table, filters: { mainClient: false } }, "Valoare invalidă pentru mainClient."],
    [{ ...stat, filters: { authorityKind: "local" } }, "Tip de instituție necunoscut."],
    [{ ...trend, trend: { change: "up", bogus: 1 } }, "Câmp necunoscut în întrebare; condiția nu a fost ignorată."],
    [{ ...trend, trend: ["up"] }, "Valoare invalidă pentru trend."],
    [{ ...table, peers: { similar: true } }, "Grupul de comparație nu se aplică acestei întrebări."],
    [{ ...stat, future: { x: 1 } }, "Câmp necunoscut în întrebare; condiția nu a fost ignorată."],
  ])("refuses %o", (raw, error) => {
    expect(validateSpec(raw)).toEqual({ error });
  });

  it("drops another block's options, which cannot change this answer (a derived link built by spread)", () => {
    expect(validateSpec({ ...table, trend: { change: "up" }, network: "anything" })).toEqual(table);
    expect(validateSpec({ ...stat, scatter: { flag: "da_split" } })).toEqual(stat);
  });

  it("reads empty options and peers as today's answer, so nothing is refused", () => {
    const spec = validateSpec({ block: "distribution", measure: "value", filters: { authorityId: 1 }, peers: {} });
    expect(spec).toMatchObject({ peers: {} });
    expect(unimplementedSpecKeys(spec)).toEqual([]);
    expect(unimplementedSpecKeys(validateSpec({ ...trend, trend: {} }))).toEqual([]);
  });

  it("refuses the newer key before the rules a newer release may have changed", () => {
    // Today a trend refuses months; with trend.months a newer link is "newer", not "invalid".
    const raw = { ...trend, filters: { ...trend.filters, monthFrom: 1 }, trend: { months: [1, 6] } };
    expect(validateSpec(raw)).toHaveProperty("error", expect.stringContaining("Schimbarea compară doi ani întregi"));
    expect(validateSpec(raw, { refuseNewer: NEWER_VERSION_LINK })).toEqual({ error: NEWER_VERSION_LINK, newer: true });
  });

  it("refuses anything else a stored spec carries, which parseSpec never saw", () => {
    expect(unimplementedSpecKeys({ ...stat, future: 1 })).toEqual(["future"]);
    expect(unimplementedSpecKeys({ ...stat, filters: { yearFrom: 2025, futureFilter: "x" } })).toEqual(["filters.futureFilter"]);
    expect(unimplementedSpecKeys({ ...trend, trend: "up" })).toEqual(["trend"]);
    expect(unimplementedSpecKeys({ ...stat, filters: { cpvTerm: "", county: null } })).toEqual([]);
  });
});

describe("today's questions", () => {
  it("every question type, as the builder writes it, uses implemented keys only", () => {
    for (const type of QUESTION_TYPES) {
      const spec = validateSpec(transitionQuestion(defaultQuestion(), type.id).spec);
      if ("error" in spec) continue; // a focal question without its entity is a draft
      expect(unimplementedSpecKeys(spec), type.id).toEqual([]);
    }
    expect(unimplementedSpecKeys(validateSpec({ block: "stat", dataset: "da", measure: "value", filters: {},
      population: { operator: "and", groups: [{ operator: "and", conditions: [{ field: "value", op: "lte", value: "2000000" }] }] } }))).toEqual([]);
  });

  it("the model's schema offers implemented keys only (it is a writer)", () => {
    const top = Object.keys(SPEC_JSON_SCHEMA.properties).filter(key => key !== "filters");
    const filters = Object.keys(SPEC_JSON_SCHEMA.properties.filters.properties).map(key => `filters.${key}`);
    for (const path of [...top, ...filters]) expect(IMPLEMENTED_KEYS.has(path), path).toBe(true);
  });
});
