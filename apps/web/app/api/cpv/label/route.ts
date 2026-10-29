import { createDb, type DbSql } from "@seap/db";
import { cpvCodeName, isCpvCodeTerm } from "../../../../lib/ask/cpv-label";

const globalDb = globalThis as unknown as { __seapSql?: DbSql };

/** Resolve a selected code without running a procurement query or typeahead.
 * A prefix names its own padded catalogue node, never an arbitrary child. */
export async function GET(request: Request): Promise<Response> {
  const code = new URL(request.url).searchParams.get("code")?.replace(/\s+/g, "") ?? "";
  if (!isCpvCodeTerm(code)) {
    return Response.json({ error: "Cod CPV invalid." }, { status: 400 });
  }
  try {
    const sql = globalDb.__seapSql ??= createDb().sql;
    return Response.json({ name: await cpvCodeName(sql, code) }, {
      headers: { "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    return Response.json({ error: "Denumirea domeniului nu poate fi încărcată acum." }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
