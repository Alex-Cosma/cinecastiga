import { describe, it, expect } from "vitest";
import { askLink, entitySourceSpec, leaderAlone, leaderAloneSpecs, yearSourceLink } from "./source-spec";
import { decodeSpec } from "./permalink";
import { runnableError, validateSpec, type AskSpec } from "./spec";

// "Cine conduce?" over a group of one (plan §4.13): the answer names the lone county council and offers two other answers.
describe("a county's one county council", () => {
  const councils: AskSpec = { block: "entity_card", dim: "authority", rankBy: "value", measure: "value", dataset: "da",
    filters: { authorityKind: "consiliu_judetean", county: "Cluj", yearFrom: 2025, yearTo: 2025, cpvTerm: "45" } };
  it("is said instead of a crown, only for a county council in a county", () => {
    expect(leaderAlone(councils)).toBe("În județul Cluj e un singur consiliu județean.");
    expect(leaderAlone({ ...councils, rankBy: "risk", filters: { authorityKind: "consiliu_judetean", county: "Bucuresti" } })).toBe("În București e un singur consiliu județean.");
    expect(leaderAlone({ ...councils, filters: { ...councils.filters, authorityKind: "spital" } })).toBeNull();
    expect(leaderAlone({ ...councils, filters: { authorityKind: "consiliu_judetean" } })).toBeNull();
    expect(leaderAlone({ ...councils, dim: "supplier" })).toBeNull();
  });
  it("leads to where it stands among the other councils and to what it buys, the same selection", () => {
    const { peers, total } = leaderAloneSpecs(councils, { entityId: "41", name: "JUDETUL CLUJ" });
    expect(peers).toEqual({ block: "distribution", dim: "authority", measure: "value", filters: { authorityName: "JUDETUL CLUJ", authorityId: 41, authorityKind: "consiliu_judetean" } });
    expect(total).toMatchObject({ block: "stat", dataset: "da", filters: { authorityName: "JUDETUL CLUJ", authorityId: 41, yearFrom: 2025, yearTo: 2025, cpvTerm: "45" } });
    expect(total).not.toHaveProperty("rankBy");
    expect(total.filters).not.toHaveProperty("county");
    expect(total.filters).not.toHaveProperty("authorityKind");
    for (const spec of [peers, total]) {
      const parsed = validateSpec(spec);
      expect("error" in parsed ? parsed.error : runnableError(parsed)).toBeNull();
      expect(decodeSpec(new URL(askLink(spec), "https://example.test").searchParams.get("spec")!)).toEqual(spec);
    }
  });
});
describe("exact chart source conditions", () => {
  const spec: AskSpec = {
    block: "timeseries",
    measure: "count",
    dataset: "da",
    filters: {
      yearFrom: 2024,
      yearTo: 2026,
      monthFrom: 5,
      monthTo: 8,
      county: "Cluj",
    },
  };
  it("keeps count-question rows instead of applying the money-query ceiling", () => {
    expect(
      entitySourceSpec(
        { ...spec, block: "table", dim: "supplier" },
        { entityId: "27", name: "Firma" },
      ),
    ).toMatchObject({
      measure: "count",
      dataset: "da",
      filters: { supplierId: 27, county: "Cluj" },
    });
  });
  it("intersects the unchanged period, including month limits, even for coverage-clamped years", () => {
    const original = { ...spec, filters: { ...spec.filters, yearFrom: 2000 } };
    for (const year of [2018, 2025, 2026]) {
      const params = new URL(
        yearSourceLink(original, year),
        "https://example.test",
      ).searchParams;
      expect(decodeSpec(params.get("spec")!)).toEqual(original);
      expect(JSON.parse(params.get("evidence")!)).toEqual({ years: [year] });
      expect(params.get("drill")).toBe("1");
    }
  });
});
