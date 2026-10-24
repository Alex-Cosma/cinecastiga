/**
 * The legacy-link corpus on a restored copy (plan §6.2, private golden). Read-only: it never writes.
 * pnpm --filter web exec tsx scripts/ask-golden.ts --out=<file.json> [--compare=<earlier.json>]
 *   [--only=id,id] [--csv-max=20000] [--db=<url>] [--code=<commit>]
 *
 * The fixture golden (lib/ask/golden-legacy.integration.test.ts) cannot cover
 * what only real marts have: the agg_* fast paths over real volumes, the
 * annual page scan, paging and real partitions. This runs the same corpus
 * through the same three routes on the local copy, with identities of that
 * copy, and writes the records outside the repository: results of real data
 * are never committed. --compare lists the entries whose record changed and
 * exits with 1, so a stage can be checked before and after.
 *
 * Every request runs in its own repeatable-read, read-only transaction with
 * statement_timeout 60 s (runSpec and runRows still set their own 20 s), on a
 * session that starts read-only and with plan_cache_mode=force_custom_plan,
 * so a generic plan after five runs cannot turn a case into a timeout. CSV is
 * skipped above --csv-max records. Loopback databases only.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { DbSql } from "@seap/db";
import type { CorpusIdentities } from "../lib/ask/fixtures/legacy-corpus";
import type { GoldenRecord, SendRoute } from "../lib/ask/fixtures/golden-run";

/** Identities of the local snapshot (23–24 Oct 2026), chosen read-only; no person: the copy predates migration 0077, so the ONRC filter cannot run on it. */
export const LOCAL_IDENTITIES: CorpusIdentities = {
  authority: { id: 2146445, name: "Municipiul Cluj-Napoca" },
  authority2: { id: 2144364, name: "MUNICIPIUL BUZAU" },
  supplier: { id: 2115381, name: "SELGROS CASH&CARRY SRL" },
  supplier2: { id: 2124387, name: "DEDEMAN S.R.L." },
  pair: { authority: { id: 2146445, name: "Municipiul Cluj-Napoca" }, supplier: { id: 2084461, name: "PROFESIONAL SP" } },
  unrelated: { authority: { id: 2146445, name: "Municipiul Cluj-Napoca" }, supplier: { id: 1967089, name: "CURELARU PROD EXIM SRL" } },
  profileAuthority: { id: 2146445, name: "Municipiul Cluj-Napoca" },
  profileSupplier: { id: 2115381, name: "SELGROS CASH&CARRY SRL" },
  noProfile: { id: 2020757, name: "ASOCIATIA SALVAMOND SALVASPEO VLADEASA CLUJ" },
  quietAuthority: { id: 2130038, name: "Scoala Gimnaziala Râsca" },
  county: "Cluj",
  county2: "Buzău",
  uat: { siruta: 54975, name: "mun. Cluj-Napoca (Cluj)" },
  person: null,
  unidentifiedPerson: null,
  cpv: { word: "drumuri", word2: "medicamente", quietWord: "parcuri", code: "45233140", division: "45", group: "4523", fuzzy: "combustibil", retired: "lucrări", unknown: "zzzz necunoscut" },
  years: { a: 2024, b: 2025, c: 2026 },
};

export interface GoldenOptions { out: string | null; compare: string | null; only: string[] | null; csvMax: number; db: string | null; code: string | null }
export function goldenOptions(args: string[]): GoldenOptions {
  const value = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
  for (const arg of args) if (!["out", "compare", "only", "csv-max", "db", "code"].some((name) => arg.startsWith(`--${name}=`))) throw new Error(`Unknown ask-golden argument: ${arg}`);
  const csvMax = Number(value("csv-max") ?? "20000");
  if (!Number.isSafeInteger(csvMax) || csvMax < 0) throw new Error("--csv-max must be a whole number");
  const only = value("only")?.split(",").map((id) => id.trim()).filter(Boolean) ?? null;
  const options = { out: value("out"), compare: value("compare"), only: only?.length ? only : null, csvMax, db: value("db"), code: value("code") };
  if (!options.out) throw new Error("Give --out=<file.json> (outside the repository)");
  return options;
}

