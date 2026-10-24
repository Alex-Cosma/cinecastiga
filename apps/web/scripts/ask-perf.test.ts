import { describe, expect, it } from "vitest";
import { defaultQuestion, localityScopeError, QUESTION_TYPES, questionErrors, transitionQuestion } from "../lib/ask/question-ui";
import { validateSpec } from "../lib/ask/spec";
import { validateEvidenceScope } from "../lib/ask/evidence";
import { perfCases } from "./ask-perf-cases";
import { answerFingerprint, answerRows, assertLoopback, medianRun, perfOptions, regressions, renderMarkdown, seconds, specChanges, summarizeExplain, summarizePlanNotice, type CaseResult, type PerfReport, type StatementPlan } from "./ask-perf";

const cases = perfCases();

describe("ask-perf cases", () => {
  it("have stable unique ids and cover the whole catalogue in its order", () => {
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    expect(cases.filter((c) => c.group === "catalog").map((c) => c.id)).toEqual(QUESTION_TYPES.map((t) => `catalog:${t.id}`));
  });
  it("are questions the builder can run as they are", () => {
    for (const c of cases) {
      expect(questionErrors(c.question), c.id).toEqual([]);
      expect(localityScopeError(c.spec), c.id).toBeNull();
      expect(validateSpec(c.question), c.id).toEqual(c.spec);
      if (c.scope) expect(validateEvidenceScope(c.scope), c.id).toEqual(c.scope);
      if (c.path !== "answer") expect(c.spec.block, c.id).not.toBe("scatter");
    }
  });
  it("keep the catalogue default of every block that needs no choice", () => {
    for (const type of QUESTION_TYPES) {
      const c = cases.find((x) => x.id === `catalog:${type.id}`)!;
      if (["compare", "trend", "network", "sankey", "fact_check", "distribution"].includes(type.id)) continue;
      expect(c.question, type.id).toEqual(transitionQuestion(defaultQuestion(), type.id).spec);
    }
    // the national defaults the fast path serves carry no condition at all
    for (const id of ["catalog:table", "catalog:stat", "catalog:timeseries", "catalog:map"])
      expect(cases.find((c) => c.id === id)!.spec.filters).toEqual({});
  });
  it("pick the focal entity as the builder's picker does, with the answer's role", () => {
    // pickEntity / writeFocal: a buyer picked as the focal entity makes the profile an institution's.
    for (const id of ["catalog:distribution", "sources:distribution-cluj-napoca"])
      expect(cases.find((c) => c.id === id)!.spec, id).toMatchObject({ block: "distribution", dim: "authority", filters: { authorityId: 2146445 } });
    expect(cases.find((c) => c.id === "catalog:network")!.spec).toMatchObject({ dim: "supplier", filters: { supplierId: 2115381 } });
  });
  it("measure the owner's trend example as the builder asks it", () => {
    const trend = cases.find((c) => c.id === "catalog:trend")!;
    expect(trend.spec).toMatchObject({ block: "trend", dim: "supplier", topN: 10, filters: { yearFrom: 2025, yearTo: 2026 } });
  });
  it("hold answers to 1 s and only national, source and CSV cases to 2 s", () => {
    for (const c of cases) if (c.group === "catalog" || c.group === "filtered") expect(c.barMs, c.id).toBe(1000);
    expect(cases.filter((c) => c.barMs === 2000).every((c) => ["national", "sources", "csv"].includes(c.group))).toBe(true);
  });
});

describe("ask-perf options", () => {
  it("need an output, refuse unknown arguments and bound the numbers", () => {
    expect(perfOptions(["--out=a.json", "--only=catalog:stat, catalog:table", "--no-explain"])).toMatchObject({ out: "a.json", only: ["catalog:stat", "catalog:table"], explain: false, tolerance: 0.25, pauseMs: 500, warmRuns: 3 });
    expect(perfOptions(["--md=a.md", "--warm-runs=1"]).warmRuns).toBe(1);
    expect(() => perfOptions(["--out=a.json", "--warm-runs=0"])).toThrow();
    expect(() => perfOptions([])).toThrow(/--out/);
    expect(() => perfOptions(["--out=a.json", "--write"])).toThrow(/Unknown/);
    expect(() => perfOptions(["--out=a.json", "--tolerance=-1"])).toThrow();
    expect(() => perfOptions(["--worker=catalog:stat"])).toThrow(/--result/);
    expect(perfOptions(["--from=a.json", "--md=a.md"]).from).toBe("a.json");
    expect(() => perfOptions(["--from=a.json", "--md=a.md", "--out=b.json"])).toThrow(/--from/);
  });
  it("read only a database on this machine", () => {
    for (const url of ["postgres://u:p@127.0.0.1:5432/seap", "postgres://u:p@localhost/seap", "postgres://u:p@[::1]:5432/seap"]) expect(() => assertLoopback(url)).not.toThrow();
    expect(() => assertLoopback("postgres://u:p@203.0.113.7:5432/seap")).toThrow(/loopback/);
  });
});

