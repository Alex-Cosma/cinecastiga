/**
 * Speed of "Întreabă" on the national marts (plan §6.4). Read-only: it never writes.
 * pnpm --filter web exec tsx scripts/ask-perf.ts --out=<file.json> [--md=<file.md>]
 *   [--only=id,id] [--compare=<baseline.json>] [--tolerance=0.25] [--warm-runs=3] [--no-explain] [--pause-ms=500]
 *   [--db=<url>] [--code=<commit>]
 * pnpm --filter web exec tsx scripts/ask-perf.ts --from=<file.json> --md=<file.md> [--compare=<baseline.json>]
 *   only renders an earlier report again, without measuring.
 * Query parameters of the URL become session settings: ?plan_cache_mode=force_generic_plan
 * measures each case under the generic plans a pooled connection reaches after five runs.
 *
 * Each case runs in its own process, through the same calls as its route
 * (ground → runSpec, runRows, runRows + evidenceCsv): first with empty process
 * caches on a new session, then warm (the median of --warm-runs, so one burst
 * of load on a shared machine does not set the baseline), then once more under
 * auto_explain (ANALYZE, BUFFERS) for the plans. The explain pass is never timed. "First" is
 * a cold process, not a cold disk: PostgreSQL and OS caches keep what earlier
 * work read. A case marked afterAnswer runs its answer first, untimed, so
 * "first" is the drawer opened after it (a trend group's members kept by the
 * answer). Loopback databases only; every session starts with
 * default_transaction_read_only=on and statement_timeout=60s (runSpec and
 * runRows still set their own 20 s inside their transactions).
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { cpus, loadavg, tmpdir, totalmem } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import type { DbSql } from "@seap/db";
import type { BlockData } from "../lib/ask/compile";
import { perfCases, type PerfCase } from "./ask-perf-cases";
import { questionKey } from "../lib/ask/question-ui";

export interface PerfOptions {
  out: string | null;
  md: string | null;
  only: string[] | null;
  compare: string | null;
  /** Relative slowdown tolerated before a case counts as slower than the baseline. */
  tolerance: number;
  explain: boolean;
  /** Warm runs per case; the median is the warm time. */
  warmRuns: number;
  pauseMs: number;
  db: string | null;
  /** The code version measured (a commit), recorded in the report. */
  code: string | null;
  /** Render this earlier report instead of measuring. */
  from: string | null;
  worker: string | null;
  result: string | null;
}

export function perfOptions(args: string[]): PerfOptions {
  const value = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
  const known = ["out", "md", "only", "compare", "tolerance", "warm-runs", "pause-ms", "db", "code", "from", "worker", "result"];
  for (const arg of args) {
    if (arg === "--no-explain") continue;
    if (!known.some((name) => arg.startsWith(`--${name}=`))) throw new Error(`Unknown ask-perf argument: ${arg}`);
  }
  const tolerance = Number(value("tolerance") ?? "0.25"), pauseMs = Number(value("pause-ms") ?? "500"), warmRuns = Number(value("warm-runs") ?? "3");
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 10) throw new Error("--tolerance must be between 0 and 10");
  if (!Number.isSafeInteger(warmRuns) || warmRuns < 1 || warmRuns > 15) throw new Error("--warm-runs must be 1..15");
  if (!Number.isSafeInteger(pauseMs) || pauseMs < 0 || pauseMs > 60_000) throw new Error("--pause-ms must be 0..60000");
  const only = value("only")?.split(",").map((id) => id.trim()).filter(Boolean) ?? null;
  const options: PerfOptions = { out: value("out"), md: value("md"), only: only?.length ? only : null, compare: value("compare"),
    tolerance, explain: !args.includes("--no-explain"), warmRuns, pauseMs, db: value("db"), code: value("code"), from: value("from"), worker: value("worker"), result: value("result") };
  if (!options.worker && !options.out && !options.md) throw new Error("Give --out=<file.json> and/or --md=<file.md>");
  if (options.worker && !options.result) throw new Error("--worker needs --result");
  if (options.from && (!options.md || options.out)) throw new Error("--from renders an earlier report: give --md and no --out");
  return options;
}