/** Entries whose record differs between two runs, by id; added and removed entries count as changed. */
export function changedRecords(before: GoldenRecord[], after: GoldenRecord[]): string[] {
  const earlier = new Map(before.map((r) => [r.id, JSON.stringify(r)]));
  const later = new Map(after.map((r) => [r.id, JSON.stringify(r)]));
  return [...new Set([...earlier.keys(), ...later.keys()])].filter((id) => earlier.get(id) !== later.get(id));
}

type Postgres = (url: string, options: Record<string, unknown>) => DbSql;
const postgres = () => createRequire(import.meta.resolve("@seap/db"))("postgres") as Postgres;

async function main() {
  const options = goldenOptions(process.argv.slice(2));
  // The routes append every request to the dev-session log unless it is off; set before they load.
  process.env["SEAP_DEVLOG"] = "off";
  const { DEFAULT_DATABASE_URL } = await import("@seap/db");
  const url = options.db ?? process.env["DATABASE_URL"] ?? DEFAULT_DATABASE_URL;
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error(`ask-golden only reads a loopback database, not ${host}`);
  const [{ POST: ask }, { POST: rows }, { POST: csv }, { joinTransaction }, { legacyCorpus }, { goldenRecord, goldenJson, GOLDEN_FORMAT }] = await Promise.all([
    import("../app/api/ask/route"), import("../app/api/ask/rows/route"), import("../app/api/ask/rows/csv/route"),
    import("../lib/ask/test-fixture"), import("../lib/ask/fixtures/legacy-corpus"), import("../lib/ask/fixtures/golden-run"),
  ]);
  const handlers = { ask, rows, csv };
  const sql = postgres()(url, { max: 1, onnotice: () => {}, connection: {
    application_name: "ask-golden", default_transaction_read_only: "on", statement_timeout: "60s", plan_cache_mode: "force_custom_plan",
  } });
  const g = globalThis as typeof globalThis & { __seapAskSql?: DbSql };
  const send: SendRoute = async (route, body) => {
    let reply: Awaited<ReturnType<SendRoute>> | undefined;
    try {
      await sql.begin("isolation level repeatable read read only", async (tx) => {
        await tx.unsafe("set local statement_timeout = '60s'");
        g.__seapAskSql = joinTransaction(tx as unknown as DbSql);
        try {
          const response = await handlers[route](new Request(`http://local/api/ask/${route}`, { method: "POST", body: JSON.stringify(body) }));
          reply = { status: response.status, headers: response.headers, text: await response.text() };
        } finally { delete g.__seapAskSql; }
      });
    } catch (error) {
      // postgres.js rethrows a query error (a timeout) at the end of its transaction even when the route caught it and answered.
      if (!reply) throw error;
    }
    return reply!;
  };
  try {
    const entries = legacyCorpus(LOCAL_IDENTITIES).filter((e) => !options.only || options.only.includes(e.id));
    if (options.only) for (const id of options.only) if (!entries.some((e) => e.id === id)) throw new Error(`Unknown corpus id ${id}`);
    const records: GoldenRecord[] = [], ms: Record<string, number> = {};
    for (const entry of entries) {
      const started = performance.now();
      records.push(await goldenRecord(entry, send, { csvMaxTotal: options.csvMax }));
      ms[entry.id] = Math.round(performance.now() - started);
      const r = records.at(-1)!;
      console.log(`${entry.id.padEnd(52)} ${String(r.answer["status"]).padEnd(4)} ${String(r.sources["status"]).padEnd(4)} ${String(r.csv["status"] ?? "skip").padEnd(5)} ${(ms[entry.id]! / 1000).toFixed(1)} s`);
    }
    const [clock] = await sql`select now()::text snapshot` as unknown as { snapshot: string }[];
    const safeDb = new URL(url); safeDb.password = "";
    await writeFile(options.out!, goldenJson({ format: GOLDEN_FORMAT, db: safeDb.toString(), code: options.code, ranAt: clock?.snapshot ?? null, csvMax: options.csvMax, identities: LOCAL_IDENTITIES, ms, records }) + "\n");
    if (options.compare) {
      const earlier = JSON.parse(await readFile(options.compare, "utf8")) as { records: GoldenRecord[] };
      const changed = changedRecords(options.only ? earlier.records.filter((r) => options.only!.includes(r.id)) : earlier.records, records);
      console.log(changed.length ? `Changed against ${options.compare}:\n${changed.join("\n")}` : `No record changed against ${options.compare}.`);
      if (changed.length) process.exitCode = 1;
    }
  } finally { await sql.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  });
}
