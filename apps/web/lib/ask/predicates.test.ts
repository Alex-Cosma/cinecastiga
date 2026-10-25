import { describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import type { Grounding } from "./ground";
import { localityScopeError, transitionQuestion } from "./question-ui";
import { namedKind, NEWER_VERSION_LINK, validateSpec, type AskSpec } from "./spec";
import { legacyCorpus } from "./fixtures/legacy-corpus";
import { FIXTURE_IDENTITIES } from "./fixtures/golden-fixture";
import { filterContext, formOf, PROFILE_FORMS } from "./filters/context";
import { baseQuestions } from "./filters/probe";
import { FILTER_DEFS } from "./filters/registry";
import type { EngineLevel, FilterDef, FilterSpec } from "./filters/types";
import {
  andAll, DA_PLAFOND_RON, displayPredicates, groupPredicates, plafondFor, predicateContext, profileMinDas, profilePredicates,
  rowPredicates, trendYearsPredicate, type PredicateCtx,
} from "./predicates";

/*
 * Plan §2.5: one function writes each condition, for the answer, its sources,
 * the CSV, the captures and the "avansat" text. The golden corpus
 * (golden-legacy.integration.test.ts) proves the figures stayed the same;
 * here the functions are checked against the filter registry, without a
 * database: a fake `sql` renders each fragment as text and parameters.
 */

type Rendered = { text: string; params: unknown[] };
const fake = Object.assign(
  (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings: [...strings], values }),
  { array: (values: unknown[]) => ({ array: [...values] }) },
) as unknown as DbSql;
function render(fragment: unknown): Rendered {
  const params: unknown[] = [];
  const walk = (x: unknown): string => {
    const f = x as { strings?: string[]; values?: unknown[]; array?: unknown[] };
    if (f && Array.isArray(f.strings)) return f.strings.reduce((out, s, i) => out + s + (i < f.values!.length ? walk(f.values![i]) : ""), "");
    params.push(f && typeof f === "object" && "array" in f ? f.array : x);
    return `$${params.length}`;
  };
  return { text: walk(fragment).replace(/\s+/g, " ").trim(), params };
}
const texts = (fragments: readonly unknown[]) => fragments.map((f) => { const r = render(f); return `${r.text} ${JSON.stringify(r.params)}`; });

/** What ground() would resolve, without a database: each named key gets an anchor. */
function fakeGrounding(spec: AskSpec): Grounding {
  const f = spec.filters, g: Grounding = {};
  const entity = (id: unknown, fallback: string) => ({ query: "q", entityId: id ? String(id) : fallback, nameDisplay: "N", county: null, alternatives: [] });
  if (f.cpvTerm) g.cpv = { term: String(f.cpvTerm), prefixes: ["336"], matchedNames: [], method: "synonym", excludePrefixes: ["33696"] };
  if (f.authorityName || f.authorityId) g.authority = entity(f.authorityId, "9101");
  if (f.supplierName || f.supplierId) g.supplier = entity(f.supplierId, "9202");
  if (f.compareWith || f.compareWithId) g.compare = entity(f.compareWithId, "9303");
  if (f.county) g.county = { query: String(f.county), canonical: String(f.county) };
  if (f.uatSiruta) g.uat = { siruta: Number(f.uatSiruta), name: null, county: null, authorityIds: ["9404"], nAuthorities: 1 };
  if (f.adminPersonKey || f.adminName) g.admin = { query: "q", personKey: "k", display: "P", supplierIds: ["9505"], nFirms: 1, alternatives: [] };
  return g;
}
/** The institutions of a kind, as authorityKindIds would read them (D1). */
const KIND_IDS = ["9606", "9607"];
const ctxFor = (spec: AskSpec): PredicateCtx =>
  predicateContext(fake, spec, fakeGrounding(spec), { dataset: spec.dataset ?? "all", yearFrom: spec.filters.yearFrom ?? null, yearTo: spec.filters.yearTo ?? null,
    kindIds: namedKind(spec.filters.authorityKind) ? KIND_IDS : null });