const notice = (ms: number, query: string, plan: object) => `duration: ${ms} ms  plan:\n${JSON.stringify({ "Query Text": query, Plan: plan }, null, 2)}`;
const scanPlan = {
  "Node Type": "Aggregate", "Actual Total Time": 120, "Actual Rows": 3, "Actual Loops": 1, "Shared Hit Blocks": 90, "Shared Read Blocks": 10, "Temp Read Blocks": 2, "Temp Written Blocks": 3,
  Plans: [{ "Node Type": "Gather", "Workers Launched": 2, "Actual Total Time": 110, "Actual Rows": 30, "Actual Loops": 1, Plans: [
    { "Node Type": "Seq Scan", "Relation Name": "da_transactions", "Actual Total Time": 100, "Actual Rows": 10, "Actual Loops": 3, "Rows Removed by Filter": 1000 },
    { "Node Type": "Index Only Scan", "Relation Name": "contract_transactions", "Index Name": "ctx_county_ent_idx", "Actual Total Time": 5, "Actual Rows": 4, "Actual Loops": 1 },
  ] }],
};

describe("ask-perf plans", () => {
  it("summarize an auto_explain notice: buffers, relations, indexes and scanned rows", () => {
    const plan = summarizePlanNotice(notice(120.04, "select\n  d.src from x", scanPlan))!;
    expect(plan).toMatchObject({ ms: 120, query: "select d.src from x", rows: 3, sharedHit: 90, sharedRead: 10, tempBlocks: 5,
      relations: ["contract_transactions", "da_transactions"], indexes: ["ctx_county_ent_idx"], seqScans: [{ relation: "da_transactions", scanned: 3030 }] });
    expect(plan.tree).toHaveLength(4);
    expect(plan.tree![2]).toBe("    Seq Scan on da_transactions · 100 ms · rows=30 loops=3");
  });
  it("leave out other notices, the driver's type lookup and the tree of fast statements", () => {
    expect(summarizePlanNotice("relation already exists")).toBeNull();
    expect(summarizePlanNotice(notice(1, "select b.oid from pg_catalog.pg_type a", { "Node Type": "Seq Scan" }))).toBeNull();
    expect(summarizePlanNotice(notice(2, "select 1", { "Node Type": "Result", "Actual Rows": 1 }))!.tree).toBeUndefined();
  });
  it("call a case fast only when rollups alone answer it", () => {
    const plan = (relations: string[], ms = 1): StatementPlan => ({ ms, query: "", rows: 0, sharedHit: 0, sharedRead: 0, tempBlocks: 0, relations, indexes: [], seqScans: [] });
    expect(summarizeExplain([plan(["agg_national"]), plan(["entity_redirects"])]).fastPath).toBe(true);
    const mixed = summarizeExplain([plan(["agg_national"], 2), plan(["da_transactions"], 9)]);
    expect(mixed.fastPath).toBe(false);
    expect(mixed.statements.map((s) => s.ms)).toEqual([9, 2]);
    expect(mixed.totalMs).toBe(11);
  });
  it("fingerprint the scatter without the order of its density cells", () => {
    const scatter = (cells: [number, number, number][]) => ({ block: "scatter" as const, points: [], density: { minLog: 1, maxLog: 9, nx: 80, ny: 46, total: 3, cells } });
    expect(answerFingerprint(scatter([[1, 2, 1], [3, 1, 2]]))).toBe(answerFingerprint(scatter([[3, 1, 2], [1, 2, 1]])));
    expect(answerFingerprint(scatter([[1, 2, 1]]))).not.toBe(answerFingerprint(scatter([[1, 2, 2]])));
  });
  it("count the rows each block shows", () => {
    expect(answerRows({ block: "stat", stat: { value: 1, count: 1 } })).toBe(1);
    expect(answerRows({ block: "trend", rowsTrend: [], yearA: 2025, yearB: 2026 })).toBe(0);
  });
});

