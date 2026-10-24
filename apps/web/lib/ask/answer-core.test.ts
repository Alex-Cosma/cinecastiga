import { afterEach, describe, expect, it } from "vitest";
import {
  alignAnswerVersions, ANSWER_VERSIONS, answerCore, answerVersion, canonicalJson, KEY_VERSIONS, readAnswerVersion,
  sameAnswerCore, sameAnswerVersion,
} from "./answer-core";
import { FILTERS } from "./filters/registry";
import { SCOPE_CHANGES } from "./filters/today";
import { personClipSpec } from "./site-links";
import { BLOCKS, type AskSpec } from "./spec";
import { comparableMethodologies, methodologiesDiffer } from "../monitoring-shared";

// The answer versions and the core a watch compares (plan §2.8, §6.2).

const stat: AskSpec = { block: "stat", measure: "value", filters: { county: "Cluj" } };
const trend: AskSpec = { block: "trend", dim: "supplier", measure: "value", filters: { yearFrom: 2024, yearTo: 2025 } };
const map: AskSpec = { block: "map", measure: "value", filters: {} };
const hospitals: AskSpec = { block: "stat", measure: "value", filters: { authorityKind: "spital" } };
const smallFirms: AskSpec = { block: "table", dim: "supplier", measure: "value", topN: 10, filters: { maxEmployees: 9 } };
const smallFirmsBuyers: AskSpec = { ...smallFirms, dim: "authority" };
const person = personClipSpec("popescu ion|1970-01-01|cluj");
/** A run as stored by monitoring-engine.ts, with this question's answer version, or none (a run from before F0). */
const run = (spec: AskSpec, withAnswer = true) => ({ version: "monitoring-1", refresh: { version: "fixture-v1" }, ...(withAnswer ? { answer: answerVersion(spec) } : {}) });
/** The versions of the D1 and F3 releases, as they will be declared. */
const bumpKind = () => { KEY_VERSIONS.kind = { version: "kind-2", label: "Tipul instituției", paths: ["filters.authorityKind"] }; };
const bumpEmployees = () => {
  KEY_VERSIONS["table:employees"] = { version: "table:employees-2", label: "Angajații pe clasamentul firmelor", paths: ["filters.minEmployees", "filters.maxEmployees"],
    blocks: ["table", "entity_card"], when: (spec) => spec.dim === "supplier" };
};

afterEach(() => {
  for (const block of Object.keys(ANSWER_VERSIONS)) delete ANSWER_VERSIONS[block as keyof typeof ANSWER_VERSIONS];
  for (const id of Object.keys(KEY_VERSIONS)) delete KEY_VERSIONS[id];
});

describe("the version of an answer", () => {
  it("is the block's, then each key's the question carries; none changed in F0", () => {
    expect(ANSWER_VERSIONS).toEqual({});
    expect(KEY_VERSIONS).toEqual({});
    for (const block of BLOCKS) expect(answerVersion({ block, measure: "value", filters: {} })).toEqual({ question: `${block}-1`, conditions: {} });
    bumpKind(); bumpEmployees(); ANSWER_VERSIONS.trend = "trend-2";
    expect(answerVersion(hospitals)).toEqual({ question: "stat-1", conditions: { kind: "kind-2" } });
    expect(answerVersion(stat)).toEqual({ question: "stat-1", conditions: {} });
    expect(answerVersion(smallFirms)).toEqual({ question: "table-1", conditions: { "table:employees": "table:employees-2" } });
    expect(answerVersion(smallFirmsBuyers)).toEqual({ question: "table-1", conditions: {} });
    expect(answerVersion({ ...smallFirms, block: "stat" })).toEqual({ question: "stat-1", conditions: {} });
    expect(answerVersion(trend)).toEqual({ question: "trend-2", conditions: {} });
    expect(answerVersion(person)).toEqual({ question: "table-1", conditions: {} });
  });

  it("reads a run from before F0 as \"<block>-1\" and a condition without a version as \"<id>-1\"", () => {
    expect(readAnswerVersion(undefined, "trend")).toEqual({ question: "trend-1", conditions: {} });
    expect(readAnswerVersion({ question: "trend-2", conditions: { kind: "kind-2", bad: 3 } }, "trend")).toEqual({ question: "trend-2", conditions: { kind: "kind-2" } });
    expect(alignAnswerVersions({ question: "stat-1", conditions: {} }, { question: "stat-1", conditions: { kind: "kind-2" } }))
      .toEqual([{ question: "stat-1", conditions: { kind: "kind-1" } }, { question: "stat-1", conditions: { kind: "kind-2" } }]);
    expect(sameAnswerVersion({ question: "stat-1", conditions: {} }, { question: "stat-1", conditions: { kind: "kind-1" } })).toBe(true);
    expect(sameAnswerVersion({ question: "stat-1", conditions: {} }, { question: "stat-1", conditions: { kind: "kind-2" } })).toBe(false);
  });

  it("is well formed, and covers every key that leaves the records for a group (plan §2.2)", () => {
    bumpKind(); bumpEmployees(); ANSWER_VERSIONS.trend = "trend-2";
    for (const [block, version] of Object.entries(ANSWER_VERSIONS)) expect(version).toMatch(new RegExp(`^${block}-([2-9]|[1-9]\\d+)$`));
    for (const [id, key] of Object.entries(KEY_VERSIONS)) {
      expect(key.version.startsWith(`${id}-`) && Number(key.version.slice(id.length + 1)) >= 2, id).toBe(true);
      expect(BLOCKS as readonly string[], id).not.toContain(id);
      expect(key.label.length, id).toBeGreaterThan(0);
    }
    for (const change of SCOPE_CHANGES) {
      const block = change.form.split(":")[0]!;
      const keys: readonly string[] = FILTERS[change.filter].keys;
      const covered = ANSWER_VERSIONS[block as keyof typeof ANSWER_VERSIONS] === change.version
        || Object.values(KEY_VERSIONS).some((key) => key.version === change.version && key.paths.some((path) => keys.includes(path))
          && (!key.blocks || key.blocks.includes(block as never)));
      expect(covered, `${change.filter} on ${change.form}: ${change.version}`).toBe(true);
    }
  });
});

