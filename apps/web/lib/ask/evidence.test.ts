import { describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import { runRows, runSpec, DRILLABLE_BLOCKS, type DrillRow } from "./compile";
import { BLOCKS, type AskSpec } from "./spec";
import { evidenceCsv, evidenceLinks, formatEvidenceAmount, sumDecimalStrings, validateEvidenceScope } from "./evidence";
import { evidenceOptions } from "./evidence-request";
import type { Grounding } from "./ground";

const grounding: Grounding = { authority: { entityId: "123", nameDisplay: "Spitalul X", query: "Spitalul X", county: "Cluj", alternatives: [] } };

/** SQL tag harness records parameterized statements without needing a mutable DB fixture. */
function database(profileValue = "30.01") {
  const statements: string[] = [];
  const values: unknown[] = [];
  class Fragment {
    constructor(public text: string) {}
    then(resolve: (value: unknown[]) => unknown) {
      statements.push(this.text);
      if (this.text.includes("marts.national_stats")) return Promise.resolve(resolve([{ year: 2020 }, { year: 2026 }]));
      if (this.text.includes("marts.agg_national")) {
        const match = this.text.match(/where src = \?(\d+)/);
        const stream = match ? values[Number(match[1]) - 1] : "all";
        const aggregate = [{ src: "da", v: "20.01", n: "2" }, { src: "contracts", v: "30.02", n: "3" }];
        return Promise.resolve(resolve(aggregate.filter((r) => stream === "all" || r.src === stream)));
      }
      if (this.text.includes("group by d.state")) return Promise.resolve(resolve([
        { state: "Oferta acceptata", n: "2", v: "20.01", fn: "1", fv: "10.005", date_from: "2020-01-01", date_to: "2026-02-02" },
        { state: "Oferta refuzata", n: "1", v: "10", fn: "0", fv: "0", date_from: "2021-01-01", date_to: "2025-02-02" },
      ]));
      if (this.text.includes("coalesce(sum(n_das)")) return Promise.resolve(resolve([{ n: "1", records: "3", v: profileValue }]));
      if (this.text.includes("select entity_id, name_display, role")) return Promise.resolve(resolve([
        { entity_id: "123", name_display: "Spitalul X", role: "authority", n_das: 3, total_ron: profileValue, cri: "0.2", flags: ["da_split"] },
      ]));
      return Promise.resolve(resolve([]));
    }
  }
  const tag = ((chunks: TemplateStringsArray, ...params: unknown[]) => new Fragment(chunks.reduce((query, text, i) => {
    const value = params[i];
    if (i >= params.length) return query + text;
    if (value instanceof Fragment) return query + text + value.text;
    values.push(value);
    return query + text + `?${values.length}`;
  }, ""))) as unknown as DbSql;
  Object.assign(tag, {
    array: (items: unknown[]) => { values.push(items); return new Fragment("?array"); },
    begin: async (_options: string, fn: (tx: DbSql) => Promise<unknown>) => fn(tag),
    unsafe: async () => [],
  });
  return { sql: tag, statements, values };
}
const stat: AskSpec = { block: "stat", dataset: "da", measure: "value", filters: { authorityId: 123 } };

describe("source arithmetic and export", () => {
  it("sums unrounded numeric values without binary floats or safe-integer loss", () => {
    expect(sumDecimalStrings(["9007199254740993.01", "0.02", "-0.01"])).toBe("9007199254740993.02");
    expect(sumDecimalStrings(["0.333333333333333333", "0.333333333333333333", "0.333333333333333333"])).toBe("0.999999999999999999");
    expect(sumDecimalStrings(["-1.001", "1.001"])).toBe("0.000");
    expect(formatEvidenceAmount("9007199254740993.0100")).toBe("9.007.199.254.740.993,01 lei");
    expect(formatEvidenceAmount("-0.0100")).toBe("-0,01 lei");
    expect(formatEvidenceAmount("0.333333333333333333")).toBe("0,33 lei");
    expect(formatEvidenceAmount("0.333333333333333333", true)).toBe("0,333333333333333333 lei");
    expect(formatEvidenceAmount("-99.999")).toBe("-100,00 lei");
  });
  it("never invents a SEAP source URL for a missing notice ID", () => {
    expect(evidenceLinks({ src: "contracts", refId: "99", caNoticeId: null, tedPubnum: null }).seap).toBeNull();
    expect(evidenceLinks({ src: "contracts", refId: "99", caNoticeId: "42", tedPubnum: "123-2026" }).seap).toContain("ca-notices/view-c/42");
    expect(evidenceLinks({ src: "da", refId: "42", caNoticeId: null, tedPubnum: null }).seap).toContain("direct-acquisition/view/42");
  });
  it("exports original numeric precision, split values, state and direct links while neutralizing formula text", () => {
    const row: DrillRow = { daCode: '=HYPERLINK("x")', date: "2026-01-01", authorityId: "1", authority: "\t=2+2", supplierId: "2", supplier: "Firma, SA", county: "Cluj", cpvName: "Servicii", cpvCode: "12345678-9", value: 0.3333333333333333, valueExact: "0.333333333333333333", src: "contracts", refId: "3", caNoticeId: "4", tedPubnum: null, estimatedValueRon: null, valueSuspect: false, state: null, nWinners: 3, contractValueFull: "1" };
    const csv = evidenceCsv([row]);
    expect(csv).toContain('"\'=HYPERLINK(""x"")"');
    expect(csv).toContain('"\'\t=2+2"');
    expect(csv).toContain(",0.333333333333333333,");
    expect(csv).toContain('"3",3,1,');
    expect(csv).toContain("ca-notices/view-c/4");
    expect(csv).toContain("stare,sursa");
  });
});

describe("source selection validation", () => {
  it("has a source path for all thirteen blocks", () => expect(new Set(DRILLABLE_BLOCKS)).toEqual(new Set(BLOCKS)));
  it("rejects unknown, malformed and ambiguous restrictions instead of returning a broader list", () => {
    expect(validateEvidenceScope({ entityIds: ["123"] })).toHaveProperty("error");
    expect(validateEvidenceScope({ entityIds: ["123);DROP"], role: "authority" })).toHaveProperty("error");
    expect(validateEvidenceScope({ riskBucket: { from: 0.2, to: 0.9 } })).toHaveProperty("error");
    expect(validateEvidenceScope({ cpvPrefixes: ["12%"] })).toHaveProperty("error");
    expect(validateEvidenceScope({ unknown: true })).toHaveProperty("error");
    expect(evidenceOptions({ sort: "constructor" })).toHaveProperty("error");
  });
  it("accepts exact IDs, complements, county groups and endpoint years", () => {
    const scope = { role: "supplier", excludeEntityIds: ["9007199254740993"], excludeCpvPrefixes: ["45"], county: "Cluj", years: [2020, 2026] };
    expect(validateEvidenceScope(scope)).toEqual(scope);
    expect(validateEvidenceScope({ riskBucket: { from: 0.2, to: 0.3 } })).not.toHaveProperty("error");
  });
});

describe("source query regression", () => {
  it.each(["all", "da", "contracts"] as const)("unrestricted %s totals use the matching source aggregate without scanning transactions", async (dataset) => {
    const db = database();
    const result = await runSpec(db.sql, { block: "stat", dataset, measure: "value", filters: {} }, {});
    expect(result).toMatchObject({ data: { block: "stat", stat: dataset === "all" ? { count: 5, value: 50.03 } : dataset === "da" ? { count: 2, value: 20.01 } : { count: 3, value: 30.02 } } });
    expect(db.statements.some((q) => q.includes("marts.agg_national"))).toBe(true);
    expect(db.statements.some((q) => q.includes("marts.da_transactions") || q.includes("marts.contract_transactions"))).toBe(false);
    if (dataset !== "all") expect(result).not.toHaveProperty("data.stat.byStream");
  });
  it("count-measure national totals retain the aggregate's unrestricted DA plausibility scope", async () => {
    const db = database();
    await runSpec(db.sql, { block: "stat", dataset: "da", measure: "count", filters: {} }, {});
    const query = db.statements.find((q) => q.includes("marts.agg_national"));
    expect(query).toContain("v_all v, n_all n");
  });
  it("a filtered stat never substitutes an unrestricted national aggregate", async () => {
    const db = database();
    await runSpec(db.sql, stat, grounding);
    expect(db.statements.some((q) => q.includes("marts.agg_national"))).toBe(false);
    expect(db.statements.some((q) => q.includes("marts.da_transactions"))).toBe(true);
  });
  it("does not start a database scan after the source request has been abandoned", async () => {
    const db = database();
    const controller = new AbortController(); controller.abort();
    await expect(runRows(db.sql, stat, grounding, 0, { signal: controller.signal })).rejects.toThrow();
    expect(db.statements).toEqual([]);
  });
  it("keeps full totals distinct from locally filtered sums and passes search literally as a parameter", async () => {
    const db = database();
    const result = await runRows(db.sql, stat, grounding, 0, { search: "50%_' OR 1=1--", state: "Oferta acceptata" });
    expect(result).toMatchObject({ sourceTotal: 3, sourceValue: "30.01", total: 1, value: "10.005", accepted: { count: 2, value: "20.01" } });
    const query = db.statements.find((s) => s.includes("group by d.state"))!;
    expect(query).toContain("strpos(lower(unaccent(concat_ws");
    expect(query).not.toContain("OR 1=1");
    expect(db.values).toContain("50%_' or 1=1--");
  });
  it("profile evidence reads the all-status historical core, preserving zero values and checking reconciliation", async () => {
    const db = database();
    const spec: AskSpec = { block: "distribution", dataset: "contracts", measure: "value", filters: { authorityId: 123, yearFrom: 2025, yearTo: 2026 } };
    const result = await runRows(db.sql, spec, grounding, 0, { scope: { role: "authority", entityIds: ["123"] } });
    expect(result).toMatchObject({ profile: true, profileCount: 1, profileReconciled: true });
    const query = db.statements.find((s) => s.includes("group by d.state"))!;
    expect(query).toContain("core.direct_acquisitions da");
    expect(query).toContain("da.closing_value is not null and da.closing_value <=");
    expect(query).not.toContain("d.closing_value > 0");
    expect(query).not.toContain("marts.da_transactions");
    expect(query).not.toContain("substr(d.finalization_date");
  });
  it("does not claim reconciliation when imported rows differ from the aggregate snapshot", async () => {
    const db = database("30.02");
    const result = await runRows(db.sql, { ...stat, block: "entity_card", dim: "authority" }, grounding, 0);
    expect(result).toMatchObject({ profileReconciled: false });
  });
  it("uses the same histogram bucket expression and population minimum as the displayed risk distribution", async () => {
    const db = database();
    await runRows(db.sql, { ...stat, block: "distribution" }, grounding, 0, { scope: { riskBucket: { from: 0.2, to: 0.3 } } });
    const query = db.statements.find((s) => s.includes("group by d.state"))!;
    expect(query).toContain("width_bucket(coalesce(ef.cri, 0), 0, 1.0000001, 10)");
    expect(query).toContain("ef.n_das >=");
    expect(db.values).toContain(3);
    expect(db.values).toContain(10);
  });
  it("trend sources contain only the endpoint years, even if month filters are present", async () => {
    const db = database();
    await runRows(db.sql, { ...stat, block: "trend", dim: "authority", filters: { authorityId: 123, yearFrom: 2020, yearTo: 2026, monthFrom: 8 } }, grounding, 0);
    const query = db.statements.find((s) => s.includes("group by d.state"))!;
    expect(query).toMatch(/substr\(d.finalization_date, 1, 4\) in/);
    expect(query).not.toContain("substr(d.finalization_date, 1, 7)");
  });
  it("per-capita, category and partner exclusions match the aggregate's eligible population", async () => {
    const perCap = database();
    await runRows(perCap.sql, { ...stat, block: "table", dim: "authority", measure: "value_per_capita" }, grounding, 0);
    expect(perCap.statements.find((s) => s.includes("group by d.state"))).toContain("population > 0");
    const flow = database();
    await runRows(flow.sql, { ...stat, block: "sankey" }, grounding, 0, { scope: { role: "supplier", excludeEntityIds: ["456"], excludeCpvPrefixes: ["45"] } });
    const query = flow.statements.find((s) => s.includes("group by d.state"))!;
    expect(query).toContain("d.supplier_id is not null");
    expect(query).toContain("d.cpv_code is not null");
    expect(query).toContain("not (d.supplier_id = any");
    expect(query).toContain("not (d.cpv_code like any");
  });
  it("ordering includes stream, source and supplier IDs to keep consortium pagination stable", async () => {
    const db = database();
    await runRows(db.sql, { ...stat, dataset: "all" }, grounding, 4);
    expect(db.statements.find((s) => s.includes("select d.da_code"))).toContain("d.src, d.ref_id, d.supplier_id nulls first");
  });
  it("national source pagination bounds both indexed streams before the global order", async () => {
    const db = database();
    await runRows(db.sql, { block: "stat", dataset: "all", measure: "value", filters: {} }, {}, 0);
    const page = db.statements.find((s) => s.includes("select d.da_code"))!;
    expect(page.match(/order by d.ref_id/g)?.length).toBe(3);
    expect(page.match(/limit /g)?.length).toBe(3);
  });
  it("earlier annual pages fetch bounded reference keys and preserve each consortium supplier", async () => {
    const db = database();
    await runRows(db.sql, { block: "breakdown", dataset: "all", measure: "value", filters: { yearFrom: 2025, yearTo: 2025 } }, {}, 0);
    const page = db.statements.find((s) => s.includes("select d.da_code"))!;
    expect(page.match(/select d.ref_id, d.src, d.supplier_id from/g)?.length).toBe(2);
    expect(page.match(/order by \(d.ref_id \+ 0\)/g)?.length).toBe(2);
    expect(page).toContain("selected_key.src = 'da' and d.ref_id = selected_key.ref_id");
    expect(page).toContain("selected_key.src = 'contracts' and d.ref_id = selected_key.ref_id");
    expect(page).toContain("d.supplier_id is not distinct from selected_key.supplier_id");
    expect(page).toContain("d.src, d.ref_id, d.supplier_id nulls first");
    expect(page.match(/limit /g)?.length).toBe(3);
    expect(db.statements.find((s) => s.includes("group by d.state"))).not.toContain("limit");
  });
  it("latest-year source pages retain the quick reference-index path", async () => {
    const db = database();
    await runRows(db.sql, { block: "breakdown", dataset: "all", measure: "value", filters: { yearFrom: 2026, yearTo: 2026 } }, {}, 0);
    const page = db.statements.find((s) => s.includes("select d.da_code"))!;
    expect(page).not.toContain("selected_key");
    expect(page.match(/order by d.ref_id/g)?.length).toBe(3);
  });
});
