/**
 * The risk cloud on a restored copy, by hand (F6b; scatter-3, the risk score). Read-only: it never writes.
 * pnpm --filter web exec tsx scripts/scatter-smoke.ts [--db=<url>] [--spec='{"block":"scatter",…}'] [--locate=text] [--facts=id,id] [--rows[=flag, e.g. da_above_ceiling]]
 * Prints the answer's size and timing, the first rows of the list, and optionally the search, the facts of profiles
 * or the sources page; one JSON line per call, so a stage can paste it into its notes.
 */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { DbSql } from "@seap/db";

type Postgres = (url: string, options: Record<string, unknown>) => DbSql;
const postgres = () => createRequire(import.meta.resolve("@seap/db"))("postgres") as Postgres;

const arg = (name: string) => process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? null;

async function main() {
  const url = arg("db") ?? "postgres://seap:seap_dev@127.0.0.1:5432/seap";
  if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error("loopback databases only");
  const sql = postgres()(url, { max: 2, application_name: "scatter-smoke", connection: { default_transaction_read_only: "on", statement_timeout: "60s" } });
  const { ground } = await import("../lib/ask/ground");
  const { runSpec, runRows } = await import("../lib/ask/compile");
  const { validateSpec } = await import("../lib/ask/spec");
  const { locate, profileFacts } = await import("../lib/ask/facets");
  const file = arg("spec-file");
  const raw = arg("spec") ?? (file ? await readFile(file, "utf8") : null);
  const spec = validateSpec(raw ? JSON.parse(raw) : { block: "scatter", dim: "authority", measure: "value", scatter: { rankBy: "risk" }, filters: {} });
  if ("error" in spec) throw new Error(spec.error);
  const line = (value: unknown) => console.log(JSON.stringify(value));
  try {
    const started = performance.now();
    const answer = await runSpec(sql, spec, await ground(sql, spec.filters, spec.population));
    if ("error" in answer) { line({ error: answer.error }); return; }
    const data = answer.data;
    if (data.block !== "scatter" || !("scatter" in data)) { line({ block: data.block }); return; }
    const s = data.scatter;
    line({
      ms: Math.round(performance.now() - started), group: s.group, criteria: s.criteria, chosen: s.chosen ?? null, p90: s.p90,
      cloud: "points" in s.cloud ? { points: s.cloud.points.length } : { cells: s.cloud.bands.cells.length, flagged: s.cloud.flagged?.cells.length ?? 0, named: s.cloud.named.length },
      // scatter-3: each row's risk score (displayed and unrounded, the order), its patterns, its acquisitions.
      version: s.version,
      list: s.list.slice(0, 5).map((r) => [r.entityId, r.name, "score" in r ? r.score : null, "scoreRaw" in r ? r.scoreRaw : null, r.nFlags, r.nDas, r.flags.map((f) => f.code)]),
    });
    const text = arg("locate");
    if (text) {
      const t = performance.now();
      const found = await locate(sql, spec, text);
      line({ locateMs: Math.round(performance.now() - t), found: "matches" in found ? { total: found.total, matches: found.matches.map((m) => [m.id, m.name, m.rank, m.profile?.why]) } : found });
    }
    const ids = arg("facts");
    if (ids) {
      const t = performance.now();
      const facts = await profileFacts(sql, spec, ids.split(","));
      line({ factsMs: Math.round(performance.now() - t), facts: "rows" in facts ? facts.rows : facts });
    }
    if (process.argv.includes("--rows") || arg("rows")) {
      const flag = arg("rows");
      const scope = { ...(flag ? { flag } : {}), ...(ids ? { entityIds: ids.split(","), role: s.role } : {}) };
      const t = performance.now();
      const rows = await runRows(sql, spec, await ground(sql, spec.filters, spec.population), 0, { scope } as never);
      line({ rowsMs: Math.round(performance.now() - t), rows: "error" in rows ? rows : { total: rows.total, value: rows.value, reconciled: rows.profileReconciled, notes: rows.scopeNotes.slice(-2) } });
    }
  } finally {
    await sql.end({ timeout: 2 });
  }
}

void main();
