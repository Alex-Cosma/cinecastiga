/**
 * The distribution's group on a real copy (F6a, plan §4.11): each case through
 * ground → runSpec, and the window's sizes (peerDialog), with their times.
 * Read-only: every statement runs with default_transaction_read_only=on.
 * pnpm --filter web exec tsx scripts/distribution-smoke.ts [--db=<url>] [--out=<file.json>]
 */
import { writeFile } from "node:fs/promises";
import { createDb, type DbSql } from "@seap/db";
import { runRows, runSpec } from "../lib/ask/compile";
import { ground } from "../lib/ask/ground";
import { peerDialog } from "../lib/ask/peer-groups";
import { validateSpec, type AskSpec } from "../lib/ask/spec";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const url = new URL(arg("db") ?? "postgres://seap:seap_dev@127.0.0.1:5432/seap");
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("loopback databases only");
url.searchParams.set("options", "-c default_transaction_read_only=on -c statement_timeout=60s");

const authority = (id: number, name: string) => ({ authorityId: id, authorityName: name });
const supplier = (id: number, name: string) => ({ supplierId: id, supplierName: name });
const BUZAU = authority(2144364, "MUNICIPIUL BUZAU"), RUSETU = authority(2144926, "Comuna Rusetu"), CORABIA = authority(2146373, "Spitalul Orasenesc Corabia");
const DAS = authority(2135939, "Directia de Asistenta Sociala a Municipiului Buzau"), CAPITAL = authority(2144903, "MUNICIPIUL BUCURESTI");
const DEDEMAN = supplier(2124387, "DEDEMAN S.R.L."), CJ_OLT = authority(2146448, "CONSILIUL JUDETEAN OLT");

const cases: { id: string; spec: Record<string, unknown>; scope?: Record<string, unknown> }[] = [
  { id: "buzau-national", spec: { filters: BUZAU } },
  { id: "buzau-similar", spec: { filters: BUZAU, peers: { similar: true } } },
  { id: "buzau-county", spec: { filters: { ...BUZAU, county: "Buzău" } } },
  { id: "buzau-similar-county", spec: { filters: { ...BUZAU, county: "Buzău" }, peers: { similar: true } } },
  { id: "rusetu-similar", spec: { filters: RUSETU, peers: { similar: true } } },
  { id: "rusetu-similar-county", spec: { filters: { ...RUSETU, county: "Buzău" }, peers: { similar: true } } },
  { id: "corabia-similar", spec: { filters: CORABIA, peers: { similar: true } } },
  { id: "corabia-similar-activity", spec: { filters: CORABIA, peers: { similar: true, activity: true } } },
  { id: "das-activity", spec: { filters: DAS, peers: { activity: true } } },
  { id: "das-similar", spec: { filters: DAS, peers: { similar: true } } },
  { id: "capital-similar", spec: { filters: CAPITAL, peers: { similar: true } } },
  { id: "cj-olt-similar", spec: { filters: CJ_OLT, peers: { similar: true } } },
  { id: "dedeman-national", spec: { filters: DEDEMAN } },
  { id: "dedeman-county", spec: { filters: { ...DEDEMAN, county: "Bacău" } } },
  { id: "dedeman-activity", spec: { filters: DEDEMAN, peers: { activity: true } } },
  { id: "legacy-other-county", spec: { filters: { ...BUZAU, county: "Cluj" } } },
  { id: "sources-rusetu-2-criteria", spec: { filters: RUSETU, peers: { similar: true } }, scope: { criteria: 2 } },
  { id: "sources-buzau-group", spec: { filters: BUZAU, peers: { similar: true } }, scope: {} },
];

const { sql } = createDb(url.toString(), { max: 2 });
const out: Record<string, unknown>[] = [];
try {
  for (const c of cases) {
    const raw = { block: "distribution", measure: "value", ...c.spec };
    const spec = validateSpec(raw);
    if ("error" in spec) { out.push({ id: c.id, error: spec.error }); console.log(c.id, "INVALID", spec.error); continue; }
    const times: number[] = [];
    let summary: unknown = null;
    for (let i = 0; i < 3; i++) {
      const started = performance.now();
      const grounding = await ground(sql as DbSql, spec.filters, spec.population);
      if (c.scope) {
        const rows = await runRows(sql as DbSql, spec as AskSpec, grounding, 0, { scope: c.scope });
        summary = "error" in rows ? { error: rows.error } : { total: rows.sourceTotal, value: rows.sourceValue, profileCount: rows.profileCount, reconciled: rows.profileReconciled, notes: rows.scopeNotes };
      } else {
        const result = await runSpec(sql as DbSql, spec as AskSpec, grounding);
        if ("error" in result) summary = { error: result.error };
        else if (result.data.block === "distribution") {
          const d = result.data.distribution;
          summary = { status: d.status, words: d.group.words, others: d.group.others, ticks: d.group.ticks, legacy: d.group.legacy, focal: { nFlags: d.focal.nFlags, nDas: d.focal.nDas, inGroup: d.focal.inGroup },
            position: d.position, hist: d.hist?.map((h) => h.n), members: d.members?.length ?? null, coverage: d.group.coverage ?? null,
            perCriterion: d.perCriterion?.map((p) => `${p.code}:${p.others}/${p.country}`) };
        }
      }
      times.push(Math.round(performance.now() - started));
    }
    const role = (spec.filters.authorityId ? "authority" : "supplier") as "authority" | "supplier";
    const id = String(spec.filters.authorityId ?? spec.filters.supplierId);
    const dialogStart = performance.now();
    const dialog = await sql.begin("read only", (tx) => peerDialog(tx as unknown as DbSql, role, id, spec as AskSpec & { filters: Record<string, unknown> }));
    const dialogMs = Math.round(performance.now() - dialogStart);
    const record = { id: c.id, spec: raw, times, warmMs: Math.min(...times.slice(1)), summary, dialogMs,
      dialog: dialog && { rows: dialog.rows.map((r) => `${r.id}: ${r.label}${r.disabled ? ` [${r.disabled.short}]` : ""}`), sizes: dialog.sizes, legacy: dialog.legacy } };
    out.push(record);
    console.log(JSON.stringify(record));
  }
} finally {
  await sql.end();
}
const file = arg("out");
if (file) await writeFile(file, JSON.stringify(out, null, 2));
