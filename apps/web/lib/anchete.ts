import { createDb, type DbSql } from "@seap/db";

/**
 * Data access for watchdog investigations ("anchete"). Server-only.
 *
 * Clip model: reference (stable key) + snapshot (numbers as seen at clip
 * time, built HERE from marts — never trusted from the browser, except for
 * `query` clips whose snapshot is the ask response the user was looking at)
 * + note (the "why") + provenance (ask spec, when applicable). The dosar
 * view recomputes live values for entity/contract/person clips and flags
 * drift against the snapshot.
 */
const g = globalThis as unknown as { __seapAncheteSql?: DbSql };
function db(): DbSql {
  if (!g.__seapAncheteSql) g.__seapAncheteSql = createDb().sql;
  return g.__seapAncheteSql;
}

export type ClipKind = "entity" | "contract" | "notice" | "person" | "query" | "flag" | "note";
export const CLIP_KINDS: ClipKind[] = ["entity", "contract", "notice", "person", "query", "flag", "note"];
export type InvStatus = "activa" | "publicata" | "inchisa";
export const INV_STATUSES: InvStatus[] = ["activa", "publicata", "inchisa"];

export interface InvestigationRow {
  id: string;
  title: string;
  description: string | null;
  status: InvStatus;
  nClips: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClipRow {
  id: string;
  kind: ClipKind;
  refId: string | null;
  spec: unknown;
  snapshot: Record<string, unknown> | null;
  note: string | null;
  pinned: boolean;
  createdAt: string;
  /** present on dosar reads for kinds we recompute */
  live?: Record<string, unknown> | null;
  drift?: string[];
}

/* ── investigations CRUD ─────────────────────────────────────────────── */

export async function listInvestigations(userId: string): Promise<InvestigationRow[]> {
  const sql = db();
  const rows = (await sql`
    select i.id, i.title, i.description, i.status,
           i.created_at, i.updated_at,
           (select count(*) from app.clips c where c.investigation_id = i.id) n_clips
    from app.investigations i
    where i.owner_user_id = ${userId}
    order by i.updated_at desc
  `) as unknown as {
    id: string; title: string; description: string | null; status: string;
    created_at: string; updated_at: string; n_clips: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status as InvStatus,
    nClips: Number(r.n_clips),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }));
}

export async function createInvestigation(
  userId: string,
  title: string,
  description: string | null,
): Promise<string> {
  const sql = db();
  const rows = (await sql`
    insert into app.investigations (owner_user_id, title, description)
    values (${userId}, ${title}, ${description})
    returning id
  `) as unknown as { id: string }[];
  return rows[0]!.id;
}

/** Returns the row only when owned by userId (authorization = ownership). */
export async function getOwnedInvestigation(
  userId: string,
  id: string,
): Promise<InvestigationRow | null> {
  const sql = db();
  const rows = (await sql`
    select i.id, i.title, i.description, i.status, i.created_at, i.updated_at,
           (select count(*) from app.clips c where c.investigation_id = i.id) n_clips
    from app.investigations i
    where i.id = ${id} and i.owner_user_id = ${userId}
  `) as unknown as {
    id: string; title: string; description: string | null; status: string;
    created_at: string; updated_at: string; n_clips: string;
  }[];
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id, title: r.title, description: r.description, status: r.status as InvStatus,
    nClips: Number(r.n_clips), createdAt: String(r.created_at), updatedAt: String(r.updated_at),
  };
}

export async function updateInvestigation(
  userId: string,
  id: string,
  patch: { title?: string; description?: string | null; status?: InvStatus },
): Promise<boolean> {
  const sql = db();
  const own = await getOwnedInvestigation(userId, id);
  if (!own) return false;
  await sql`
    update app.investigations set
      title = ${patch.title ?? own.title},
      description = ${patch.description === undefined ? own.description : patch.description},
      status = ${patch.status ?? own.status},
      updated_at = now()
    where id = ${id}
  `;
  return true;
}