/** Only a database on this machine: the script is a local measurement tool. */
export function assertLoopback(url: string): void {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error(`ask-perf only reads a loopback database, not ${host}`);
}

// --- plans (auto_explain, format json, delivered as NOTICE) --------------------

interface PlanNode {
  "Node Type": string;
  "Relation Name"?: string;
  "Index Name"?: string;
  "Parallel Aware"?: boolean;
  "Actual Total Time"?: number;
  "Actual Rows"?: number;
  "Actual Loops"?: number;
  "Rows Removed by Filter"?: number;
  "Shared Hit Blocks"?: number;
  "Shared Read Blocks"?: number;
  "Temp Read Blocks"?: number;
  "Temp Written Blocks"?: number;
  "Workers Launched"?: number;
  Plans?: PlanNode[];
}
export interface StatementPlan {
  ms: number;
  query: string;
  rows: number;
  sharedHit: number;
  sharedRead: number;
  tempBlocks: number;
  relations: string[];
  indexes: string[];
  /** Rows a sequential scan read (kept + filtered out), per relation. */
  seqScans: { relation: string; scanned: number }[];
  /** Compact plan tree, only for statements of at least TREE_MIN_MS. */
  tree?: string[];
}
const TREE_MIN_MS = 50, TREE_MAX_LINES = 40;
const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;

/** One auto_explain notice → a statement summary; null for any other notice. */
export function summarizePlanNotice(message: string): StatementPlan | null {
  const m = /^duration: ([\d.]+) ms\s+plan:\s*([\s\S]*)$/.exec(message);
  if (!m) return null;
  const doc = JSON.parse(m[2]!) as { "Query Text"?: string; Plan: PlanNode };
  const query = (doc["Query Text"] ?? "").replace(/\s+/g, " ").trim();
  if (/pg_catalog\.pg_type/.test(query)) return null; // the driver's own type lookup
  const relations = new Set<string>(), indexes = new Set<string>();
  const seq = new Map<string, number>(), tree: string[] = [];
  const ms = Number(m[1]);
  const walk = (node: PlanNode, depth: number) => {
    const loops = node["Actual Loops"] ?? 1, rows = (node["Actual Rows"] ?? 0) * loops;
    if (node["Relation Name"]) relations.add(node["Relation Name"]);
    if (node["Index Name"]) indexes.add(node["Index Name"]);
    if (node["Node Type"] === "Seq Scan" && node["Relation Name"]) {
      const scanned = rows + (node["Rows Removed by Filter"] ?? 0) * loops;
      seq.set(node["Relation Name"], (seq.get(node["Relation Name"]) ?? 0) + scanned);
    }
    if (ms >= TREE_MIN_MS && tree.length < TREE_MAX_LINES) {
      const on = node["Relation Name"] ? ` on ${node["Relation Name"]}` : "";
      const using = node["Index Name"] ? ` using ${node["Index Name"]}` : "";
      const workers = node["Workers Launched"] ? ` workers=${node["Workers Launched"]}` : "";
      tree.push(`${"  ".repeat(depth)}${node["Node Type"]}${on}${using} · ${round(node["Actual Total Time"] ?? 0)} ms · rows=${Math.round(rows)} loops=${loops}${workers}`);
    }
    for (const child of node.Plans ?? []) walk(child, depth + 1);
  };
  walk(doc.Plan, 0);
  const top = doc.Plan;
  return {
    ms: round(ms), query: query.slice(0, 240), rows: Math.round((top["Actual Rows"] ?? 0) * (top["Actual Loops"] ?? 1)),
    sharedHit: top["Shared Hit Blocks"] ?? 0, sharedRead: top["Shared Read Blocks"] ?? 0,
    tempBlocks: (top["Temp Read Blocks"] ?? 0) + (top["Temp Written Blocks"] ?? 0),
    relations: [...relations].sort(), indexes: [...indexes].sort(),
    seqScans: [...seq].map(([relation, scanned]) => ({ relation, scanned: Math.round(scanned) })),
    ...(tree.length ? { tree } : {}),
  };
}

