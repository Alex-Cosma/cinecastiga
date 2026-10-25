import { entityRedirectMap, type DbSql } from "@seap/db";
import { cleanName } from "./format";

/*
 * The names of the institutions and firms an old link's precise selection
 * lists by id without labels (GET /api/entity-names), for the (?) of its chip
 * in the builder (lib/ask/filters/describe.ts populationDetail). Read lazily:
 * the answer never waits for them, and the (?) counts them until they come.
 */

/** As many as a selection's chips can name (unnamedEntityIds). */
export const MAX_ENTITY_NAMES = 20;

/** The ids of a request, or null when one is malformed or there are too many. */
export function entityNameIds(raw: string | null): string[] | null {
  const ids = [...new Set((raw ?? "").split(",").map((id) => id.trim()).filter(Boolean))];
  return ids.length && ids.length <= MAX_ENTITY_NAMES && ids.every((id) => /^[1-9]\d{0,15}$/.test(id) && Number.isSafeInteger(Number(id))) ? ids : null;
}

/** Each id's display name, by primary key; a merged id gets its canonical entity's name, an unknown one none. */
export async function entityNames(sql: DbSql, ids: readonly string[]): Promise<Record<string, string>> {
  const redirects = await entityRedirectMap(sql, [...ids]);
  const target = (id: string) => redirects.get(id) ?? id;
  const rows = await sql`
    select id::text id, name_display from core.entities where id = any(${[...new Set(ids.map(target))]}::bigint[])
  ` as unknown as { id: string; name_display: string | null }[];
  const byId = new Map(rows.filter((row) => row.name_display).map((row) => [row.id, cleanName(row.name_display)]));
  return Object.fromEntries(ids.flatMap((id) => byId.has(target(id)) ? [[id, byId.get(target(id))!]] : []));
}