export async function deleteInvestigation(userId: string, id: string): Promise<boolean> {
  const sql = db();
  const rows = (await sql`
    delete from app.investigations where id = ${id} and owner_user_id = ${userId} returning id
  `) as unknown as { id: string }[];
  return rows.length > 0;
}

/* ── snapshots (server-built, per kind) ──────────────────────────────── */

async function snapEntity(refId: string): Promise<Record<string, unknown> | null> {
  const sql = db();
  const prof = (await sql`
    select role, name_display, county, n_das, n_contracts, total_ron_full
    from marts.entity_profile where entity_id = ${Number(refId)}
  `) as unknown as {
    role: string; name_display: string | null; county: string | null;
    n_das: number; n_contracts: number; total_ron_full: string | null;
  }[];
  const flags = (await sql`
    select role, cri, n_flags, flags from marts.entity_flags where entity_id = ${Number(refId)}
  `) as unknown as { role: string; cri: string | null; n_flags: number; flags: string[] | null }[];
  if (prof.length === 0 && flags.length === 0) {
    const ent = (await sql`
      select name_display, county from core.entities where id = ${Number(refId)}
    `) as unknown as { name_display: string; county: string | null }[];
    if (ent.length === 0) return null;
    return { name: ent[0]!.name_display, county: ent[0]!.county, roles: {} };
  }
  const roles: Record<string, unknown> = {};
  for (const p of prof) {
    roles[p.role] = {
      nDas: Number(p.n_das),
      nContracts: Number(p.n_contracts),
      totalRon: Number(p.total_ron_full ?? 0),
    };
  }
  const f = flags.sort((a, b) => Number(b.cri ?? 0) - Number(a.cri ?? 0))[0];
  return {
    name: prof[0]?.name_display ?? "?",
    county: prof[0]?.county ?? null,
    roles,
    cri: f?.cri !== null && f?.cri !== undefined ? Number(f.cri) : null,
    nFlags: f ? Number(f.n_flags) : 0,
    flags: f?.flags ?? [],
  };
}

async function snapContract(refId: string): Promise<Record<string, unknown> | null> {
  const sql = db();
  const rows = (await sql`
    select c.ca_notice_contract_id nat_id, c.title, c.contract_value, c.contract_date,
           c.cpv_code, t.authority_name, t.supplier_name, t.closing_value, t.finalization_date
    from core.contracts c
    left join marts.contract_transactions t on t.contract_id = c.id
    where c.ca_notice_contract_id = ${Number(refId)}
    limit 1
  `) as unknown as {
    nat_id: string; title: string | null; contract_value: string | null; contract_date: string | null;
    cpv_code: string | null; authority_name: string | null; supplier_name: string | null;
    closing_value: string | null; finalization_date: string | null;
  }[];
  const r = rows[0];
  if (!r) return null;
  return {
    title: r.title,
    authority: r.authority_name,
    supplier: r.supplier_name,
    valueRon: Number(r.closing_value ?? r.contract_value ?? 0),
    date: r.finalization_date ?? (r.contract_date ? String(r.contract_date).slice(0, 10) : null),
    cpvCode: r.cpv_code,
  };
}

async function snapNotice(refId: string): Promise<Record<string, unknown> | null> {
  const sql = db();
  const rows = (await sql`
    select count(*) n, coalesce(sum(t.closing_value), 0) v,
           max(t.authority_name) authority, max(t.notice_no) notice_no
    from marts.contract_transactions t
    where t.ca_notice_id = ${Number(refId)}
  `) as unknown as { n: string; v: string; authority: string | null; notice_no: string | null }[];
  const r = rows[0];
  if (!r || Number(r.n) === 0) return null;
  return {
    authority: r.authority,
    noticeNo: r.notice_no,
    nContracts: Number(r.n),
    valueRon: Number(r.v),
  };
}

