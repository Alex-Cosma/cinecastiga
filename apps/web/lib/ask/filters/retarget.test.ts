import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FIXTURE_IDENTITIES } from "../fixtures/golden-fixture";
import { legacyCorpus } from "../fixtures/legacy-corpus";
import { cloneQuestion, type QuestionSpec } from "../question-ui";
import { breakdownDeeperSpec, entitySourceSpec } from "../source-spec";
import { BLOCKS, NEWER_VERSION_LINK, optionBelongs, parseSpec, validateSpec, type AskSpec, type Block } from "../spec";
import { formOf } from "./context";
import { FILTER_DEFS, FILTERS } from "./registry";
import { retarget } from "./retarget";

// The derived links "›" (plan §2.4, R8, §6.1): one path, which keeps the conditions and the measure the target applies.

const OPTIONS = ["trend", "timeseries", "network", "sankey", "scatter", "peers"] as const;
const accepted = legacyCorpus(FIXTURE_IDENTITIES).flatMap((entry) => {
  const spec = validateSpec(entry.spec, { refuseNewer: NEWER_VERSION_LINK });
  return "error" in spec ? [] : [{ id: entry.id, spec }];
});
/** What the target applies of the measure: the registry's `measure`, on the form of the retargeted question. */
const appliesMeasure = (spec: QuestionSpec) =>
  FILTERS.measure.engine[formOf(spec)] !== undefined && (FILTERS.measure.choices(spec, {} as never) as readonly unknown[]).includes(spec.measure);
const conditions = (spec: QuestionSpec) => {
  const { block: _block, measure: _measure, trend: _t, timeseries: _ts, network: _n, sankey: _s, scatter: _sc, peers: _p, ...rest } = spec;
  return rest;
};

describe("retarget keeps the question and changes only its block", () => {
  it("on every question of the corpus, toward every block", () => {
    expect(accepted.length).toBeGreaterThan(150);
    let measureKept = 0, measureReset = 0;
    for (const { id, spec } of accepted) {
      const before = structuredClone(spec);
      for (const block of BLOCKS) {
        const next = retarget(spec, block);
        const where = `${id} → ${block}`;
        expect(next.block, where).toBe(block);
        // Every condition stays, as it was: filters, population, threshold, stream, dimension, length, axis.
        expect(conditions(next), where).toEqual(conditions(spec));
        for (const key of OPTIONS) {
          if (optionBelongs(key, block) && spec[key]) expect(next[key], where).toEqual(spec[key]);
          else expect(next, where).not.toHaveProperty(key);
        }
        const kept = appliesMeasure({ ...cloneQuestion(spec), block });
        expect(next.measure, where).toBe(kept ? spec.measure : "value");
        if (spec.measure !== "value") kept ? measureKept++ : measureReset++;
        // parseSpec reads it whole: no option it would drop, no comparison group it would refuse.
        const parsed = parseSpec(next);
        expect("error" in parsed ? parsed.error : null, where).toBeNull();
        for (const key of OPTIONS) expect((parsed as AskSpec)[key], where).toEqual(next[key]);
      }
      expect(spec, id).toEqual(before);
    }
    expect(measureKept).toBeGreaterThan(0);
    expect(measureReset).toBeGreaterThan(0);
  });

  it("drops another block's options and a comparison group the target has none of, and copies what it keeps", () => {
    const trend: AskSpec = { block: "trend", dim: "supplier", measure: "value", filters: { yearFrom: 2024, yearTo: 2025 }, trend: { change: "up", months: [1, 5] } };
    expect(retarget(trend, "stat")).toEqual({ block: "stat", dim: "supplier", measure: "value", filters: { yearFrom: 2024, yearTo: 2025 } });
    const same = retarget(trend, "trend");
    (same.trend!.months as unknown as number[])[1] = 12;
    expect(trend.trend!.months).toEqual([1, 5]);
    const profile: AskSpec = { block: "distribution", dim: "authority", measure: "value", filters: { authorityId: 811 }, peers: { similar: true } };
    expect(retarget(profile, "scatter").peers).toEqual({ similar: true });
    expect(retarget(profile, "table")).not.toHaveProperty("peers");
    expect(parseSpec(retarget(profile, "table"))).not.toHaveProperty("error");
    expect(parseSpec({ ...profile, block: "table" })).toHaveProperty("error");
  });

  it("keeps F3's kind, procedure and size on every answer over the records, which applies them (plan §2.4)", () => {
    const f3: AskSpec = { block: "stat", dataset: "contracts", measure: "value", filters: { purchaseKind: "lucrari", procedure: "deschisa", purchaseValueMin: 1_000_000, yearFrom: 2025, yearTo: 2025 } };
    for (const block of ["table", "timeseries", "map", "breakdown", "trend"] as const) {
      const next = retarget({ ...f3, dim: "supplier" }, block);
      expect([block, next.filters, next.dataset]).toEqual([block, f3.filters, "contracts"]);
      expect(validateSpec({ ...next, ...(block === "trend" ? { filters: { ...next.filters, yearFrom: 2024 } } : {}) }), block).not.toHaveProperty("error");
    }
  });

  it("keeps the order of the keys, so a link that only changes the block keeps the bytes of its permalink", () => {
    const spec: AskSpec = { block: "breakdown", dataset: "da", measure: "value", filters: { county: "Cluj", cpvTerm: "45" } };
    expect(JSON.stringify(retarget(spec, "breakdown"))).toBe(JSON.stringify(spec));
    expect(Object.keys(retarget(spec, "stat"))).toEqual(Object.keys(spec));
  });

  it("applies each filter's onTransition: none today (F1b adds them with the builder's transitions)", () => {
    expect(FILTER_DEFS.filter((def) => def.onTransition).map((def) => def.id)).toEqual([]);
  });
});

