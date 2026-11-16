import { contractRonValue, createDb, type DbSql } from "@seap/db";
import { cleanName } from "./format";
import { flagFindingLabel } from "./flags";
import { recordHeadline } from "./record-labels";
import { savedName } from "./evidence-clip";

/*
 * What "Salvează în anchetă" is about to save, said on its first line (owner, 7 November 2026): the item's name and,
 * when one number is known exactly before the capture, its value (a contract's, an acquisition's, a notice's). An
 * institution's or a firm's record count is not shown here: the capture counts its own selection. Names, not codes
 * (audit Z8-35, owner 16 November 2026): an acquisition and a notice are named by their object, their SEAP code is
 * `code`; a signal by its finding, the firm (or institution) of the case and its period.
 */
const globalDb = globalThis as unknown as { __clipSubjectSql?: DbSql };
const db = () => globalDb.__clipSubjectSql ??= createDb().sql;

export interface ClipSubject { name: string | null; valueExact: string | null; detail: string | null; code?: string | null;
  /** An entity as a reader says it: "Instituție" when it buys, "Firmă" when it only sells (Z8-25). */
  kindLabel?: string | null }

export async function readClipSubject(kind: string, refId: string, sql: DbSql = db()): Promise<ClipSubject | null> {
  if (!/^\d+$/.test(refId)) return null;
  if (kind === "contract") {
    // The contract page's own headline: its title when it names something, else its lot, its notice's title, its CPV category.
    const [row] = await sql`select c.title, c.lots_caption, a.title notice_title, a.notice_no, k.name_ro cpv_name, ${contractRonValue(sql)}::text value from core.contracts c
      left join core.awards a on a.ca_notice_id = c.ca_notice_id left join core.cpv_codes k on k.code = c.cpv_code
      where c.ca_notice_contract_id = ${refId} limit 1`;
    const text = (v: unknown) => v == null ? null : String(v);
    return row ? { name: recordHeadline({ title: text(row.title), lot: text(row.lots_caption), noticeTitle: text(row.notice_title), cpvName: text(row.cpv_name), noticeNo: text(row.notice_no), kind: "Contract" }),
      valueExact: text(row.value), detail: "valoarea contractului" } : null;
  }
  if (kind === "da") {
    // The acquisition page's own title: its name in SEAP, else its CPV category (app/achizitii/[id]).
    const [row] = await sql`select d.da_code, d.closing_value::text value, nullif(btrim(r.payload->>'directAcquisitionName'), '') title, k.name_ro cpv_name
      from core.direct_acquisitions d left join raw.raw_documents r on r.id = d.raw_id left join core.cpv_codes k on k.code = d.cpv_code
      where d.sicap_da_id = ${refId}`;
    const code = row?.da_code == null ? null : String(row.da_code);
    return row ? { name: row.title == null && row.cpv_name == null ? code : String(row.title ?? row.cpv_name), code, valueExact: row.value == null ? null : String(row.value), detail: "valoarea achiziției" } : null;
  }
  if (kind === "notice") {
    const [row] = await sql`select a.notice_no, a.ron_contract_value::text value, a.title, k.name_ro cpv_name from core.awards a left join core.cpv_codes k on k.code = a.cpv_code
      where a.ca_notice_id = ${refId} limit 1`;
    const code = row?.notice_no == null ? null : String(row.notice_no);
    return row ? { name: recordHeadline({ title: row.title == null ? null : String(row.title), cpvName: row.cpv_name == null ? null : String(row.cpv_name), noticeNo: code, kind: code ? `Anunțul ${code}` : "Anunț de atribuire" }),
      code, valueExact: row.value == null ? null : String(row.value), detail: "valoarea din anunț" } : null;
  }
  if (kind === "signal") {
    const [row] = await sql`select flag_code, entity_name, partner_name, period from marts.flag_instances where id = ${refId}`;
    if (!row) return null;
    const who = row.partner_name ?? row.entity_name;
    return { name: [flagFindingLabel(String(row.flag_code)), who == null ? null : cleanName(String(who)), row.period == null ? null : String(row.period)].filter(Boolean).join(" · "), valueExact: null, detail: null };
  }
  if (kind === "entity") {
    const [row] = await sql`select e.name_display, e.county, array(select distinct p.role from marts.entity_profile p where p.entity_id = e.id) roles from core.entities e where e.id = ${refId}`;
    const roles = (row?.roles ?? []) as string[];
    return row ? { name: row.name_display == null ? null : String(row.name_display), valueExact: null, detail: row.county == null ? null : String(row.county),
      kindLabel: roles.includes("authority") ? "Instituție" : roles.includes("supplier") ? "Firmă" : null } : null;
  }
  return null;
}

/**
 * The name and code of a saved item (audit Z8-01, Z8-35): the ones kept with it when it was saved, else, for an item
 * saved before they were kept, the source's — always for an acquisition, a notice or a signal (their kept version
 * names them by code or finding only), and for an institution, a firm or a contract while it has no kept version.
 */
export async function itemName(kind: string, refId: string | null, rawSnapshot: unknown, hasKeptName: boolean, sql: DbSql = db()): Promise<{ label: string | null; code: string | null; kindLabel: string | null }> {
  const saved = savedName(rawSnapshot);
  if (saved.label || !refId || !(["da", "notice", "signal"].includes(kind) || !hasKeptName && ["entity", "contract"].includes(kind))) return saved;
  const subject = await readClipSubject(kind, refId, sql).catch(() => null);
  return { label: subject?.name ?? null, code: saved.code ?? subject?.code ?? null, kindLabel: saved.kindLabel ?? subject?.kindLabel ?? null };
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