async function snapPerson(refId: string): Promise<Record<string, unknown> | null> {
  const sql = db();
  const rows = (await sql`
    select max(r.person_name) nm,
           array_agg(distinct coalesce(f.name, r.cui)) firms,
           count(distinct r.cui) n_firms
    from reference.company_reps r
    left join reference.onrc_firm f on f.cui = r.cui
    where r.person_key = ${refId}
    group by r.person_key
  `) as unknown as { nm: string; firms: string[] | null; n_firms: string }[];
  const r = rows[0];
  if (!r) return null;
  return { name: r.nm, nFirms: Number(r.n_firms), firms: (r.firms ?? []).slice(0, 12) };
}

async function snapFlag(refId: string, flagCode: string): Promise<Record<string, unknown> | null> {
  const sql = db();
  const rows = (await sql`
    select entity_name, severity, total_ron, period, evidence
    from marts.flag_instances
    where entity_id = ${Number(refId)} and flag_code = ${flagCode}
    order by severity desc nulls last limit 1
  `) as unknown as {
    entity_name: string | null; severity: string | null; total_ron: string | null;
    period: string | null; evidence: unknown;
  }[];
  const r = rows[0];
  if (!r) return null;
  return {
    code: flagCode,
    entityName: r.entity_name,
    totalRon: Number(r.total_ron ?? 0),
    period: r.period,
    evidence: r.evidence,
    methodology: "rf-2026.4",
  };
}

export async function buildSnapshot(
  kind: ClipKind,
  refId: string | null,
  spec: unknown,
  clientSnapshot: Record<string, unknown> | null,
): Promise<Record<string, unknown> | null> {
  switch (kind) {
    case "entity":
      return refId ? snapEntity(refId) : null;
    case "contract":
      return refId ? snapContract(refId) : null;
    case "notice":
      return refId ? snapNotice(refId) : null;
    case "person":
      return refId ? snapPerson(refId) : null;
    case "flag": {
      const code = (spec as { flag?: string } | null)?.flag;
      return refId && code ? snapFlag(refId, code) : null;
    }
    case "query":
      // the one client-trusted snapshot: it IS what the user was looking at
      return clientSnapshot;
    case "note":
      return null;
  }
}

/* ── clips CRUD ──────────────────────────────────────────────────────── */

export async function addClip(
  userId: string,
  investigationId: string,
  input: {
    kind: ClipKind;
    refId: string | null;
    spec: unknown;
    note: string | null;
    clientSnapshot: Record<string, unknown> | null;
  },
): Promise<{ id: string } | { error: string }> {
  const own = await getOwnedInvestigation(userId, investigationId);
  if (!own) return { error: "Anchetă inexistentă." };
  if (input.kind !== "note") {
    const dup = (await db()`
      select id from app.clips
      where investigation_id = ${investigationId} and kind = ${input.kind}
        and ref_id is not distinct from ${input.refId}
        and (${input.kind !== "query"} or spec::text = ${JSON.stringify(input.spec ?? null)})
      limit 1
    `) as unknown as { id: string }[];
    if (dup.length > 0) return { error: "Există deja în această anchetă." };
  }
  const snapshot = await buildSnapshot(input.kind, input.refId, input.spec, input.clientSnapshot);
  if (input.kind !== "note" && input.kind !== "query" && !snapshot) {
    return { error: "Nu am găsit obiectul de atașat." };
  }
  const sql = db();
  const specJson = input.spec === null || input.spec === undefined ? null : JSON.stringify(input.spec);
  const snapJson = snapshot === null ? null : JSON.stringify(snapshot);
  const rows = (await sql`
    insert into app.clips (investigation_id, kind, ref_id, spec, snapshot, note, created_by)
    values (${investigationId}, ${input.kind}, ${input.refId},
            ${specJson}::jsonb, ${snapJson}::jsonb,
            ${input.note}, ${userId})
    returning id
  `) as unknown as { id: string }[];
  await sql`update app.investigations set updated_at = now() where id = ${investigationId}`;
  return { id: rows[0]!.id };
}