export interface ExplainSummary {
  statements: StatementPlan[];
  totalMs: number;
  relations: string[];
  /** Relations read by a sequential scan anywhere in the case. */
  seqScanOn: string[];
  /** Answered from agg_* rollups alone, without a scan of the transaction marts. */
  fastPath: boolean;
}
const TRANSACTION_MARTS = ["da_transactions", "contract_transactions", "direct_acquisitions"];
export function summarizeExplain(statements: StatementPlan[]): ExplainSummary {
  const relations = [...new Set(statements.flatMap((s) => s.relations))].sort();
  return {
    statements: [...statements].sort((a, b) => b.ms - a.ms),
    totalMs: round(statements.reduce((n, s) => n + s.ms, 0)),
    relations,
    seqScanOn: [...new Set(statements.flatMap((s) => s.seqScans.map((x) => x.relation)))].sort(),
    fastPath: relations.some((r) => r.startsWith("agg_")) && !relations.some((r) => TRANSACTION_MARTS.includes(r)),
  };
}

// --- runs -------------------------------------------------------------------

export interface RunResult {
  /** Wall time of the route's work: grounding plus the engine call (and CSV text). */
  ms: number;
  groundMs: number;
  /** runSpec's own tookMs (answers only). */
  engineMs?: number;
  /** Result rows: answer rows, the source page, or exported CSV rows. */
  rows?: number;
  /** rows/csv: records in the whole selection (DrillResult.total). */
  records?: number;
  /** Fingerprint of the result, to notice a changed answer between runs. */
  hash?: string;
  error?: string;
}
export interface CaseResult {
  id: string; group: PerfCase["group"]; label: string; path: PerfCase["path"]; barMs: number; ref?: string;
  spec: PerfCase["spec"]; scope?: PerfCase["scope"]; drawer?: PerfCase["drawer"]; precompute?: string;
  /** Other active backends before and after the timed runs, and the 1-minute load average
   * at the start: concurrent work on a shared machine skews timings. */
  otherActive: number;
  loadavg: number;
  first: RunResult;
  /** The median warm run; warmSamples keeps every warm wall time. */
  warm: RunResult;
  warmSamples: number[];
  explain?: ExplainSummary | { error: string };
  /** Written by hand, e.g. when a case was measured again apart from the run. */
  note?: string;
}
export interface PerfReport {
  version: 1;
  createdAt: string;
  code: string | null;
  warmRuns: number;
  method: string;
  environment: Record<string, unknown>;
  cases: CaseResult[];
}

/** The run with the median wall time (the lower middle for an even count); the first error wins. */
export function medianRun(samples: RunResult[]): RunResult {
  const failed = samples.find((r) => r.error);
  if (failed) return failed;
  const sorted = [...samples].sort((a, b) => a.ms - b.ms);
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
}

