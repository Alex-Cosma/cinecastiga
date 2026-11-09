import type { DbSql } from "./client.js";
import { SHADOW_SCHEMAS, SHADOW_SUFFIX } from "./shadow.js";

/**
 * The swap of the blue/green processing (owner, 9 November 2026): the validated shadow schemas become the live ones by
 * renaming, in one short transaction, while the site keeps serving. Postgres binds tables, indexes, constraints,
 * sequences, triggers and the materialized view by their internal ids, so they follow the rename; queries prepared
 * earlier re-resolve the names (verified locally on 9 November). Two things name schemas as TEXT and are restored here:
 * the bodies of functions (rewritten to `_next` for the build) take back the live bodies, which are canonical.
 * Yesterday's schemas stay as `_prev` until the next build starts: an instant rollback.
 */
export const PREV_SUFFIX = "_prev";

type Sql = DbSql | Parameters<Parameters<DbSql["begin"]>[1]>[0];

const live = SHADOW_SCHEMAS;
const next = SHADOW_SCHEMAS.map((s) => `${s}${SHADOW_SUFFIX}`);
const prev = SHADOW_SCHEMAS.map((s) => `${s}${PREV_SUFFIX}`);

async function schemas(q: Sql): Promise<Set<string>> {
  const rows = (await q`select nspname from pg_namespace where nspname = any(${q.array([...live, ...next, ...prev])}::text[])`) as unknown as { nspname: string }[];
  return new Set(rows.map((r) => r.nspname));
}

/** Gives every function of `target` the body of the same function in `source` (CREATE OR REPLACE keeps its id, so the
 * triggers that call it stay bound). The source bodies name the live schemas, as the migrations wrote them. */
async function restoreFunctionBodies(q: Sql, source: readonly string[], target: readonly string[]): Promise<number> {
  let restored = 0;
  for (let i = 0; i < source.length; i++) {
    const rows = (await q`
      select pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = ${source[i]!} and p.prokind = 'f'`) as unknown as { def: string }[];
    for (const { def } of rows) {
      // Only the header names the source schema; the body keeps the text it was created with.
      const header = new RegExp(`^(CREATE OR REPLACE FUNCTION )${source[i]!}\\.`);
      if (!header.test(def)) throw new Error(`Unexpected function definition in ${source[i]}: ${def.slice(0, 120)}`);
      await q.unsafe(def.replace(header, `$1${target[i]!}.`));
      restored++;
    }
  }
  return restored;
}

export interface SwapReport { swappedAt: string; functionsRestored: number; durationMs: number }

/**
 * Makes the shadow schemas live. Refuses unless the three `_next` schemas exist and no `_prev` is left (the build drops
 * yesterday's before it starts). `onSwapped` runs inside the same transaction, after the rename: the caller writes the
 * ready checkpoint there, so the publication and the data change together or not at all.
 */
export async function swapShadowSchemas(sql: DbSql, onSwapped?: (q: Sql) => Promise<void>, options: { buildRole?: string } = {}): Promise<SwapReport> {
  const started = Date.now();
  return sql.begin(async (q) => {
    await q`select set_config('lock_timeout', '5s', true)`;
    const present = await schemas(q);
    const missing = next.filter((s) => !present.has(s));
    if (missing.length) throw new Error(`Shadow schemas missing: ${missing.join(", ")}`);
    const left = prev.filter((s) => present.has(s));
    if (left.length) throw new Error(`Previous schemas still present: ${left.join(", ")}; drop them before a swap`);
    // The build role owned what it built; hand it all to seap first (nobody reads the shadow, so no lock waits), so the
    // build role never owns a live object and keeps no privilege on it.
    if (options.buildRole) {
      if (!/^[a-z_][a-z0-9_]*$/.test(options.buildRole)) throw new Error(`Invalid build role: ${options.buildRole}`);
      await q.unsafe(`reassign owned by ${options.buildRole} to current_user`);
    }
    for (let i = 0; i < live.length; i++) {
      await q.unsafe(`alter schema ${live[i]} rename to ${prev[i]}`);
      await q.unsafe(`alter schema ${next[i]} rename to ${live[i]}`);
    }
    // The previous (live) bodies are canonical: give them to the new live functions.
    const functionsRestored = await restoreFunctionBodies(q, prev, live);
    await onSwapped?.(q);
    return { swappedAt: new Date().toISOString(), functionsRestored, durationMs: Date.now() - started };
  }) as Promise<SwapReport>;
}

/** Puts yesterday's schemas back (`_prev` -> live; today's become `_next` again, for inspection). Their function bodies
 * were never rewritten. `onRolledBack` runs in the same transaction (the caller records the rollback there). */
export async function rollbackShadowSwap(sql: DbSql, onRolledBack?: (q: Sql) => Promise<void>): Promise<{ durationMs: number }> {
  const started = Date.now();
  return sql.begin(async (q) => {
    await q`select set_config('lock_timeout', '5s', true)`;
    const present = await schemas(q);
    const missing = prev.filter((s) => !present.has(s));
    if (missing.length) throw new Error(`Nothing to roll back to: ${missing.join(", ")} missing`);
    if (next.some((s) => present.has(s))) throw new Error("A shadow build is present; drop it before a rollback");
    for (let i = 0; i < live.length; i++) {
      await q.unsafe(`alter schema ${live[i]} rename to ${next[i]}`);
      await q.unsafe(`alter schema ${prev[i]} rename to ${live[i]}`);
    }
    await onRolledBack?.(q);
    return { durationMs: Date.now() - started };
  }) as Promise<{ durationMs: number }>;
}

/** Drops schemas of one suffix (`_prev` before a new build, `_next` after a failure was inspected). Never the live ones. */
export async function dropShadowSchemas(sql: DbSql, which: "prev" | "next"): Promise<string[]> {
  const names = which === "prev" ? prev : next;
  const present = await schemas(sql);
  const dropped = names.filter((s) => present.has(s));
  for (const s of dropped) await sql.unsafe(`drop schema ${s} cascade`);
  return dropped;
}