export async function updateClip(
  userId: string,
  investigationId: string,
  clipId: string,
  patch: { note?: string | null; pinned?: boolean },
): Promise<boolean> {
  const own = await getOwnedInvestigation(userId, investigationId);
  if (!own) return false;
  const sql = db();
  const rows = (await sql`
    update app.clips set
      note = case when ${patch.note !== undefined} then ${patch.note ?? null} else note end,
      pinned = coalesce(${patch.pinned ?? null}, pinned)
    where id = ${clipId} and investigation_id = ${investigationId}
    returning id
  `) as unknown as { id: string }[];
  return rows.length > 0;
}

export async function deleteClip(
  userId: string,
  investigationId: string,
  clipId: string,
): Promise<boolean> {
  const own = await getOwnedInvestigation(userId, investigationId);
  if (!own) return false;
  const rows = (await db()`
    delete from app.clips where id = ${clipId} and investigation_id = ${investigationId} returning id
  `) as unknown as { id: string }[];
  return rows.length > 0;
}

/* ── dosar read: clips + live drift + cast relations ─────────────────── */

function driftKeys(kind: ClipKind): string[] {
  switch (kind) {
    case "entity":
      return ["cri", "nFlags"];
    case "contract":
      return ["valueRon"];
    case "notice":
      return ["nContracts", "valueRon"];
    case "person":
      return ["nFirms"];
    default:
      return [];
  }
}

/** Entity totals drift nightly by design; only count a role total as drifted
 *  when it moved by more than 0.5% — the journalist cares about revisions,
 *  not the daily trickle. */
function entityTotalsDrift(
  snap: Record<string, unknown>,
  live: Record<string, unknown>,
): string[] {
  const out: string[] = [];
  const sr = (snap["roles"] ?? {}) as Record<string, { totalRon?: number }>;
  const lr = (live["roles"] ?? {}) as Record<string, { totalRon?: number }>;
  for (const role of new Set([...Object.keys(sr), ...Object.keys(lr)])) {
    const a = Number(sr[role]?.totalRon ?? 0);
    const b = Number(lr[role]?.totalRon ?? 0);
    if (Math.abs(a - b) > Math.max(1000, a * 0.005)) out.push(`total (${role})`);
  }
  return out;
}

export interface CastMember {
  kind: "entity" | "person";
  refId: string;
  name: string;
}
export interface CastRelation {
  a: string; // refId
  b: string;
  type: "pair_da" | "pair_contract" | "shared_admin";
  label: string;
  valueRon?: number;
  count?: number;
}