const result = (id: string, warm: number, extra: Partial<CaseResult> = {}): CaseResult => ({
  id, group: "catalog", label: id, path: "answer", barMs: 1000, spec: { block: "stat", measure: "value", filters: {} }, otherActive: 0, loadavg: 1,
  first: { ms: warm * 2, groundMs: 0 }, warm: { ms: warm, groundMs: 0, rows: 1, hash: "h" }, warmSamples: [warm], ...extra,
});
const report = (cases: CaseResult[]): PerfReport => ({ version: 1, createdAt: "2026-10-24T10:00:00Z", code: null, warmRuns: 3, method: "Metoda.", environment: { database: "localhost/seap" }, cases });

describe("ask-perf report", () => {
  it("count as slower only beyond the tolerance and 100 ms of noise", () => {
    const base = report([result("a", 1000), result("b", 50), result("c", 400), result("gone", 10), result("e", 300)]);
    const now = report([result("a", 1200), result("b", 140), result("c", 900), result("new", 5000),
      { ...result("e", 0), warm: { ms: 0, groundMs: 0, error: "timeout (20 s)" } }]);
    expect(regressions(base, now, 0.25)).toEqual([{ id: "c", baseMs: 400, ms: 900 }, { id: "e", baseMs: 300, ms: Number.POSITIVE_INFINITY }]);
  });
  it("compare a case only with the same question, and list the others apart", () => {
    const table = { block: "table", dim: "authority", measure: "value", filters: { yearFrom: 2025 } } as const;
    const base = report([result("same", 100, { spec: { ...table } }), result("other", 100, { spec: { ...table } }), result("scope", 100, { spec: { ...table } }),
      result("broken", 100, { warm: { ms: 0, groundMs: 0, error: "timeout (20 s)" } })]);
    // Key order is not a different question (questionKey); another dim or another drawer selection is.
    const now = report([result("same", 900, { spec: { filters: { yearFrom: 2025 }, measure: "value", dim: "authority", block: "table" } }),
      result("other", 900, { spec: { ...table, dim: "supplier" } }), result("scope", 900, { spec: { ...table }, scope: { entityIds: ["1"], role: "authority" } }),
      result("broken", 50)]);
    expect(specChanges(base, now)).toEqual(["other", "scope"]);
    expect(regressions(base, now, 0.25).map((r) => r.id)).toEqual(["same"]);
    const md = renderMarkdown(now, base);
    expect(md).toContain("**Altă întrebare decât în bază (necomparate): `other`, `scope`.**");
    expect(md).toContain("Eroare în bază (necomparate): `broken` (acum 50 ms).");
  });
  it("mark cases over the bar, compare with the baseline and note changed answers", () => {
    const base = report([result("fast", 20), result("slow", 900)]);
    const now = report([result("fast", 20, { warm: { ms: 20, groundMs: 0, rows: 1, hash: "other" } }), result("slow", 2500), result("new", 10)]);
    const md = renderMarkdown(now, base);
    expect(md).toContain("| `slow` | slow | answer | 5,00 s | 2,50 s | 1 | **peste 1,00 s** | — | 900 ms |");
    expect(md).toContain("| `new` | new | answer | 20 ms | 10 ms | 1 | ≤ 1,00 s | — | nou |");
    expect(md).toContain("**Peste pragul la cald: 1 din 3.** `slow` (2,50 s).");
    expect(md).toContain("`slow` 900 ms → 2,50 s");
    expect(md).toContain("Rezultat diferit față de bază: `fast`.");
    expect(renderMarkdown(report([result("ok", 10)]))).toContain("**Peste pragul la cald: 0 din 1.**");
  });
  it("take the median warm run, and the first error over any timing", () => {
    const run = (ms: number, error?: string) => ({ ms, groundMs: 0, ...(error ? { error } : {}) });
    expect(medianRun([run(900), run(300), run(7900)]).ms).toBe(900);
    expect(medianRun([run(300), run(200)]).ms).toBe(200);
    expect(medianRun([run(300), run(20000, "timeout (20 s)")]).error).toBe("timeout (20 s)");
  });
  it("show the spread of the warm runs and the cases measured under load", () => {
    const md = renderMarkdown({ ...report([result("busy", 900, { warmSamples: [850, 900, 2400], otherActive: 2 })]), environment: { machine: { cpus: 12, memoryGb: 32, loadavg: [1] } } });
    expect(md).toContain("| 900 ms (850 ms–2,40 s) |");
    expect(md).toContain("`busy` (2 interogări, load 1)");
    expect(renderMarkdown(report([result("again", 5, { note: "măsurat din nou" })]))).toContain("Notă `again`: măsurat din nou");
  });
  it("write times in ms under a second and in seconds above", () => {
    expect(seconds(4.4)).toBe("4 ms");
    expect(seconds(1234)).toBe("1,23 s");
  });
});
