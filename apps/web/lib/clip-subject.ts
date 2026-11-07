import { contractRonValue, createDb, type DbSql } from "@seap/db";

/*
 * What "Salvează în anchetă" is about to save, said on its first line (owner, 7 November 2026): the item's name and,
 * when one number is known exactly before the capture, its value (a contract's, an acquisition's, a notice's). An
 * institution's or a firm's record count is not shown here: the capture counts its own selection.
 */
const globalDb = globalThis as unknown as { __clipSubjectSql?: DbSql };
const db = () => globalDb.__clipSubjectSql ??= createDb().sql;

export interface ClipSubject { name: string | null; valueExact: string | null; detail: string | null }

export async function readClipSubject(kind: string, refId: string, sql: DbSql = db()): Promise<ClipSubject | null> {
  if (!/^\d+$/.test(refId)) return null;
  if (kind === "contract") {
    const [row] = await sql`select c.title, ${contractRonValue(sql)}::text value from core.contracts c where c.ca_notice_contract_id = ${refId} limit 1`;
    return row ? { name: row.title == null ? null : String(row.title), valueExact: row.value == null ? null : String(row.value), detail: "valoarea contractului" } : null;
  }
  if (kind === "da") {
    const [row] = await sql`select da_code, closing_value::text value from core.direct_acquisitions where sicap_da_id = ${refId}`;
    return row ? { name: row.da_code == null ? null : String(row.da_code), valueExact: row.value == null ? null : String(row.value), detail: "valoarea achiziției" } : null;
  }
  if (kind === "notice") {
    const [row] = await sql`select notice_no, ron_contract_value::text value from core.awards where ca_notice_id = ${refId} limit 1`;
    return row ? { name: row.notice_no == null ? null : `Anunțul ${String(row.notice_no)}`, valueExact: row.value == null ? null : String(row.value), detail: "valoarea din anunț" } : null;
  }
  if (kind === "entity") {
    const [row] = await sql`select name_display, county from core.entities where id = ${refId}`;
    return row ? { name: row.name_display == null ? null : String(row.name_display), valueExact: null, detail: row.county == null ? null : String(row.county) } : null;
  }
  return null;
}

/** The dossiers of this account that already hold the same item (same kind and source id; a Radiografie selection also by its spec). */
export async function readSavedIn(userId: string, kind: string, refId: string | null, spec: unknown, sql: DbSql = db()): Promise<Record<string, string>> {
  if (!refId) return {};
  const rows = kind === "radiografie" && spec && typeof spec === "object"
    ? await sql`select distinct on (c.investigation_id) c.investigation_id::text inv, c.id::text clip from app.clips c
        join app.investigations i on i.id = c.investigation_id
        left join app.investigation_members m on m.investigation_id = i.id and m.user_id = ${userId}
        where (i.owner_user_id = ${userId} or m.user_id is not null) and c.kind = ${kind} and c.ref_id = ${refId}
          and c.spec->>'type' is not distinct from ${String((spec as Record<string, unknown>).type ?? "")}
          and coalesce(c.spec->>'patternId', c.spec->>'supplierId') is not distinct from ${String((spec as Record<string, unknown>).patternId ?? (spec as Record<string, unknown>).supplierId ?? "")}
          -- A pattern id is local to one rebuild (lib/radiografie-evidence.ts): the same pattern also has the same fingerprint.
          and (c.spec->>'type' is distinct from 'pattern'
            or c.spec->>'expectedFingerprint' is not distinct from ${typeof (spec as Record<string, unknown>).expectedFingerprint === "string" ? String((spec as Record<string, unknown>).expectedFingerprint) : null})
        order by c.investigation_id, c.created_at desc`
    : await sql`select distinct on (c.investigation_id) c.investigation_id::text inv, c.id::text clip from app.clips c
        join app.investigations i on i.id = c.investigation_id
        left join app.investigation_members m on m.investigation_id = i.id and m.user_id = ${userId}
        where (i.owner_user_id = ${userId} or m.user_id is not null) and c.kind = ${kind} and c.ref_id = ${refId}
        order by c.investigation_id, c.created_at desc`;
  return Object.fromEntries(rows.map((row) => [String(row.inv), String(row.clip)]));
}