async function castRelations(clipRows: ClipRow[]): Promise<{
  members: CastMember[];
  relations: CastRelation[];
}> {
  const sql = db();
  const entityIds = [
    ...new Set(
      clipRows.filter((c) => c.kind === "entity" && c.refId).map((c) => Number(c.refId)),
    ),
  ];
  const personKeys = [
    ...new Set(clipRows.filter((c) => c.kind === "person" && c.refId).map((c) => c.refId!)),
  ];
  const members: CastMember[] = [];
  for (const c of clipRows) {
    if (c.kind === "entity" && c.refId && !members.some((m) => m.refId === c.refId)) {
      members.push({ kind: "entity", refId: c.refId, name: String(c.snapshot?.["name"] ?? "?") });
    }
    if (c.kind === "person" && c.refId && !members.some((m) => m.refId === c.refId)) {
      members.push({ kind: "person", refId: c.refId, name: String(c.snapshot?.["name"] ?? "?") });
    }
  }
  const relations: CastRelation[] = [];
  if (entityIds.length >= 2) {
    const daPairs = (await sql`
      select authority_id a, supplier_id b, count(*) n, coalesce(sum(closing_value), 0) v
      from marts.da_transactions
      where authority_id = any(${sql.array(entityIds)}::bigint[])
        and supplier_id = any(${sql.array(entityIds)}::bigint[])
        and not value_suspect
      group by 1, 2
    `) as unknown as { a: string; b: string; n: string; v: string }[];
    for (const p of daPairs) {
      relations.push({
        a: String(p.a), b: String(p.b), type: "pair_da",
        label: "achiziții directe", valueRon: Number(p.v), count: Number(p.n),
      });
    }
    const ctPairs = (await sql`
      select authority_id a, supplier_id b, count(*) n, coalesce(sum(closing_value), 0) v
      from marts.contract_transactions
      where authority_id = any(${sql.array(entityIds)}::bigint[])
        and supplier_id = any(${sql.array(entityIds)}::bigint[])
      group by 1, 2
    `) as unknown as { a: string; b: string; n: string; v: string }[];
    for (const p of ctPairs) {
      relations.push({
        a: String(p.a), b: String(p.b), type: "pair_contract",
        label: "contracte", valueRon: Number(p.v), count: Number(p.n),
      });
    }
    // shared administrators between entity members (matched via CUI)
    const shared = (await sql`
      with member_cuis as (
        select e.id entity_id, e.cui_canonical cui
        from core.entities e
        where e.id = any(${sql.array(entityIds)}::bigint[]) and e.cui_canonical is not null
      )
      select m1.entity_id a, m2.entity_id b, r1.person_key, max(r1.person_name) nm
      from member_cuis m1
      join reference.company_reps r1 on r1.cui = m1.cui
      join reference.company_reps r2 on r2.person_key = r1.person_key
      join member_cuis m2 on m2.cui = r2.cui and m2.entity_id > m1.entity_id
      where r1.person_key is not null
      group by 1, 2, 3
    `) as unknown as { a: string; b: string; person_key: string; nm: string }[];
    for (const srow of shared) {
      relations.push({
        a: String(srow.a), b: String(srow.b), type: "shared_admin",
        label: `administrator comun: ${srow.nm}`,
      });
    }
  }
  if (personKeys.length > 0 && entityIds.length > 0) {
    // person member administers an entity member
    const adminOf = (await sql`
      select r.person_key pk, e.id eid, max(r.person_name) nm
      from reference.company_reps r
      join core.entities e on e.cui_canonical = r.cui
      where r.person_key = any(${sql.array(personKeys)}::text[])
        and e.id = any(${sql.array(entityIds)}::bigint[])
      group by 1, 2
    `) as unknown as { pk: string; eid: string; nm: string }[];
    for (const arow of adminOf) {
      relations.push({
        a: arow.pk, b: String(arow.eid), type: "shared_admin",
        label: "administrator al firmei",
      });
    }
  }
  return { members, relations };
}

export interface Dosar {
  investigation: InvestigationRow;
  clips: ClipRow[];
  cast: { members: CastMember[]; relations: CastRelation[] };
}

export async function getDosar(userId: string, id: string): Promise<Dosar | null> {
  const inv = await getOwnedInvestigation(userId, id);
  if (!inv) return null;
  const sql = db();
  const rows = (await sql`
    select id, kind, ref_id, spec, snapshot, note, pinned, created_at
    from app.clips where investigation_id = ${id}
    order by pinned desc, created_at desc
  `) as unknown as {
    id: string; kind: string; ref_id: string | null; spec: unknown;
    snapshot: Record<string, unknown> | null; note: string | null;
    pinned: boolean; created_at: string;
  }[];
  const clips: ClipRow[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind as ClipKind,
    refId: r.ref_id,
    spec: r.spec,
    snapshot: r.snapshot,
    note: r.note,
    pinned: r.pinned,
    createdAt: String(r.created_at),
  }));
  // live recompute + drift for the cheap kinds
  for (const c of clips) {
    if (!c.refId || !c.snapshot) continue;
    if (!["entity", "contract", "notice", "person"].includes(c.kind)) continue;
    const live = await buildSnapshot(c.kind, c.refId, c.spec, null);
    c.live = live;
    if (!live) {
      c.drift = ["obiectul nu mai există"];
      continue;
    }
    const drift: string[] = [];
    for (const k of driftKeys(c.kind)) {
      const a = c.snapshot[k];
      const b = live[k];
      if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) drift.push(k);
    }
    if (c.kind === "entity") drift.push(...entityTotalsDrift(c.snapshot, live));
    if (drift.length) c.drift = drift;
  }
  const cast = await castRelations(clips);
  return { investigation: inv, clips, cast };
}
