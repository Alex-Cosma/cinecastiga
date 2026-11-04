import type { DbSql } from "@seap/db";

/**
 * The town hall a locality question names ("primăria X"): of the identities the answer counts for the locality, the
 * one with the largest registered value as a buyer (owner, 4 November 2026: the title links to it; no picker).
 * Nearly every locality has a single identity; the few with a second SICAP account keep their largest.
 */
export async function townHallOf(sql: DbSql, authorityIds: readonly string[]): Promise<{ id: string } | null> {
  if (authorityIds.length === 0) return null;
  if (authorityIds.length === 1) return { id: String(authorityIds[0]) };
  const [top] = await sql`
    select entity_id::text id from marts.entity_profile
    where role = 'authority' and entity_id = any(${sql.array([...authorityIds])}::bigint[])
    order by total_ron_full desc nulls last, entity_id
    limit 1`;
  return top ? { id: String(top.id) } : { id: String(authorityIds[0]) };
}