describe("the derived links of today go through retarget", () => {
  const derived = accepted.flatMap(({ id, spec }) => {
    const out: { id: string; from: AskSpec; to: AskSpec; target: Block }[] = [];
    if (spec.block === "breakdown") out.push({ id: `${id} › slice`, from: spec, to: breakdownDeeperSpec(spec, "4521"), target: "breakdown" });
    if (spec.block === "table" || spec.block === "trend")
      out.push({ id: `${id} › row`, from: spec, to: entitySourceSpec(spec, { entityId: "27", name: "Firma" }), target: "stat" });
    if (spec.block === "entity_card" && spec.rankBy === "value")
      out.push({ id: `${id} › ranking`, from: spec, to: { ...retarget(spec, "table"), measure: "value", topN: 1 }, target: "table" });
    return out;
  });

  it("each one is a question the engine accepts, with its measure and the conditions the target keeps", () => {
    expect(new Set(derived.map((d) => d.target))).toEqual(new Set(["breakdown", "stat", "table"]));
    for (const { id, from, to, target } of derived) {
      expect(to.block, id).toBe(target);
      const validated = validateSpec(to);
      expect("error" in validated ? validated.error : null, id).toBeNull();
      const { cpvTerm: _a, supplierName: _b, supplierId: _c, authorityName: _d, authorityId: _e, county: _f, ...kept } = from.filters;
      expect(to.filters, id).toMatchObject(kept);
      if (target === "stat") expect(to.measure, id).toBe(from.measure === "count" ? "count" : "value");
    }
  });

  it("a slice one level down asks the same breakdown on the slice's code, in lei (the breakdown has no other measure yet)", () => {
    const counted: AskSpec = { block: "breakdown", measure: "count", dataset: "contracts", filters: { county: "Cluj", cpvTerm: "45" } };
    expect(breakdownDeeperSpec(counted, "4521")).toEqual({ block: "breakdown", measure: "value", dataset: "contracts", filters: { county: "Cluj", cpvTerm: "4521" } });
  });

  it("no other code builds another block's question by spreading a spec", () => {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) { if (!["node_modules", ".next", "fixtures"].includes(name)) walk(path); continue; }
        if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path);
      }
    };
    for (const dir of ["app", "lib", "components"]) walk(join(root, dir));
    const spread = /\{\s*\.\.\.[\w.?()[\]]+\s*,\s*block\s*:/g;
    // The two forms of before (blocks.tsx sliceUrl, source-spec.ts rowsSpec).
    expect(`{ ...sp, block:"breakdown", measure:"value" }`.match(spread)).toHaveLength(1);
    expect(`return {\n    ...spec,\n    block: "stat",`.match(spread)).toHaveLength(1);
    expect(files.length).toBeGreaterThan(300);
    const spreads = files.flatMap((file) => [...readFileSync(file, "utf8").matchAll(spread)].map(() => relative(root, file)));
    expect(spreads).toEqual([]);
  });
});
