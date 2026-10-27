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
  andAll, DA_PLAFOND_RON, displayPredicates, fullValueUnion, groupPredicates, plafondFor, predicateContext, profileMinDas, profilePredicates,
  rowPredicates, trendGroupOf, trendGroupSql, trendYearsPredicate, type PredicateCtx,
} from "./predicates";
import { partialMonths, sameMonthsWindow, type CoveragePeriods } from "./months-window";

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
  if (f.seatCounty) g.seatCounty = { query: String(f.seatCounty), canonical: String(f.seatCounty) };
  if (f.uatSiruta) g.uat = { siruta: Number(f.uatSiruta), name: null, county: null, authorityIds: ["9404"], nAuthorities: 1 };
  if (f.adminPersonKey || f.adminName) g.admin = { query: "q", personKey: "k", display: "P", supplierIds: ["9505"], nFirms: 1, alternatives: [] };
  return g;
}
/** The institutions of a kind, as authorityKindIds would read them (D1). */
const KIND_IDS = ["9606", "9607"];
/** Both channels complete until 31 May 2026: a trend's `auto` months on 2025 → 2026 are January–May. */
const PERIODS: CoveragePeriods = {
  da: { from: "2018-04-02", to: "2026-09-25", completeUntil: "2026-05-31" },
  contracts: { from: "2018-01-03", to: "2026-09-25", completeUntil: "2026-05-31" },
};
/** What runSpec resolves before its context: the trend's same months (sameMonthsWindow). */
function trendMonthsOf(spec: AskSpec) {
  if (spec.block !== "trend") return null;
  const window = sameMonthsWindow(PERIODS, spec.dataset ?? "all", spec.filters.yearTo ?? 2026, spec.trend?.months);
  return "error" in window ? null : partialMonths(window);
}
const ctxFor = (spec: AskSpec): PredicateCtx =>
  predicateContext(fake, spec, fakeGrounding(spec), { dataset: spec.dataset ?? "all", yearFrom: spec.filters.yearFrom ?? null, yearTo: spec.filters.yearTo ?? null,
    kindIds: namedKind(spec.filters.authorityKind) ? KIND_IDS : null, trendMonths: trendMonthsOf(spec), seat: true });

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
  const rows = [...rowPredicates(ctx, { years: !trend }), ...(trend ? [trendYearsPredicate(fake, ctx.yearFrom ?? 2018, ctx.yearTo ?? 2026, ctx.trendMonths)] : [])];
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
      // F4: the network's „Cu semnale” selects partners by the signals on their whole relation, grouped by
      // relations.ts (networkAnswer, networkMembersCond for the sources), not by a predicate of this module.
      "networkSignals on network",
      // F4: „Doar clienții comuni” is the institutions the pre-step P finds in the answer's transaction
      // (compare-prestep.ts); rowPredicates writes them once found (PredicateCtx.shared, tested below).
      "sharedPartners on compare",
    ].filter((key) => expected.has(key)));
    // ~3 s alone; the whole suite on a shared machine took it to 7 s, past the default 5 s (S4 review).
  }, 30_000);
});

