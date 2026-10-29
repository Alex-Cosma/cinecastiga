import type { DbSql } from "@seap/db";
import { useSnapshotCoverage } from "./compile";

/**
 * Integration fixtures for the ask engine (plan §6.2). They run only on a
 * dedicated seap_test_* database, inside one transaction that is always rolled
 * back, with every table the engine reads rewritten into a schema of their
 * own. Another test file's committed rows (core.entities, core.cpv_codes,
 * reference.*) never reach a fixture, and a fixture leaves nothing behind.
 */

/** TEST_DATABASE_URL when it names a seap_test_* database; undefined when unset. */
export function testDatabaseUrl(label = "Ask fixtures"): string | undefined {
  const url = process.env["TEST_DATABASE_URL"];
  if (url && !/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))
    throw new Error(`${label} require a dedicated seap_test_* database`);
  return url;
}

/** Qualified tables outside marts that runSpec, runRows and ground read. */
export const ENGINE_GLOBAL_TABLES = [
  "core.entities", "core.entity_sicap_ids", "core.entity_redirects", "core.cpv_codes",
  "core.direct_acquisitions", "core.contracts", "core.awards", "core.contract_winners", "raw.raw_documents",
  "reference.uat", "reference.authority_uat", "reference.company_reps", "reference.cpv_synonym",
] as const;
/** marts tables of the same paths, including the agg_* fast paths. */
export const ENGINE_MARTS_TABLES = [
  "da_transactions", "contract_transactions", "national_stats", "data_coverage", "entity_profile", "entity_flags",
  "agg_top_entities", "agg_national", "agg_years", "agg_map_county", "spend_by_county", "cui_corroborations",
  // F4: the network's signals on a relation (relations.ts relationSignals).
  "flag_instances",
  // A verification reads the pair's contracts outside the sums (fact-check.ts: contractKind, canonicalContract).
  "contract_identity_exclusions", "contract_identity_members", "contract_identity_decisions",
] as const;
/** A marts table a database may predate (migration 0077): created empty with its own columns. */
const MISSING_MARTS_DDL: Record<string, string> = {
  cui_corroborations: "entity_id bigint not null, cui text not null, onrc_name text",
};

/** schema.table → its fixture name: core.entities → <prefix>.core_entities. */
const globalName = (prefix: string, table: string) => `${prefix}.${table.replace(".", "_")}`;

/**
 * A connection whose queries read `marts.*` (and each listed global table)
 * from the fixture schema. Helper calls (sql(list), sql("identifier")) are not
 * queries and pass through; begin() runs inside the caller's transaction.
 */
export function scoped(connection: DbSql, prefix: string, globals: readonly string[] = []): DbSql {
  const tables = globals.length ? new RegExp(`\\b(${globals.map((t) => t.replace(".", "\\.")).join("|")})\\b`, "g") : null;
  return rewritten(connection, (text) => (tables ? text.replace(tables, (t) => globalName(prefix, t)) : text).replace(/\bmarts\./g, `${prefix}.`));
}

/** The caller's transaction as a connection: the engine's own begin() joins it (read-only runs on real data). */
export function joinTransaction(tx: DbSql): DbSql {
  return rewritten(tx, (text) => text);
}

const SAVEPOINT = Symbol("fixture savepoint");
type Savepointed = { savepoint: (work: (sp: DbSql) => Promise<unknown>) => Promise<unknown> };

function rewritten(connection: DbSql, rewrite: (text: string) => string): DbSql {
  const tag = ((chunks: TemplateStringsArray, ...values: unknown[]) => {
    if (!Array.isArray(chunks) || !("raw" in chunks)) return (connection as unknown as (...args: unknown[]) => unknown)(chunks, ...values);
    const mapped = chunks.map(rewrite); Object.defineProperty(mapped, "raw", { value: chunks.raw.map(rewrite) });
    return connection(mapped as unknown as TemplateStringsArray, ...values as never[]);
  }) as unknown as DbSql;
  Object.assign(tag, {
    array: connection.array.bind(connection), unsafe: (text: string) => connection.unsafe(rewrite(text)),
    begin: (first: unknown, second?: unknown) => (typeof first === "function" ? first : second as (db: DbSql) => unknown)(tag),
    // A savepoint of the caller's transaction, rewritten the same way (inSavepoint).
    [SAVEPOINT]: (work: (db: DbSql) => Promise<unknown>) => (connection as unknown as Savepointed).savepoint((sp) => work(rewritten(sp, rewrite))),
  });
  return tag;
}

