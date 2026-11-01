import { createDb, otherRegistryNames, type DbSql } from "@seap/db";

/*
 * ONRC's names for an entity's corroborated CUI that are not its SICAP name
 * (owner approval of 1 November 2026): a firm renamed after its contracts, or
 * moved to another county under a new registration number, keeps its old name
 * in SICAP. ONRC's open data has no dates, so the page says "în registru" and
 * never "numele actual".
 */
export async function readRegistryNames(q: DbSql, cui: string, entityName: string | null | undefined): Promise<string[]> {
  const rows = (await q`select name from reference.onrc_firm where cui = ${cui} order by j_number`) as unknown as { name: string }[];
  return otherRegistryNames(entityName, rows.map((r) => r.name));
}

const g = globalThis as unknown as { __seapRegistryNamesSql?: DbSql };
export const getRegistryNames = (cui: string, entityName: string | null | undefined) =>
  readRegistryNames((g.__seapRegistryNamesSql ??= createDb().sql), cui, entityName);
