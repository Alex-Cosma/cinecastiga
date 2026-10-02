import { createDb, type DbSql } from "@seap/db";

const globalDb = globalThis as unknown as { __seapSql?: DbSql };

/** Resolve a selected code without running a procurement query or typeahead.
 * A prefix names its own padded catalogue node, never an arbitrary child. */
export async function GET(request: Request): Promise<Response> {
  const code = new URL(request.url).searchParams.get("code")?.replace(/\s+/g, "") ?? "";
  if (!/^(?:\d{2,8}|\d{8}-\d)$/.test(code)) {
    return Response.json({ error: "Cod CPV invalid." }, { status: 400 });
  }
  try {
    const sql = globalDb.__seapSql ??= createDb().sql;
    const catalogueCode = code.split("-")[0]!.padEnd(8, "0");
    const rows = await sql`
      select name_ro from core.cpv_codes
      where code = ${catalogueCode} or code like ${catalogueCode + "-%"}
      order by code limit 1
    `;
    return Response.json({ name: rows[0]?.name_ro ?? null }, {
      headers: { "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    return Response.json({ error: "Denumirea domeniului nu poate fi încărcată acum." }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
