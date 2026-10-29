import type { DbSql } from "@seap/db";

/** A CPV code (a division to a full code), not words: "45", "45233", "03413000-8". */
export const isCpvCodeTerm = (term: string): boolean => /^(?:\d{2,8}|\d{8}-\d)$/.test(term.replace(/\s+/g, ""));

/**
 * The catalogue name of the node a code names, as the catalogue writes it
 * ("Lucrări de construcţii"): a prefix names its own padded node, never an
 * arbitrary child. One lookup for /api/cpv/label and the answer of
 * /api/ask, so a link's title says the same name before and after the
 * builder's own lookup (the breakdown's „CPV 45” on a fresh page, S4).
 */
export async function cpvCodeName(sql: DbSql, term: string): Promise<string | null> {
  const code = term.replace(/\s+/g, "");
  if (!isCpvCodeTerm(code)) return null;
  const catalogueCode = code.split("-")[0]!.padEnd(8, "0");
  const rows = await sql`
    select name_ro from core.cpv_codes
    where code = ${catalogueCode} or code like ${catalogueCode + "-%"}
    order by code limit 1
  ` as unknown as { name_ro: string | null }[];
  return rows[0]?.name_ro ?? null;
}
