import { describe, expect, it } from "vitest";
import type { Grounding } from "./ground";
import { pillFilters } from "./pill-filters";
import { buildPills } from "./pills";
import type { AskSpec } from "./spec";

/*
 * The answer head's pills open their filters' windows (owner, 1 November
 * 2026): each server pill must be read back as the filter it states, the
 * engine's names (a place, a domain, an institution) by their order.
 */

const cpv = (names: string[], excluded = 0): NonNullable<Grounding["cpv"]> => ({
  term: "x", prefixes: ["341"], matchedNames: names, method: "synonym", ...(excluded ? { excludePrefixes: Array.from({ length: excluded }, (_, i) => `3369${i}`) } : {}),
});
const entity = (name: string) => ({ query: name, entityId: "1", nameDisplay: name, county: null, alternatives: [] });
const read = (spec: AskSpec, grounding: Grounding, labels = {}) => {
  const pills = buildPills(spec, grounding, labels);
  const filters = pillFilters(spec, pills, labels);
  return pills.map((pill, i) => [pill, filters[i]]);
};

describe("which filter each answer pill states", () => {
  it("reads a typed ranking's pills: its shape, the domain and the place the engine named, the period, the stream", () => {
    const spec: AskSpec = { block: "table", measure: "value", dim: "supplier", topN: 10, filters: { cpvTerm: "deszapezire", county: "Suceava", yearFrom: 2024, yearTo: 2024 } };
    expect(read(spec, { cpv: cpv(["Vehicule pentru întreținere pe timp de iarnă (34143000-1)", "a", "b"]), county: { query: "Suceava", canonical: "Suceava" } })).toEqual([
      ["clasament", null],
      ["top 10 furnizori", "topN"],
      ["valoarea înregistrată", "measure"],
      ["Vehicule pentru întreținere pe timp de iarnă (34143000-1) +2 CPV", "cpvTerm"],
      ["județul Suceava", "county"],
      ["2024", "period"],
      ["toate achizițiile: directe și din proceduri", "dataset"],
    ]);
  });

  it("gives the domain its excluded subclasses' pill, and a kind between two names", () => {
    const spec: AskSpec = { block: "stat", measure: "value", filters: { cpvTerm: "medicamente", authorityKind: "spital", county: "Cluj", yearFrom: 2024, yearTo: 2024 } };
    expect(read(spec, { cpv: cpv(["Produse farmaceutice (33600000-6)"], 3), county: { query: "Cluj", canonical: "Cluj" } }).map(([, id]) => id))
      .toEqual([null, "measure", "cpvTerm", "cpvTerm", "authorityKind", "county", "period", "dataset"]);
  });

  it("reads a town hall and an institution by name, and the risk cloud's group as its subject", () => {
    const hall: AskSpec = { block: "breakdown", measure: "value", filters: { uatSiruta: 44845, uatName: "Municipiul Râmnicu Sărat (Buzău)" } };
    expect(read(hall, { uat: { siruta: 44845, name: "RAMNICU SARAT", county: "Buzău", authorityIds: ["1"], nAuthorities: 1 } })).toEqual([
      ["pe domenii", null], ["valoarea înregistrată", "measure"], ["Municipiul Râmnicu Sărat (Buzău)", "locality"], ["toți anii", "period"],
      ["toate achizițiile: directe și din proceduri", "dataset"],
    ]);
    const pair: AskSpec = { block: "compare", measure: "value", filters: { authorityId: 1, authorityName: "MUNICIPIUL BUZAU", compareWithId: 2, compareWith: "MUNICIPIUL BRAILA" } };
    expect(read(pair, { authority: entity("MUNICIPIUL BUZAU"), compare: entity("MUNICIPIUL BRAILA") }).map(([, id]) => id))
      .toEqual([null, "measure", "authority", "compareWith", "period", "dataset"]);
    const cloud: AskSpec = { block: "scatter", measure: "value", dim: "authority", filters: { county: "Buzău" }, scatter: { rankBy: "risk" } };
    expect(read(cloud, { county: { query: "Buzău", canonical: "Buzău" } }, { scatterGroup: 337 })[0]).toEqual(["337 de instituții publice", "dim"]);
  });

  it("leaves the names as text when their number does not add up (a name the engine could not resolve has no pill)", () => {
    const spec: AskSpec = { block: "table", measure: "value", dim: "supplier", topN: 10, filters: { cpvTerm: "iluminat", county: "Buzău" } };
    // No CPV grounding: one pill where the spec has two named filters; the period and the stream are still theirs.
    expect(read(spec, { county: { query: "Buzău", canonical: "Buzău" } }).map(([, id]) => id))
      .toEqual([null, "topN", "measure", null, "period", "dataset"]);
  });
});