const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
/** The scatter's density cells come from an unordered group by: their order is not part of the answer. */
export function answerFingerprint(data: BlockData): string {
  if (data.block !== "scatter" || !data.density) return fingerprint(data);
  const cells = [...data.density.cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return fingerprint({ ...data, density: { ...data.density, cells } });
}
export function answerRows(data: BlockData): number {
  switch (data.block) {
    case "table": return data.rows.length;
    case "stat": case "entity_card": case "fact_check": return 1;
    case "timeseries": return data.series.length;
    case "map": return data.counties.length;
    case "compare": return data.entities.length;
    case "distribution": return data.distribution.buckets.length;
    case "breakdown": return data.slices.length;
    case "scatter": return data.points.length;
    case "sankey": return data.flows.length;
    case "network": return data.lists[data.list].rows.length;
    case "trend": return data.rowsTrend.length;
  }
}

/** The driver @seap/db wraps; apps/web has no direct dependency on it. */
type Postgres = (url: string, options: Record<string, unknown>) => DbSql;
const postgres = () => createRequire(import.meta.resolve("@seap/db"))("postgres") as Postgres;

const READ_ONLY = { application_name: "ask-perf", default_transaction_read_only: "on", statement_timeout: "60s" };
const AUTO_EXPLAIN = {
  session_preload_libraries: "auto_explain", "auto_explain.log_min_duration": "0", "auto_explain.log_analyze": "on",
  "auto_explain.log_buffers": "on", "auto_explain.log_timing": "on", "auto_explain.log_format": "json", "auto_explain.log_level": "notice",
};

async function runCase(sql: DbSql, c: PerfCase): Promise<RunResult> {
  const { ground } = await import("../lib/ask/ground");
  const { runSpec, runRows, CSV_MAX_ROWS } = await import("../lib/ask/compile");
  const { evidenceCsv } = await import("../lib/ask/evidence");
  const { buildPills } = await import("../lib/ask/pills");
  const started = performance.now();
  let groundMs = 0;
  try {
    // A window's counts (POST /api/ask/facets): grounding is inside; counts are counted again on every run,
    // "Unde e …?" keeps its rank vector (its warm runs are the next searches).
    if (c.path === "facet" && c.facet) {
      const { facetCounts, locate, forgetFacets } = await import("../lib/ask/facets");
      // An answer's facts (F3: „Din care”, the bars of an evolution) are asked as a part too, counted afresh each run.
      const { barFacts, forgetAnswerFacts, mixFacts } = await import("../lib/ask/answer-facts");
      if (c.facet.part !== "locate") { forgetFacets(); forgetAnswerFacts(); }
      const part = c.facet.part;
      const result = part === "locate" ? await locate(sql, c.spec, c.facet.q ?? "") : part === "mix" ? await mixFacts(sql, c.spec)
        : part === "bars" ? await barFacts(sql, c.spec) : await facetCounts(sql, c.spec, part);
      const ms = round(performance.now() - started);
      if ("timeout" in result) return { ms, groundMs: 0, error: "timeout (8 s)" };
      if ("error" in result) return { ms, groundMs: 0, error: result.error };
      // Refused up front, without a query: reported as such, with the PRECOMPUTE.md entry it waits on.
      if ("precompute" in result) return { ms, groundMs: 0, rows: 0, hash: `precompute: ${result.precompute}` };
      const { tookMs: _took, ...answer } = result;
      const rows = "matches" in answer ? answer.matches.length : "options" in answer ? answer.options.length
        : "kind" in answer ? answer.kind.length + answer.procedure.length + answer.size.length : Object.keys(answer.max ?? {}).length;
      return { ms, groundMs: 0, rows, hash: fingerprint(answer) };
    }
    const grounding = await ground(sql, c.spec.filters, c.spec.population);
    groundMs = performance.now() - started;
    if (c.path === "answer") {
      const result = await runSpec(sql, c.spec, grounding);
      if ("error" in result) return { ms: round(performance.now() - started), groundMs: round(groundMs), error: result.error };
      buildPills(c.spec, grounding);
      return { ms: round(performance.now() - started), groundMs: round(groundMs), engineMs: result.tookMs, rows: answerRows(result.data), hash: answerFingerprint(result.data) };
    }
    const result = await runRows(sql, c.spec, grounding, c.page ?? 0, {
      ...(c.scope ? { scope: c.scope } : {}), ...(c.path === "csv" ? { limit: CSV_MAX_ROWS } : {}),
      ...(c.drawer?.sort ? { sort: c.drawer.sort } : {}), ...(c.drawer?.dir ? { dir: c.drawer.dir } : {}), ...(c.drawer?.search ? { search: c.drawer.search } : {}),
    });
    if ("error" in result) return { ms: round(performance.now() - started), groundMs: round(groundMs), error: result.error };
    const csv = c.path === "csv" ? evidenceCsv(result.rows) : null;
    return {
      ms: round(performance.now() - started), groundMs: round(groundMs), rows: result.rows.length, records: result.total,
      hash: fingerprint(csv ?? { total: result.total, value: result.value, rows: result.rows.map((r) => [r.src, r.refId]) }),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ms: round(performance.now() - started), groundMs: round(groundMs), error: message.includes("statement timeout") ? "timeout (20 s)" : message };
  }
}

async function worker(options: PerfOptions, url: string) {
  const c = perfCases().find((x) => x.id === options.worker);
  if (!c) throw new Error(`Unknown case ${options.worker}`);
  const pg = postgres();
  // Same pool size as createDb(); the first query opens the session outside the timings.
  const sql = pg(url, { max: 10, connection: READ_ONLY, onnotice: () => {} });
  const active = async () => ((await sql`select count(*)::int n from pg_stat_activity where state = 'active' and pid <> pg_backend_pid()`) as unknown as { n: number }[])[0]?.n ?? 0;
  const timed = await (async () => {
    try {
      const before = await active();
      // A drawer opened after its answer (afterAnswer): the answer runs first, untimed, in this process.
      if (c.afterAnswer) {
        const answer = await runCase(sql, { ...c, path: "answer" });
        if (answer.error) throw new Error(`the answer before ${c.id}: ${answer.error}`);
      }
      await sleep(options.pauseMs);
      const load = round(loadavg()[0] ?? 0, 2);
      const first = await runCase(sql, c);
      const samples: RunResult[] = [];
      for (let n = 0; n < options.warmRuns; n++) {
        const run = await runCase(sql, c);
        samples.push(run);
        if (run.error) break;
      }
      return { otherActive: Math.max(before, await active()), loadavg: load, first, warm: medianRun(samples), warmSamples: samples.map((r) => r.ms) };
    } finally { await sql.end(); }
  })();
  const out: CaseResult = { id: c.id, group: c.group, label: c.label, path: c.path, barMs: c.barMs, ...(c.ref ? { ref: c.ref } : {}),
    spec: c.spec, ...(c.scope ? { scope: c.scope } : {}), ...(c.drawer ? { drawer: c.drawer } : {}), ...(c.precompute ? { precompute: c.precompute } : {}), ...timed };
  if (options.explain) {
    const plans: StatementPlan[] = [];
    let collect = false;
    try {
      const ex = pg(url, { max: 10, connection: { ...READ_ONLY, ...AUTO_EXPLAIN }, onnotice: (notice: { message?: string }) => {
        if (!collect || !notice.message) return;
        const plan = summarizePlanNotice(notice.message);
        if (plan) plans.push(plan);
      } });
      try {
        await ex`select 1`;
        collect = true;
        const run = await runCase(ex, c);
        out.explain = run.error ? { error: run.error } : summarizeExplain(plans);
      } finally { await ex.end(); }
    } catch (e) {
      out.explain = { error: `auto_explain unavailable: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  await writeFile(options.result!, JSON.stringify(out));
}

async function runChild(c: PerfCase, options: PerfOptions, url: string): Promise<CaseResult> {
  const result = join(tmpdir(), `ask-perf-${process.pid}-${c.id.replace(/[^a-z0-9-]/gi, "_")}.json`);
  const args = [...process.execArgv, fileURLToPath(import.meta.url), `--worker=${c.id}`, `--result=${result}`, `--pause-ms=${options.pauseMs}`, `--warm-runs=${options.warmRuns}`,
    ...(options.explain ? [] : ["--no-explain"])];
  // The URL travels in the environment, never on a command line other processes can list.
  const child = spawn(process.execPath, args, { stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, DATABASE_URL: url } });
  const code = await new Promise<number | null>((done) => {
    const timer = setTimeout(() => child.kill("SIGTERM"), 10 * 60_000);
    child.on("exit", (exit) => { clearTimeout(timer); done(exit); });
  });
  try {
    if (code !== 0) throw new Error(`worker exited with ${code}`);
    return JSON.parse(await readFile(result, "utf8")) as CaseResult;
  } catch (e) {
    const failed: RunResult = { ms: 0, groundMs: 0, error: e instanceof Error ? e.message : String(e) };
    return { id: c.id, group: c.group, label: c.label, path: c.path, barMs: c.barMs, spec: c.spec, otherActive: 0, loadavg: 0, first: failed, warm: failed, warmSamples: [] };
  } finally {
    await rm(result, { force: true });
  }
}

async function environment(url: string): Promise<Record<string, unknown>> {
  const sql = postgres()(url, { max: 1, connection: READ_ONLY, onnotice: () => {} });
  try {
    const [v] = (await sql`select current_database() db, current_setting('server_version') pg`) as unknown as { db: string; pg: string }[];
    const settings = (await sql`select name, setting, unit from pg_settings where name = any(${sql.array(["shared_buffers", "work_mem", "effective_cache_size", "random_page_cost", "jit", "max_parallel_workers_per_gather"])}::text[]) order by name`) as unknown as { name: string; setting: string; unit: string | null }[];
    const [coverage] = (await sql`select to_regclass('marts.data_coverage') is not null ok`) as unknown as { ok: boolean }[];
    const periods = coverage?.ok ? (await sql`select dataset, observation->>'date_to' date_to from marts.data_coverage where dataset in ('da', 'contracts') order by dataset`) as unknown as { dataset: string; date_to: string | null }[] : [];
    return {
      database: `${new URL(url).hostname}/${v?.db}`, postgres: v?.pg, node: process.version,
      // URL query parameters become session settings (e.g. ?plan_cache_mode=force_generic_plan for a probe).
      session: Object.fromEntries(new URL(url).searchParams),
      settings: Object.fromEntries(settings.map((s) => [s.name, setting(s.setting, s.unit)])),
      dataUntil: Object.fromEntries(periods.map((p) => [p.dataset, p.date_to])),
      machine: { cpus: cpus().length, memoryGb: Math.round(totalmem() / 2 ** 30), loadavg: loadavg().map((n) => round(n, 2)) },
    };
  } finally { await sql.end(); }
}

// --- report -------------------------------------------------------------------

export const seconds = (ms: number) => ms < 1000 ? `${Math.round(ms)} ms`
  : `${(ms / 1000).toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s`;
const runCell = (r: RunResult) => r.error ? `eroare: ${r.error.slice(0, 80)}` : seconds(r.ms);
/** The median, with the spread of the warm runs when there are several. */
const warmCell = (c: CaseResult) => {
  const samples = c.warmSamples ?? [];
  if (c.warm.error || samples.length < 2) return runCell(c.warm);
  return `${seconds(c.warm.ms)} (${seconds(Math.min(...samples))}–${seconds(Math.max(...samples))})`;
};
/** pg_settings value in its unit ("16384" × "8kB" → "128 MB"). */
const setting = (value: string, unit: string | null) => {
  const kb = unit === "8kB" ? Number(value) * 8 : unit === "kB" ? Number(value) : null;
  return kb === null || !Number.isFinite(kb) ? `${value}${unit ? ` ${unit}` : ""}` : kb >= 1024 * 1024 ? `${round(kb / 1024 / 1024)} GB` : kb >= 1024 ? `${round(kb / 1024)} MB` : `${kb} kB`;
};
export const overBar = (c: CaseResult) => !c.warm.error && c.warm.ms > c.barMs;

/** The question a case asks: its spec as questionKey reads it, and the drawer's selection (and its order or search, when set). */
const asked = (c: Pick<CaseResult, "spec" | "scope" | "drawer">) => `${questionKey(c.spec)}|${JSON.stringify(c.scope ?? null)}${c.drawer ? `|${JSON.stringify(c.drawer)}` : ""}`;
/** Cases whose id is in the baseline but whose question is not the baseline's: their timings do not compare. */
export function specChanges(base: PerfReport, current: PerfReport): string[] {
  const byId = new Map(base.cases.map((c) => [c.id, c]));
  return current.cases.filter((c) => { const b = byId.get(c.id); return b && asked(b) !== asked(c); }).map((c) => c.id);
}

export interface Regression { id: string; baseMs: number; ms: number }
/** Warm runs slower than the baseline by more than the tolerance and by more than 100 ms (noise); the same question only. */
export function regressions(base: PerfReport, current: PerfReport, tolerance: number): Regression[] {
  const byId = new Map(base.cases.map((c) => [c.id, c]));
  const changed = new Set(specChanges(base, current));
  return current.cases.flatMap((c) => {
    const b = byId.get(c.id);
    if (!b || b.warm.error || changed.has(c.id)) return [];
    if (c.warm.error) return [{ id: c.id, baseMs: b.warm.ms, ms: Number.POSITIVE_INFINITY }];
    return c.warm.ms > b.warm.ms * (1 + tolerance) && c.warm.ms - b.warm.ms > 100 ? [{ id: c.id, baseMs: b.warm.ms, ms: c.warm.ms }] : [];
  });
}

export function renderMarkdown(report: PerfReport, base?: PerfReport, tolerance = 0.25): string {
  const env = report.environment as { database?: string; postgres?: string; session?: Record<string, string>; dataUntil?: Record<string, string>; settings?: Record<string, string>; machine?: { cpus: number; memoryGb: number; loadavg: number[] } };
  const byId = new Map(base?.cases.map((c) => [c.id, c]) ?? []);
  const plan = (c: CaseResult) => {
    if (!c.explain) return "—";
    if ("error" in c.explain) return `fără plan (${c.explain.error.slice(0, 60)})`;
    const scans = c.explain.seqScanOn.filter((r) => TRANSACTION_MARTS.includes(r) || r.startsWith("entity_"));
    return c.explain.fastPath ? "agg_*" : scans.length ? `Seq Scan: ${scans.join(", ")}` : "index";
  };
  const rows = (c: CaseResult) => c.warm.error ? "—" : c.warm.records !== undefined ? `${(c.warm.rows ?? 0).toLocaleString("ro-RO")} / ${c.warm.records.toLocaleString("ro-RO")}` : String(c.warm.rows ?? "—");
  const lines = [
    `# Viteza „Întreabă” — ${report.createdAt.slice(0, 10)}${report.code ? `, cod ${report.code}` : ""}`,
    "",
    `Mediu: ${env.database ?? "?"}, PostgreSQL ${env.postgres ?? "?"}, date până la ${env.dataUntil?.da?.slice(0, 10) ?? "?"} (DA) / ${env.dataUntil?.contracts?.slice(0, 10) ?? "?"} (contracte); ` +
      `${env.machine?.cpus ?? "?"} CPU, ${env.machine?.memoryGb ?? "?"} GB, load ${env.machine?.loadavg?.map((n) => n.toLocaleString("ro-RO")).join(" / ") ?? "?"}; ` +
      Object.entries({ ...env.settings, ...env.session }).map(([k, v]) => `${k}=${v}`).join(", ") + ".",
    "",
    report.method,
    "",
    `| Caz | Întrebare | Cale | Prima | Caldă | Rânduri | Prag | Plan |${base ? " Bază caldă |" : ""}`,
    `|---|---|---|---|---|---|---|---|${base ? "---|" : ""}`,
    ...report.cases.map((c) => {
      const mark = c.warm.error ? "**eroare**" : overBar(c) ? `**peste ${seconds(c.barMs)}**` : `≤ ${seconds(c.barMs)}`;
      const b = byId.get(c.id);
      return `| \`${c.id}\` | ${c.label} | ${c.path} | ${runCell(c.first)} | ${warmCell(c)} | ${rows(c)} | ${mark} | ${plan(c)} |${base ? ` ${b ? runCell(b.warm) : "nou"} |` : ""}`;
    }),
    "",
  ];
  const over = report.cases.filter(overBar), failed = report.cases.filter((c) => c.warm.error);
  lines.push(`**Peste pragul la cald: ${over.length} din ${report.cases.length}.**${over.length ? " " + over.map((c) => `\`${c.id}\` (${seconds(c.warm.ms)}${c.precompute ? `, pe PRECOMPUTE.md: «${c.precompute}»` : ""})`).join(", ") + "." : ""}`);
  const firstOver = report.cases.filter((c) => !c.first.error && c.first.ms > c.barMs && !overBar(c));
  if (firstOver.length) lines.push("", `Doar prima rulare peste prag: ${firstOver.map((c) => `\`${c.id}\` (${seconds(c.first.ms)})`).join(", ")}.`);
  if (failed.length) lines.push("", `Erori: ${failed.map((c) => `\`${c.id}\` — ${c.warm.error}`).join("; ")}.`);
  const notes = report.cases.filter((c) => c.note);
  for (const c of notes) lines.push("", `Notă \`${c.id}\`: ${c.note}`);
  const busy = report.cases.filter((c) => c.otherActive > 0 || (env.machine?.cpus && c.loadavg >= env.machine.cpus / 2));
  if (busy.length) lines.push("", `Rulate sub încărcare (alte interogări active sau load ≥ jumătate din CPU): ${busy.map((c) => `\`${c.id}\` (${c.otherActive} interogări, load ${c.loadavg.toLocaleString("ro-RO")})`).join(", ")}.`);
  if (base) {
    const slower = regressions(base, report, tolerance);
    lines.push("", slower.length
      ? `**Mai lente decât baza (> ${Math.round(tolerance * 100)}% și > 100 ms): ${slower.map((r) => `\`${r.id}\` ${seconds(r.baseMs)} → ${Number.isFinite(r.ms) ? seconds(r.ms) : "eroare"}`).join(", ")}.**`
      : `Niciun caz mai lent decât baza (toleranță ${Math.round(tolerance * 100)}% și 100 ms).`);
    const changed = report.cases.filter((c) => { const b = byId.get(c.id); return b?.warm.hash && c.warm.hash && b.warm.hash !== c.warm.hash; });
    if (changed.length) lines.push("", `Rezultat diferit față de bază: ${changed.map((c) => `\`${c.id}\``).join(", ")}.`);
    const other = specChanges(base, report);
    if (other.length) lines.push("", `**Altă întrebare decât în bază (necomparate): ${other.map((id) => `\`${id}\``).join(", ")}.**`);
    const baseFailed = report.cases.filter((c) => byId.get(c.id)?.warm.error);
    if (baseFailed.length) lines.push("", `Eroare în bază (necomparate): ${baseFailed.map((c) => `\`${c.id}\` (acum ${c.warm.error ? "tot eroare" : seconds(c.warm.ms)})`).join(", ")}.`);
  }
  return lines.join("\n") + "\n";
}

const method = (warmRuns: number) =>
  "Fiecare caz rulează în procesul lui: prima rulare cu cache-urile procesului goale (acoperire, perioade) pe o sesiune nouă, " +
  `apoi la cald (${warmRuns > 1 ? `mediana a ${warmRuns} rulări, în paranteză cea mai rapidă și cea mai lentă` : "o rulare"}), ` +
  "apoi încă o dată sub auto_explain (ANALYZE, BUFFERS) pentru planuri, fără cronometru. „Prima” înseamnă proces rece, " +
  "nu disc rece: PostgreSQL și sistemul păstrează ce au citit cazurile anterioare. Timpul cuprinde grounding-ul și apelul motorului " +
  "(runSpec, runRows, runRows + evidenceCsv, fațetele: facetCounts numără la fiecare rulare, locate păstrează vectorul de ranguri), fără HTTP și randare. " +
  "Prag la cald: 1 s pentru un răspuns, 2 s pentru cele mai grele " +
  "cazuri naționale filtrate, surse naționale, CSV și numerele ferestrelor pe ciorna națională. Plan: agg_* = doar rollup-uri; Seq Scan = citire secvențială a marts de tranzacții sau de profiluri.";

async function main() {
  const options = perfOptions(process.argv.slice(2));
  const base = options.compare ? JSON.parse(await readFile(options.compare, "utf8")) as PerfReport : undefined;
  if (options.from) {
    const earlier = JSON.parse(await readFile(options.from, "utf8")) as PerfReport;
    await writeFile(options.md!, renderMarkdown(earlier, base, options.tolerance));
    return;
  }
  const { DEFAULT_DATABASE_URL } = await import("@seap/db");
  const url = options.db ?? process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  assertLoopback(url);
  if (options.worker) return await worker(options, url);
  const cases = perfCases().filter((c) => !options.only || options.only.includes(c.id));
  if (options.only) for (const id of options.only) if (!cases.some((c) => c.id === id)) throw new Error(`Unknown case ${id}`);
  const report: PerfReport = { version: 1, createdAt: new Date().toISOString(), code: options.code, warmRuns: options.warmRuns, method: method(options.warmRuns), environment: await environment(url), cases: [] };
  for (const c of cases) {
    const result = await runChild(c, options, url);
    report.cases.push(result);
    console.log(`${c.id.padEnd(48)} first ${runCell(result.first).padEnd(10)} warm ${runCell(result.warm)}${overBar(result) ? "  > bar" : ""}`);
  }
  if (options.out) await writeFile(options.out, JSON.stringify(report, null, 2) + "\n");
  if (options.md) await writeFile(options.md, renderMarkdown(report, base, options.tolerance));
  if (base && (regressions(base, report, options.tolerance).length || specChanges(base, report).length)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  });
}