describe("what a watch compares between two checks", () => {
  it("a run from before F0 against one of today: no change", () => {
    for (const spec of [stat, trend, map, hospitals, smallFirms, person])
      expect(methodologiesDiffer(run(spec, false), run(spec), spec.block), spec.block).toBe(false);
  });

  it("a new trend version changes the methodology of trend watches only, once", () => {
    const before = Object.fromEntries([stat, trend, map].map((spec) => [spec.block, run(spec)]));
    ANSWER_VERSIONS.trend = "trend-2";
    const after = Object.fromEntries([stat, trend, map].map((spec) => [spec.block, run(spec)]));
    expect(methodologiesDiffer(before.trend!, after.trend!, "trend")).toBe(true);
    expect(methodologiesDiffer(before.stat!, after.stat!, "stat")).toBe(false);
    expect(methodologiesDiffer(before.map!, after.map!, "map")).toBe(false);
    // The next check compares trend-2 with trend-2.
    expect(methodologiesDiffer(after.trend!, run(trend), "trend")).toBe(false);
  });

  it("a key's version alerts only the questions that carry it; the person's firms never", () => {
    const specs = [stat, hospitals, smallFirms, smallFirmsBuyers, person, trend];
    const before = specs.map((spec) => run(spec));
    bumpKind(); bumpEmployees();
    const changed = specs.filter((spec, i) => methodologiesDiffer(before[i]!, run(spec), spec.block));
    expect(changed).toEqual([hospitals, smallFirms]);
    // A run stored before F0, against the new version, alerts as well.
    expect(methodologiesDiffer(run(hospitals, false), run(hospitals), "stat")).toBe(true);
  });

  it("a changed refresh methodology is still a change, as before", () => {
    expect(methodologiesDiffer(run(stat), { ...run(stat), refresh: { version: "fixture-v2" } }, "stat")).toBe(true);
  });

  it("shows both sides with the same answer fields, so \"Ce s-a schimbat\" lists only what changed", () => {
    const before = run(hospitals, false);
    bumpKind();
    const [a, b] = comparableMethodologies(before, run(hospitals), "stat");
    expect(a!.answer).toEqual({ question: "stat-1", conditions: { kind: "kind-1" } });
    expect(b.answer).toEqual({ question: "stat-1", conditions: { kind: "kind-2" } });
    expect(comparableMethodologies(null, run(stat), "stat")).toEqual([null, run(stat)]);
  });

  it("compares the core of the answer as jsonb does: key order does not count, array order does", () => {
    const data = { block: "table", rows: [{ entityId: "1", value: 10, name: "A" }, { entityId: "2", value: 5, name: "B" }], total: 2 };
    expect(answerCore("table", data)).toBe(data);
    expect(sameAnswerCore("table", data, { total: 2, rows: [{ name: "A", value: 10, entityId: "1" }, { name: "B", entityId: "2", value: 5 }], block: "table" })).toBe(true);
    expect(sameAnswerCore("table", data, { ...data, rows: [...data.rows].reverse() })).toBe(false);
    expect(sameAnswerCore("table", data, { ...data, total: 3 })).toBe(false);
    // As stored: an undefined field is absent, NaN is null.
    expect(sameAnswerCore("stat", { stat: { value: 1, note: undefined } }, { stat: { value: 1 } })).toBe(true);
    expect(canonicalJson({ b: [2, { d: 1, c: NaN }], a: null })).toBe('{"a":null,"b":[2,{"c":null,"d":1}]}');
    expect(canonicalJson(undefined)).toBe("null");
  });
});