describe("the shared clients of two compared firms (F4, PredicateCtx.shared)", () => {
  const spec: AskSpec = { block: "compare", measure: "value", filters: { supplierId: 10, compareWithId: 11, sharedPartners: true } };
  const grounding = { supplier: { entityId: "10" }, compare: { entityId: "11" } } as unknown as Grounding;
  const ctx = predicateContext(fake, spec, grounding, { dataset: "all", yearFrom: null, yearTo: null, kindIds: null, seat: true });
  it("keeps only their records once the pre-step found them, none when there are none", () => {
    expect(ctx.shared).toBeNull();
    expect(texts(rowPredicates({ ...ctx, shared: ["1", "2"] })).join(" and ")).toContain("d.authority_id = any($");
    expect(texts(rowPredicates({ ...ctx, shared: [] })).some((t) => t.includes("d.authority_id = any("))).toBe(true);
    expect(displayPredicates({ ...ctx, shared: ["1", "2"] }, "T").join("\n")).toContain("doar clienții comuni: 2 instituții");
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
    expect(() => predicateContext(fake, all, fakeGrounding(all), { dataset: "all", yearFrom: null, yearTo: null, seat: true })).toThrow(/were not read/);
    // Firm profiles: the firm's own county, never the buyer's kind or locality; its seat since F4 (owner-seat-switch),
    // and before the marts build fills the column, the SEAP county of entity_flags as before.
    expect(texts(profilePredicates(ctx, "supplier", 20))).toEqual(['ef.role = $1 ["supplier"]', "ef.n_das >= $1 [20]",
      `ef.entity_id in (select ep.entity_id from marts.entity_profile ep where ep.role = 'supplier' and ep.seat_county = $1) ["Cluj"]`]);
    expect(texts(profilePredicates({ ...ctx, seatColumn: false }, "supplier", 20))).toEqual(['ef.role = $1 ["supplier"]', "ef.n_das >= $1 [20]", 'lower(unaccent(ef.county)) = $1 ["cluj"]']);
    expect(texts(profilePredicates({ ...ctx, county: null, seatCounty: "Iasi" }, "supplier", 20)).at(-1)).toMatch(/ep\.seat_county = \$1\) \["Iasi"\]$/);
  });

  it("write the firm's seat on the records, from its profile (F4, plan §2.5)", () => {
    const firms = (filters: AskSpec["filters"], seat = true) => {
      const spec: AskSpec = { block: "table", dim: "supplier", measure: "value", filters };
      const ctx = { ...ctxFor(spec), seatColumn: seat };
      return { rows: texts(rowPredicates(ctx)).slice(1), shown: displayPredicates(ctx, "T").slice(1) };
    };
    // Against the record's own buyer county: a Romanian firm with a known seat, a buyer with a known county.
    expect(firms({ firmSeat: "same" }).rows).toEqual(["(d.src = 'contracts' or d.closing_value <= $1) [2000000]",
      "exists (select 1 from marts.entity_profile ep where ep.entity_id = d.supplier_id and ep.role = 'supplier' and ep.seat_source is distinct from 'foreign' and ep.seat_county = d.county) []"]);
    expect(firms({ firmSeat: "other" }).rows.at(-1)).toContain("ep.seat_county <> d.county");
    expect(firms({ firmSeat: "abroad" }).rows.at(-1)).toBe("d.supplier_id in (select ep.entity_id from marts.entity_profile ep where ep.role = 'supplier' and ep.seat_source = 'foreign') []");
    // The firm's own county: a semi-join on its profile, as the employees.
    expect(firms({ seatCounty: "Cluj" }).rows.at(-1)).toBe('d.supplier_id in (select ep.entity_id from marts.entity_profile ep where ep.role = \'supplier\' and ep.seat_county = $1) ["Cluj"]');
    // Before the seat column is filled: the SEAP county and the foreign mark of the profile (plan §2.5, the fallback).
    expect(firms({ firmSeat: "same" }, false).rows.at(-1)).toContain("not coalesce(ep.is_foreign, false) and ep.county = d.county");
    expect(firms({ firmSeat: "abroad" }, false).rows.at(-1)).toContain("coalesce(ep.is_foreign, false)");
    expect(firms({ seatCounty: "Cluj" }, false).rows.at(-1)).toContain('lower(unaccent(ep.county)) = $1) ["cluj"]');
    // The shown SQL says it, with where the seat comes from.
    expect(firms({ firmSeat: "other" }).shown.at(-1)).toBe("sediul_firmei <> county  -- firme cu sediul în alt județ (sediul: ultima înmatriculare ONRC, apoi SEAP)");
    expect(firms({ seatCounty: "Cluj" }, false).shown.at(-1)).toMatch(/unaccent\(county\) ilike 'cluj'\)  -- sediul: județul din SEAP$/);
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
      render(trendYearsPredicate(fake, 2019, 2024, null, withCtx ? ctxFor({ block: "trend", dim: "supplier", measure: "value", filters }) : undefined));
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

  it("count the same months of a trend's two years, and show them", () => {
    const trend = (months?: NonNullable<AskSpec["trend"]>["months"]): AskSpec =>
      ({ block: "trend", dim: "supplier", measure: "value", filters: { yearFrom: 2025, yearTo: 2026 }, ...(months ? { trend: { months } } : {}) });
    expect(render(trendYearsPredicate(fake, 2025, 2026)).text).toBe("substr(d.finalization_date,1,4) in ($1, $2)");
    expect(render(trendYearsPredicate(fake, 2025, 2026, ctxFor(trend("auto")).trendMonths)))
      .toEqual({ text: "substr(d.finalization_date,1,4) in ($1, $2) and substr(d.finalization_date,6,2) between $3 and $4", params: ["2025", "2026", "01", "05"] });
    expect(ctxFor(trend([3, 4])).trendMonths).toEqual([3, 4]);
    expect(ctxFor(trend("whole")).trendMonths).toBeNull();
    expect(ctxFor(trend()).trendMonths).toBeNull();
    expect(displayPredicates(ctxFor(trend("auto")), "T").at(-1)).toBe("luna between '01' and '05'  -- aceleași luni în ambii ani");
    // Only a trend has two years to align.
    expect(predicateContext(fake, { block: "stat", measure: "value", filters: {} }, {}, { dataset: "all", yearFrom: null, yearTo: null, trendMonths: [1, 5], seat: true }).trendMonths).toBeNull();
  });

  it("write a trend's group as a HAVING over its two sums, and its order (trend final §3.1)", () => {
    const of = (trend: NonNullable<AskSpec["trend"]>) => {
      const { having, order } = trendGroupSql(fake, fake`VA`, fake`VB`, trendGroupOf({ trend }), { id: fake`ID`, role: "supplier", yearB: 2025 });
      return [having ? render(having).text : null, render(order).text];
    };
    expect(of({})).toEqual([null, "abs(VB - VA)"]);
    expect(of({ change: "all" })).toEqual([null, "abs(VB - VA)"]);
    expect(of({ change: "up" })).toEqual(["VA > 0 and VB > VA", "VB - VA"]);
    expect(of({ change: "up", order: "percent" })).toEqual(["VA > 0 and VB > VA and VA >= $1", "VB / VA"]);
    expect(render(trendGroupSql(fake, fake`VA`, fake`VB`, trendGroupOf({ trend: { change: "up", order: "percent", minBase: 100_000 } })).having!).params).toEqual([100_000]);
    expect(render(trendGroupSql(fake, fake`VA`, fake`VB`, trendGroupOf({ trend: { change: "up", order: "percent" } })).having!).params).toEqual([1_000_000]);
    expect(of({ change: "new" })).toEqual(["VA = 0 and VB > 0", "VB"]);
    expect(of({ change: "down" })).toEqual(["VB > 0 and VB < VA", "VA - VB"]);
    expect(of({ change: "gone" })).toEqual(["VA > 0 and VB = 0", "VA"]);
    expect(of({ change: "new", firstOnly: true })[0]).toBe("VA = 0 and VB > 0 and ID in ( select ep.entity_id from marts.entity_profile ep where ep.role = $1 and substr(ep.first_activity, 1, 4) = $2 )");
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

describe("the common selection (F3, plan §3, §4.1)", () => {
  const stat = (filters: AskSpec["filters"], dataset: AskSpec["dataset"] = "all"): AskSpec => ({ block: "stat", measure: "value", dataset, filters });
  const conds = (spec: AskSpec) => texts(rowPredicates(ctxFor(spec))).slice(2);

  it("writes the kind on the code, with the domain's, the procedure on the contracts and the size on the whole purchase", () => {
    expect(conds(stat({ purchaseKind: "lucrari" }))).toEqual(["d.cpv_code like '45%' []"]);
    expect(conds(stat({ purchaseKind: "servicii" }))).toEqual(["d.cpv_code >= '50' []"]);
    expect(conds(stat({ purchaseKind: "produse" }))).toEqual(["(d.cpv_code < '45' or (d.cpv_code >= '48' and d.cpv_code < '50')) []"]);
    // The kind and the domain on the same code (the fake domain is 336…, goods; its exclusion stays).
    expect(conds(stat({ cpvTerm: "medicamente", purchaseKind: "produse" }))).toEqual([
      '(d.cpv_code like $1) ["336%"]', 'not (d.cpv_code like $1) ["33696%"]', "(d.cpv_code < '45' or (d.cpv_code >= '48' and d.cpv_code < '50')) []",
    ]);
    expect(texts(rowPredicates(ctxFor(stat({ procedure: "deschisa" }, "contracts"))))).toEqual([
      "d.closing_value > 0 []", 'd.procedure_type = any($1::text[]) [["Licitatie deschisa","Licitatie deschisa accelerata"]]',
    ]);
    expect(texts(rowPredicates(ctxFor(stat({ procedure: "altele" }, "contracts"))))[1])
      .toBe(`not (coalesce(d.procedure_type, '') = any($1::text[])) [["Licitatie deschisa","Licitatie deschisa accelerata","Procedura simplificata","Negociere fara publicare prealabila"]]`);
    // A contract's whole value; a direct acquisition's own on the DA stream.
    expect(conds(stat({ purchaseValueMin: 1_000_000 }))).toEqual(["coalesce(d.contract_value_full, d.closing_value) >= $1::numeric [1000000]"]);
    expect(texts(rowPredicates(ctxFor(stat({ purchaseValueMin: 10_000, purchaseValueMax: 100_000 }, "da")))).slice(2))
      .toEqual(["d.closing_value >= $1::numeric [10000]", "d.closing_value < $1::numeric [100000]"]);
  });

  it("leaves out a kind the domain has no codes of, as the answer's note says", () => {
    expect(ctxFor(stat({ cpvTerm: "medicamente", purchaseKind: "lucrari" })).purchaseKind).toBeNull();
    expect(ctxFor(stat({ purchaseKind: "lucrari" })).purchaseKind).toBe("lucrari");
  });

  it("asks a union of both streams for the whole value only when the size is asked", () => {
    expect(fullValueUnion(ctxFor(stat({ purchaseValueMax: 10_000 })))).toBe(true);
    expect(fullValueUnion(ctxFor(stat({ purchaseValueMax: 10_000 }, "da")))).toBe(false);
    expect(fullValueUnion(ctxFor(stat({ purchaseValueMax: 10_000 }, "contracts")))).toBe(false);
    expect(fullValueUnion(ctxFor(stat({ purchaseKind: "lucrari" })))).toBe(false);
  });

  it("shows each condition in the SQL text", () => {
    const shown = displayPredicates(ctxFor(stat({ purchaseKind: "lucrari", purchaseValueMin: 1_000_000 })), "T");
    expect(shown).toContain("cpv_code like '45%'  -- doar lucrări (tipul din codul CPV)");
    expect(shown).toContain("coalesce(contract_value_full, closing_value) >= 1000000  -- de peste 1 mil. lei: valoarea întregii achiziții, nu cota câștigătorului");
    expect(displayPredicates(ctxFor(stat({ procedure: "negociere_fara_publicare" }, "contracts")), "T"))
      .toContain("procedure_type in ('Negociere fara publicare prealabila')  -- procedura declarată în SEAP");
  });
});
