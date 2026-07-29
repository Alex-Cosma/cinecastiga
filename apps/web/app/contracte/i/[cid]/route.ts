import { NextResponse } from "next/server";
import { createDb, type DbSql } from "@seap/db";

/**
 * Internal-id bridge: drill rows carry marts' contract_id (internal bigint),
 * while /contracte/[nid] is keyed by SICAP's stable ca_notice_contract_id.
 * GET /contracte/i/{contractId} → 302 to the canonical page.
 */

const g = globalThis as unknown as { __seapCidSql?: DbSql };
function db(): DbSql {
  if (!g.__seapCidSql) g.__seapCidSql = createDb().sql;
  return g.__seapCidSql;
}

export async function GET(req: Request, ctx: { params: Promise<{ cid: string }> }) {
  const { cid } = await ctx.params;
  if (!/^\d+$/.test(cid)) return new NextResponse("id invalid", { status: 400 });
  const rows = (await db()`
    select ca_notice_contract_id nid from core.contracts where id = ${cid}
  `) as unknown as { nid: string }[];
  if (!rows[0]) return new NextResponse("necunoscut", { status: 404 });
  return NextResponse.redirect(new URL(`/contracte/${rows[0].nid}`, req.url), 302);
}