/**
 * Runs `work` in a savepoint of a scoped() connection, on a connection of that
 * savepoint, so a failing query rolls back to it instead of aborting the
 * fixture's transaction for every later request. postgres.js rethrows such an
 * error when the savepoint ends, even when a route caught it and answered; the
 * answer is what a reader sees, so it is returned.
 */
export async function inSavepoint<T>(q: DbSql, work: (db: DbSql) => Promise<T>): Promise<T> {
  const savepoint = (q as unknown as Record<symbol, (work: (db: DbSql) => Promise<unknown>) => Promise<unknown>>)[SAVEPOINT];
  if (!savepoint) throw new Error("inSavepoint needs a scoped() connection");
  let result: { value: T } | undefined;
  try { await savepoint(async (db) => { result = { value: await work(useSnapshotCoverage(db)) }; }); }
  catch (error) { if (!result) throw error; }
  return result!.value;
}

/**
 * Runs `fill` and then `run` on an empty copy of the engine's tables, in one
 * transaction that is rolled back, and returns what `run` returned. Process
 * coverage caches are bypassed, so a fixture never reads another one's years.
 */
export async function withAskFixture<T>(
  sql: DbSql,
  label: string,
  fill: (q: DbSql) => Promise<void>,
  run: (q: DbSql) => Promise<T>,
  tables: { marts?: readonly string[]; globals?: readonly string[] } = {},
): Promise<T> {
  const prefix = `${label}_${process.pid}_${Date.now()}`;
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(prefix)) throw new Error(`Invalid fixture schema ${prefix}`);
  const marts = tables.marts ?? ENGINE_MARTS_TABLES, globals = tables.globals ?? ENGINE_GLOBAL_TABLES;
  const rollback = new Error("rollback ask fixture");
  let result: { value: T } | undefined;
  try {
    await sql.begin(async (tx) => {
      const t = tx as unknown as DbSql;
      await t.unsafe(`create schema ${prefix}`);
      for (const table of marts) {
        const [present] = await t`select to_regclass(${`marts.${table}`}) is not null ok` as unknown as { ok: boolean }[];
        if (present?.ok) {
          await t.unsafe(`create table ${prefix}.${table} as table marts.${table} with no data`);
          // A copy loses the generation of a stored column (entity_flags.log_total_ron, 0085), which
          // the engine reads as filled once it exists (mart-columns.ts): keep it generated.
          const generated = await t`
            select a.attname col, format_type(a.atttypid, a.atttypmod) type, pg_get_expr(d.adbin, d.adrelid) expr
            from pg_attribute a join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
            where a.attrelid = ${`marts.${table}`}::regclass and a.attgenerated = 's'
          ` as unknown as { col: string; type: string; expr: string }[];
          for (const g of generated)
            await t.unsafe(`alter table ${prefix}.${table} drop column "${g.col}", add column "${g.col}" ${g.type} generated always as (${g.expr}) stored`);
        }
        else if (MISSING_MARTS_DDL[table]) await t.unsafe(`create table ${prefix}.${table} (${MISSING_MARTS_DDL[table]})`);
        else throw new Error(`marts.${table} is missing from the test database`);
      }
      for (const table of globals) await t.unsafe(`create table ${globalName(prefix, table)} as table ${table} with no data`);
      const q = useSnapshotCoverage(scoped(t, prefix, globals));
      await fill(q);
      result = { value: await run(q) };
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  const [left] = await sql`select count(*)::int n from pg_namespace where nspname = ${prefix}` as unknown as { n: number }[];
  if (left?.n) throw new Error(`Fixture schema ${prefix} was not rolled back`);
  return result!.value;
}