/** Each level's output on a spec, as the engine calls it (runSpec; runRows calls the same functions). */
function levelsOf(spec: AskSpec): Record<"row" | "group" | "profile" | "display", string[]> {
  const ctx = ctxFor(spec);
  if (PROFILE_FORMS.includes(formOf(spec))) {
    const role = spec.block === "distribution"
      ? spec.filters.authorityName || spec.filters.authorityId ? "authority" : "supplier"
      : spec.dim === "supplier" ? "supplier" : "authority";
    return { row: [], group: [], profile: texts(profilePredicates(ctx, role, profileMinDas(spec.block))), display: [] };
  }
  const trend = spec.block === "trend";
  const rows = [...rowPredicates(ctx, { years: !trend }), ...(trend ? [trendYearsPredicate(fake, ctx.yearFrom ?? 2018, ctx.yearTo ?? 2026)] : [])];
  return {
    row: texts(rows),
    // The threshold is counted over the rows of the same conditions: `WHERE` stands for them.
    group: texts(groupPredicates(ctx, fake`SOURCE`, fake`WHERE`)),
    profile: [],
    display: displayPredicates(ctx, "T"),
  };
}

/** The spec without the paths a filter owns. */
function without(spec: AskSpec, def: FilterDef): AskSpec {
  const next = structuredClone(spec) as unknown as Record<string, Record<string, unknown>>;
  for (const key of def.keys) {
    const [head, sub] = key.split(".") as [string, string | undefined];
    if (sub === undefined) delete next[head];
    else if (next[head]) delete next[head][sub];
  }
  return next as unknown as AskSpec;
}

/** The function of each level of the registry (filters/types.ts EngineLevel). */
const WRITER: Partial<Record<EngineLevel, "row" | "group" | "profile">> = { row: "row", entityAttr: "row", group: "group", profile: "profile" };

const YEAR = 2026;
const questions = [
  ...baseQuestions(YEAR),
  ...legacyCorpus(FIXTURE_IDENTITIES).flatMap((entry) => {
    const parsed = validateSpec(entry.spec, { refuseNewer: NEWER_VERSION_LINK });
    return "error" in parsed ? [] : [{ name: entry.id, spec: transitionQuestion(parsed as unknown as FilterSpec).spec as FilterSpec }];
  }),
];

