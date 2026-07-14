import { cpvTree, type Db, type DbSql } from "@seap/db";
import { readBson } from "./bson.js";

/**
 * Build `marts.cpv_tree` from the 2020 dump's `nationalCpvDataSimplified`
 * collection — the full CPV hierarchy with precomputed subtree totals that backs
 * the drill-down treemap. This is the ONLY display mart with no core-derivable
 * equivalent (core has per-record CPV codes but not the precomputed rollup tree),
 * so it stays dump-sourced; every other mart is built from core by `runMarts`.
 *
 * NOTE: the totals here are the 2018–2020 snapshot. A future improvement is to
 * roll the tree up from core (DA + award spend by CPV code) so it tracks live
 * data too; until then the treemap is historical.
 */
const BATCH = 1000;

export interface BuildMartsResult {
  cpvTreeNodes: number;
}

/** Recursively flatten a nationalCpvDataSimplified node into cpv_tree rows. */
function* flattenCpv(
  node: Record<string, unknown>,
  parentCode: string | null,
  level: number,
): Generator<typeof cpvTree.$inferInsert> {
  const code = String(node["_id"]);
  const children = (node["children"] as Record<string, unknown>[] | undefined) ?? [];
  yield {
    code,
    parentCode,
    level,
    nameRo: (node["description"] as string | undefined) ?? null,
    totalRon: (Number(node["total"]) || 0).toFixed(2),
    nChildren: children.length,
  };
  for (const c of children) yield* flattenCpv(c, code, level + 1);
}

export async function buildMarts(
  db: Db,
  _sql: DbSql,
  dir: string,
  log: (m: string) => void = () => {},
): Promise<BuildMartsResult> {
  const treeRows: (typeof cpvTree.$inferInsert)[] = [];
  for (const d of readBson(`${dir}/nationalCpvDataSimplified.bson`)) {
    if (!/^\d{2}/.test(String(d["_id"]))) continue; // skip a possible "SEAP" super-root
    for (const row of flattenCpv(d, null, 1)) treeRows.push(row);
  }
  for (let i = 0; i < treeRows.length; i += BATCH) {
    await db.insert(cpvTree).values(treeRows.slice(i, i + BATCH)).onConflictDoNothing();
  }
  log(`  cpv_tree: ${treeRows.length} nodes`);
  return { cpvTreeNodes: treeRows.length };
}
