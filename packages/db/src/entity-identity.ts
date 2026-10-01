import type { DbSql } from "./client.js";

/** Resolve verified redirects only; no fuzzy matching, no name-based merging. */
export async function canonicalEntityId(sql: DbSql, id: string): Promise<string> {
  if (!/^[0-9]{1,16}$/.test(id) || !Number.isSafeInteger(Number(id))) return "0";
  const rows = await sql`select core.canonical_entity_id(${id}::bigint)::text id`;
  return String(rows[0]?.id ?? id);
}
export async function entityRedirectMap(sql: DbSql, ids: string[]): Promise<Map<string,string>> {
  const valid = [...new Set(ids)].filter(id => /^[0-9]{1,16}$/.test(id) && Number.isSafeInteger(Number(id)));
  if (!valid.length) return new Map();
  const rows = await sql`select old_id::text, canonical_id::text from core.entity_redirects where old_id=any(${valid}::bigint[])`;
  return new Map(rows.filter(r => r.old_id != null && r.canonical_id != null).map(r => [String(r.old_id),String(r.canonical_id)]));
}