describe("each condition is written by the function of its engine level (plan §2.5)", () => {
  it("changes only its own level's conditions, and the shown SQL with them", () => {
    const problems: string[] = [];
    const applied = new Set<string>(), expected = new Set<string>();
    for (const { name, spec: question } of questions) {
      const ctx = filterContext(question, { year: YEAR });
      for (const def of FILTER_DEFS) {
        if (def.stage) continue; // read ahead: refused before any query (F0a)
        for (const value of def.choices(question, ctx)) {
          if (value === undefined) continue;
          const parsed = validateSpec(transitionQuestion(def.write(question, value)).spec);
          if ("error" in parsed || localityScopeError(parsed)) continue;
          const form = formOf(parsed), level = def.engine[form];
          if (level === "block") continue; // the shape of the answer: which population, which axis
          const writer = level ? WRITER[level] : undefined;
          const selection = writer !== undefined && def.scope(form) === "selection";
          if (selection) expected.add(`${def.id} on ${form}`);
          const a = levelsOf(parsed), b = levelsOf(without(parsed, def));
          const changed = (Object.keys(a) as (keyof typeof a)[]).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
          const where = `${def.id}=${JSON.stringify(value)} on ${name} (${form})`;
          for (const k of changed) if (k !== writer && k !== "display") problems.push(`${where}: changes ${k}, its level is ${level ?? "none"}`);
          if (changed.includes("display") && !writer) problems.push(`${where}: changes the shown SQL, not applied (${level ?? "none"})`);
          if (writer && changed.includes(writer)) {
            applied.add(`${def.id} on ${form}`);
            if (writer !== "profile" && !changed.includes("display")) problems.push(`${where}: applied, but the shown SQL omits it`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
    // A selection the registry says the engine applies is written somewhere, on every question that applies it.
    expect([...expected].filter((key) => !applied.has(key)).sort()).toEqual([
      // A distribution's named entity places that profile among its peers; it is not a condition on them.
      "authority on distribution", "supplier on distribution",
    ].filter((key) => expected.has(key)));
  });
});

describe("the conditions of a question", () => {
  const all: AskSpec = {
    block: "table", dim: "authority", measure: "value", dataset: "all", topN: 10,
    population: { operator: "and", groups: [{ operator: "and", conditions: [{ field: "value", op: "gte", value: "100" }] }] },
    minimumRecords: { role: "supplier", count: 5 },
    filters: {
      cpvTerm: "medicamente", county: "Cluj", authorityKind: "spital", authorityName: "Spitalul X", authorityId: 11, supplierName: "Firma Y", supplierId: 22,
      uatSiruta: 54975, uatName: "Cluj-Napoca", minEmployees: 1, maxEmployees: 9, adminPersonKey: "k", yearFrom: 2024, yearTo: 2025, monthFrom: 3, monthTo: 6,
    },
  };

  it("come in a fixed order, so prepared statements and plans stay as they are", () => {
    const ctx = ctxFor(all);
    expect(texts(rowPredicates(ctx)).map((t) => t.replace(/ \[.*$/, ""))).toEqual([
      "d.closing_value > 0",
      "d.closing_value >= $1::numeric",
      "(d.src = 'contracts' or d.closing_value <= $1)",
      "(d.cpv_code like $1)",
      "not (d.cpv_code like $1)",
      "d.county = $1",
      "d.authority_id = any($1::bigint[])",
      "d.authority_id = $1",
      "d.supplier_id = $1",
      "d.authority_id = any($1::bigint[])",
      "d.supplier_id = any($1::bigint[])",
      "d.supplier_id in ( select ep.entity_id from marts.entity_profile ep where ep.role = 'supplier' and ep.employees is not null and ep.employees between $1 and $2 )",
      "substr(d.finalization_date, 1, 7) >= $1",
      "substr(d.finalization_date, 1, 7) <= $1",
      // An id-anchored selection repeats the period as a range its (id, date) indexes can bound.
      "d.finalization_date >= $1",
      "d.finalization_date < $1",
    ]);
    expect(texts(rowPredicates(ctx)).slice(-2)).toEqual(['d.finalization_date >= $1 ["2024-03"]', 'd.finalization_date < $1 ["2025-07"]']);
    expect(texts(profilePredicates(ctx, "authority", 10))).toEqual([
      'ef.role = $1 ["authority"]', "ef.n_das >= $1 [10]", 'lower(unaccent(ef.county)) = $1 ["cluj"]',
      'ef.entity_id = any($1::bigint[]) [["9404"]]', 'ef.entity_id = any($1::bigint[]) [["9606","9607"]]',
    ]);
    // The kind is the list of its institutions (D1): the buyer's id on a record, as on a profile.
    expect(texts(rowPredicates(ctx))[6]).toBe('d.authority_id = any($1::bigint[]) [["9606","9607"]]');
    expect(displayPredicates(ctx, "T")).toContain("authority_id in (…)  -- doar spitale: 2 instituții (după nume, cu institutele clinice)");
    // The count follows the numeral rule (G10, countWords).
    const kindCount = (ids: string[]) => displayPredicates({ ...ctx, kindIds: ids }, "T").find((c) => c.startsWith("authority_id in (…)"));
    expect(kindCount(["9606"])).toBe("authority_id in (…)  -- doar spitale: 1 instituție (după nume, cu institutele clinice)");
    expect(kindCount(Array.from({ length: 351 }, (_, i) => String(i)))).toBe("authority_id in (…)  -- doar spitale: 351 de instituții (după nume, cu institutele clinice)");
    // A kind is never dropped: a caller that did not read its institutions fails.
    expect(() => predicateContext(fake, all, fakeGrounding(all), { dataset: "all", yearFrom: null, yearTo: null })).toThrow(/were not read/);
    // Firm profiles: the firm's own county, never the buyer's kind or locality.
    expect(texts(profilePredicates(ctx, "supplier", 20))).toEqual(['ef.role = $1 ["supplier"]', "ef.n_das >= $1 [20]", 'lower(unaccent(ef.county)) = $1 ["cluj"]']);
  });

  it("repeat the period as a range on id-anchored selections only", () => {
    const range = (filters: AskSpec["filters"]) => texts(rowPredicates(ctxFor({ block: "stat", measure: "value", dataset: "da", filters })))
      .filter((t) => t.startsWith("d.finalization_date"));
    expect(range({ county: "Cluj", yearFrom: 2025, yearTo: 2025 })).toEqual([]);
    expect(range({ supplierId: 22, yearFrom: 2025, yearTo: 2025 })).toEqual(['d.finalization_date >= $1 ["2025"]', 'd.finalization_date < $1 ["2026"]']);
    expect(range({ authorityId: 11, yearFrom: 2024, yearTo: 2025, monthFrom: 1, monthTo: 12 }))
      .toEqual(['d.finalization_date >= $1 ["2024-01"]', 'd.finalization_date < $1 ["2026-01"]']);
    expect(range({ supplierId: 22, yearTo: 2023 })).toEqual(['d.finalization_date < $1 ["2024"]']);
    // A kind of institution is its list of ids (D1), read from the same (authority_id, finalization_date) indexes.
    expect(range({ authorityKind: "spital", yearFrom: 2025, yearTo: 2025 })).toEqual(['d.finalization_date >= $1 ["2025"]', 'd.finalization_date < $1 ["2026"]']);
    // A trend's two years: the sources add the span as a range on id-anchored selections; the answer and other selections keep substr() alone.
    const trend = (filters: AskSpec["filters"], withCtx = true) =>
      render(trendYearsPredicate(fake, 2019, 2024, withCtx ? ctxFor({ block: "trend", dim: "supplier", measure: "value", filters }) : undefined));
    expect(trend({ authorityKind: "comuna", yearFrom: 2019, yearTo: 2024 })).toEqual({
      text: "substr(d.finalization_date,1,4) in ($1, $2) and d.finalization_date >= $3 and d.finalization_date < $4", params: ["2019", "2024", "2019", "2025"] });
    expect(trend({ county: "Cluj", yearFrom: 2019, yearTo: 2024 }).text).toBe("substr(d.finalization_date,1,4) in ($1, $2)");
    expect(trend({ authorityKind: "comuna" }, false).text).toBe("substr(d.finalization_date,1,4) in ($1, $2)");
  });

  it("count the record threshold over the rows of the same selection", () => {
    const ctx = ctxFor(all), rows = rowPredicates(ctx);
    const [threshold] = groupPredicates(ctx, fake`SOURCE`, andAll(fake, rows)).map(render);
    expect(threshold!.text).toBe(`d.supplier_id in (select d.supplier_id from SOURCE d where ${render(andAll(fake, rows)).text} and d.supplier_id is not null group by d.supplier_id having count(*) >= $${threshold!.params.length})`);
    expect(threshold!.params.at(-1)).toBe(5);
    const { minimumRecords: _threshold, ...withoutThreshold } = all;
    expect(groupPredicates(ctxFor(withoutThreshold), fake`SOURCE`, fake`true`)).toEqual([]);
  });

  it("bound direct acquisitions on every stream that has them, with one writer per stream", () => {
    expect([plafondFor("all"), plafondFor("da"), plafondFor("contracts")]).toEqual(["da-branch", "strict", "none"]);
    const bound = (dataset: NonNullable<AskSpec["dataset"]>) => texts(rowPredicates(ctxFor({ block: "stat", measure: "value", dataset, filters: {} })));
    expect(bound("da")).toEqual(["d.closing_value > 0 []", `d.closing_value <= $1 [${DA_PLAFOND_RON}]`]);
    expect(bound("contracts")).toEqual(["d.closing_value > 0 []"]);
  });

  it("read a selection made only of included institutions and firms from their indexes", () => {
    const list = (field: "authority" | "supplier" | "cpv", op: "in" | "not_in", values: string[]) => ({ operator: "and" as const, conditions: [{ field, op, values }] });
    const population = (operator: "and" | "or", ...groups: ReturnType<typeof list>[]) =>
      render(rowPredicates(ctxFor({ block: "stat", measure: "value", dataset: "da", filters: {}, population: { operator, groups } }))[1]).text;
    // A capture's entity (buyer or firm): both lists, no coalesce, so a bitmap of the two id indexes serves it.
    expect(population("or", list("authority", "in", ["1"]), list("supplier", "in", ["1"]))).toBe("(d.authority_id = any($1::bigint[]) or d.supplier_id = any($2::bigint[]))");
    // Mixed with a condition no index serves, and every exclusion, keep today's form (and plans).
    expect(population("or", list("authority", "in", ["1"]), list("cpv", "in", ["45"]))).toBe("(coalesce(d.authority_id = any($1::bigint[]), false) or coalesce(d.cpv_code like any($2::text[]), false))");
    expect(population("and", list("supplier", "not_in", ["2"]))).toBe("not (coalesce(d.supplier_id = any($1::bigint[]), false))");
  });

  it("put both entities of a comparison in place of the condition on their role", () => {
    const compare: AskSpec = { block: "compare", measure: "value", filters: { supplierName: "A", supplierId: 1, compareWith: "B", compareWithId: 2, authorityId: 3, authorityName: "C" } };
    // Focal is the institution when one is named; the comparison is on its role.
    expect(texts(rowPredicates(ctxFor(compare))).slice(2)).toEqual(['d.supplier_id = $1 ["1"]', 'd.authority_id in ($1, $2) ["3","2"]']);
    expect(displayPredicates(ctxFor(compare), "T").slice(2)).toEqual(["authority_id in (3, 2)", "supplier_id = 1"]);
    const firms: AskSpec = { block: "compare", measure: "value", filters: { supplierName: "A", supplierId: 1, compareWith: "B", compareWithId: 2 } };
    expect(texts(rowPredicates(ctxFor(firms))).slice(2)).toEqual(['d.supplier_id in ($1, $2) ["1","2"]']);
  });
});
