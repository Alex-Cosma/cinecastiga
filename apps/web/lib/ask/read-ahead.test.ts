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
const SAMPLES: Record<keyof typeof READ_AHEAD_KEYS, Record<string, unknown>> = {
  "filters.authorityKind=local_admin": { block: "map", measure: "value", filters: { authorityKind: "local_admin" } },
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
    expect(Object.keys(SAMPLES).sort()).toEqual(Object.keys(READ_AHEAD_KEYS).sort());
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
    [{ ...stat, filters: { purchaseValueMin: 10, purchaseValueMax: 5 } }, "Limita de sus a mărimii trebuie să fie peste cea de jos; corectează limitele."],
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

  it.each(["hasOwnProperty", "__proto__", "toString", "constructor"])("refuses the option %s as unknown, not as an Object.prototype member", (sub) => {
    // JSON.parse, as a link or a body is read: "__proto__" becomes an own key there.
    const raw = JSON.parse(`{"block":"trend","dim":"supplier","measure":"value","filters":{"yearFrom":2024,"yearTo":2025},"trend":{"${sub}":1}}`);
    expect(validateSpec(raw)).toEqual({ error: "Câmp necunoscut în întrebare; condiția nu a fost ignorată." });
    expect(unimplementedSpecKeys(raw)).toEqual([`trend.${sub}`]);
    expect(unimplementedSpecKeys(JSON.parse(`{"block":"stat","measure":"value","filters":{},"${sub}":{"x":1}}`))).toEqual([sub]);
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
    // Today a distribution needs its entity; a newer link with the group's main domain (F6a phase 2) is "newer", not "invalid".
    const raw = { block: "distribution", measure: "value", filters: {}, peers: { domain: true } };
    expect(validateSpec(raw)).toHaveProperty("error", expect.stringContaining("requires filters.authorityName"));
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

  // Plan §2.4, §6.1: every key parseSpec reads is either in the model's schema or left out by name,
  // so a new key cannot reach (or miss) the model without a decision about it.
  it("leaves out of the model's schema exactly the keys named here, and every key read ahead", () => {
    const NOT_FOR_THE_MODEL = [
      // Ids come from grounding the names the model writes; a locality and a person from their pickers.
      "filters.authorityId", "filters.supplierId", "filters.compareWithId", "filters.uatSiruta", "filters.uatName", "filters.adminPersonKey",
      // Months, the precise selection, the record threshold and the comparison mode: builder and link only.
      "filters.monthFrom", "filters.monthTo", "population", "minimumRecords", "comparisonMode",
      // F2: the trend's lenses come from the builder and the rules interpreter (plan §2.7); the model path is off.
      "trend.change", "trend.months", "trend.order", "trend.minBase", "trend.firstOnly",
      // F3: the evolution's pace, split and same months, likewise (the strip, the "Când?" window and links).
      "timeseries.grain", "timeseries.split", "timeseries.months",
      // F4: the network's groups, year, order, length and signals and the flow's length: the builder, the strip and links.
      "network.partners", "network.since", "network.order", "network.show", "network.signals", "sankey.shown",
      // F6a: the distribution's group, from the builder's «Față de cine?» and the rules interpreter.
      "peers.similar", "peers.activity",
      // F5: the ranked winners, from the builder's rows CÂȘTIGĂTORII / INSTITUȚIILE and links.
      "filters.newSince", "filters.newScope", "filters.mainClient", "filters.dominantSupplier",
    ];
    const schema = new Set([...Object.keys(SPEC_JSON_SCHEMA.properties).filter(key => key !== "filters"),
      ...Object.keys(SPEC_JSON_SCHEMA.properties.filters.properties).map(key => `filters.${key}`)]);
    const outside = [...IMPLEMENTED_KEYS, ...Object.keys(READ_AHEAD_KEYS)].filter(path => !schema.has(path));
    expect(outside.sort()).toEqual([...NOT_FOR_THE_MODEL, ...Object.keys(READ_AHEAD_KEYS)].sort());
  });
});
