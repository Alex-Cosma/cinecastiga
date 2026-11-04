import { createDb, type DbSql } from "@seap/db";
import { cleanName } from "./format";

/** The main identity a reviewed older or secondary one points to: its name and CUI, by primary key. */
const g = globalThis as unknown as { __seapSql?: DbSql };
export async function getSuccessorTarget(id: string): Promise<{ id: string; name: string; cui: string | null } | null> {
  const sql = (g.__seapSql ??= createDb().sql);
  const [row] = await sql`select id::text id, name_display name, cui_canonical cui from core.entities where id = ${id}::bigint`;
  return row?.name ? { id: String(row.id), name: cleanName(String(row.name)), cui: row.cui ? String(row.cui) : null } : null;
}
