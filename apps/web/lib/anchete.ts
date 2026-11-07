import { canonicalPersonKey, contractRonValue, cuiCorroborated, onrcIdentityBirthDate } from "@seap/db";
import { createDb, type DbSql } from "@seap/db";
import { isWorkspaceId, withInvestigationAccess, type InvestigationAccess } from "./investigation-access";
import { EVIDENCE_KINDS, type EvidenceKind, type CaptureSummary } from "./evidence-captures-shared";
import { validateCaptureRequest } from "./evidence-capture-input";
import { captureSummary, queueCapture } from "./evidence-captures";
import { sharedRepresentativePairs, type MemberRepRow } from "./shared-representatives";
import { moneyUnit } from "./evidence-clip";

/**
 * Data access for watchdog investigations ("anchete"). Server-only.
 *
 * Clip model: reference (stable key) + snapshot (numbers as seen at clip
 * time, verified by a server capture job — browser monetary values are never
 * trusted)
 * + note (the "why") + provenance (ask spec, when applicable). The dosar
 * view recomputes live values for entity/contract/person clips and flags
 * drift against the snapshot.
 */
const g = globalThis as unknown as { __seapAncheteSql?: DbSql };
function db(): DbSql {
  if (!g.__seapAncheteSql) g.__seapAncheteSql = createDb().sql;
  return g.__seapAncheteSql;
}

export type ClipKind = EvidenceKind | "document_quote";
export const CLIP_KINDS: ClipKind[] = [...EVIDENCE_KINDS];
export type InvStatus = "activa" | "publicata" | "inchisa";
export const INV_STATUSES: InvStatus[] = ["activa", "publicata", "inchisa"];

export interface InvestigationRow {
  id: string;
  title: string;
  description: string | null;
  status: InvStatus;
  nClips: number;
  /** What the dossier's "Dovezi" tab counts: the saved items and the editorial notes (owner, 7 November 2026). */
  nEvidence?: number;
  createdAt: string;
  updatedAt: string;
  access?: InvestigationAccess;
  /** Shared: the owner's name when the reader is a member; the number of members when the reader owns it. */
  ownerName?: string | null;
  nMembers?: number;
}

/** An invitation addressed to this account's confirmed address, still open (its link is the owner's to send). */
export interface PendingInvite {
  id: string;
  investigationTitle: string;
  role: "editor" | "viewer";
  inviterName: string | null;
  expiresAt: string;
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
  /** The saved risk is the old index (before rf-2026.18): it is not compared with today's score. */
  methodologyChanged?: boolean;
  capture?: CaptureSummary | null;
  captures?: CaptureSummary[];
  /** A saved contract's or acquisition's parties, with their ids, read from its records. */
  parties?: ClipParties | null;
}

export interface ClipParties { authorityId: string | null; authority: string | null; suppliers: { id: string | null; name: string | null }[] }

/* ── investigations CRUD ─────────────────────────────────────────────── */

export async function listInvestigations(
  userId: string,
): Promise<InvestigationRow[]> {
  const sql = db();
  const rows = (await sql`
    select i.id, i.title, i.description, i.status,
           i.created_at, i.updated_at, case when i.owner_user_id = ${userId} then 'owner' else m.role end role,
           (select count(*) from app.clips c where c.investigation_id = i.id) n_clips,
           (select count(*) from app.workspace_entries e where e.investigation_id = i.id and e.kind = 'note' and e.deleted_at is null) n_notes,
           (select count(*) from app.investigation_members x where x.investigation_id = i.id) n_members,
           case when i.owner_user_id = ${userId} then null else (select u.name from auth.users u where u.id = i.owner_user_id) end owner_name
    from app.investigations i
    left join app.investigation_members m on m.investigation_id=i.id and m.user_id=${userId}
    where i.owner_user_id = ${userId} or m.user_id is not null
    order by i.updated_at desc
  `) as unknown as {
    id: string;
    title: string;
    description: string | null;
    status: string;
    created_at: string;
    updated_at: string;
    n_clips: string;
    n_notes: string;
    n_members: string;
    owner_name: string | null;
    role: InvestigationAccess["role"];
  }[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status as InvStatus,
    nClips: Number(r.n_clips),
    nEvidence: Number(r.n_clips) + Number(r.n_notes),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    access: { role:r.role,canEdit:r.role!=="viewer",canManage:r.role==="owner" },
    ownerName: r.owner_name,
    nMembers: Number(r.n_members),
  }));
}

/** Open invitations addressed to this account's confirmed address. The link stays the owner's to send: only its
 *  hash is stored, so the list says where to look rather than offering a way in. */
export async function listPendingInvites(userId: string): Promise<PendingInvite[]> {
  const rows = await db()`
    select v.id, i.title, v.role, u2.name inviter, v.expires_at::text expires_at
    from app.investigation_invites v
    join app.investigations i on i.id = v.investigation_id
    join auth.users u on u.id = ${userId} and u.email_verified = true and lower(u.email) = v.email
    left join auth.users u2 on u2.id = v.created_by
    where v.revoked_at is null and v.accepted_at is null and v.expires_at > now()
      and i.owner_user_id <> ${userId}
      and not exists (select 1 from app.investigation_members m where m.investigation_id = i.id and m.user_id = ${userId})
    order by v.expires_at`;
  return rows.map((r) => ({ id: String(r.id), investigationTitle: String(r.title), role: r.role === "editor" ? "editor" : "viewer",
    inviterName: r.inviter == null ? null : String(r.inviter), expiresAt: String(r.expires_at) }));
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

/** Historical name retained: readers include the owner and authorized members. */
export async function getOwnedInvestigation(userId:string,id:string):Promise<InvestigationRow|null>{
  return withInvestigationAccess(userId,id,"read",async(q,access)=>{
    const [r]=await q`select i.*,(select count(*)::int from app.clips c where c.investigation_id=i.id) n_clips
      from app.investigations i where i.id=${id}`;
    return r?{id:String(r.id),title:r.title,description:r.description,status:r.status,nClips:r.n_clips,
      createdAt:String(r.created_at),updatedAt:String(r.updated_at),access}:null;
  },db());
}

export async function updateInvestigation(userId: string, id: string,
  patch: { title?: string; description?: string | null; status?: InvStatus }): Promise<boolean> {
  return !!await withInvestigationAccess(userId,id,"edit",async q=>{
    const [own]=await q`select title,description,status from app.investigations where id=${id}`;
    if(!own)return false;
    await q`update app.investigations set title=${patch.title??own.title},
      description=${patch.description===undefined?own.description:patch.description},
      status=${patch.status??own.status},updated_at=now() where id=${id}`;
    return true;
  },db());
}
export async function deleteInvestigation(userId:string,id:string):Promise<boolean>{
  return !!await withInvestigationAccess(userId,id,"manage",async q=>{
    await q`delete from app.investigations where id=${id}`;return true;
  },db());
}

/* ── snapshots (server-built, per kind) ──────────────────────────────── */

async function snapEntity(
  refId: string,
): Promise<Record<string, unknown> | null> {
  const sql = db();
  const prof = (await sql`
    select role, name_display, county, n_das, n_contracts, total_ron_full
    from marts.entity_profile where entity_id = ${Number(refId)}
  `) as unknown as {
    role: string;
    name_display: string | null;
    county: string | null;
    n_das: number;
    n_contracts: number;
    total_ron_full: string | null;
  }[];
  // The risk score of the role that scores highest (rf-2026.18), as an entity capture's summary has it.
  const flags = (await sql`
    select role, score, n_flags, flags from marts.entity_flags where entity_id = ${Number(refId)}
    order by score_raw desc, n_flags desc, role
  `) as unknown as {
    role: string;
    score: number;
    n_flags: number;
    flags: string[] | null;
  }[];
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
      totalRon: p.total_ron_full ?? "0",
    };
  }
  const f = flags[0];
  return {
    name: prof[0]?.name_display ?? "?",
    county: prof[0]?.county ?? null,
    roles,
    score: f ? Number(f.score) : null,
    nFlags: f ? Number(f.n_flags) : 0,
    flags: f?.flags ?? [],
  };
}

async function snapContract(
  refId: string,
): Promise<Record<string, unknown> | null> {
  const sql = db();
  const rows = (await sql`
    select c.ca_notice_contract_id nat_id, c.title, ${contractRonValue(sql)} contract_value, c.contract_date,
           c.cpv_code, t.authority_name, t.supplier_name, t.closing_value, t.finalization_date
    from core.contracts c
    left join marts.contract_transactions t on t.contract_id = c.id
    where c.ca_notice_contract_id = ${Number(refId)}
    limit 1
  `) as unknown as {
    nat_id: string;
    title: string | null;
    contract_value: string | null;
    contract_date: string | null;
    cpv_code: string | null;
    authority_name: string | null;
    supplier_name: string | null;
    closing_value: string | null;
    finalization_date: string | null;
  }[];
  const r = rows[0];
  if (!r) return null;
  return {
    title: r.title,
    authority: r.authority_name,
    supplier: r.supplier_name,
    valueRon: r.contract_value,
    valueExact: r.contract_value,
    supplierShareExact: r.closing_value,
    valueBasis: "full_contract",
    date:
      r.finalization_date ??
      (r.contract_date ? String(r.contract_date).slice(0, 10) : null),
    cpvCode: r.cpv_code,
  };
}

async function snapNotice(
  refId: string,
): Promise<Record<string, unknown> | null> {
  const sql = db();
  const rows = (await sql`
    select count(distinct t.contract_id) n, coalesce(sum(t.closing_value), 0) v,
           max(t.authority_name) authority, max(t.notice_no) notice_no
    from marts.contract_transactions t
    where t.ca_notice_id = ${Number(refId)}
  `) as unknown as {
    n: string;
    v: string;
    authority: string | null;
    notice_no: string | null;
  }[];
  const r = rows[0];
  if (!r || Number(r.n) === 0) return null;
  return {
    authority: r.authority,
    noticeNo: r.notice_no,
    nContracts: Number(r.n),
    valueRon: r.v,
  };
}

async function snapPerson(
  refId: string,
): Promise<Record<string, unknown> | null> {
  const sql = db();
  const rows = (await sql`
    select max(r.person_name) nm,
           array_agg(distinct coalesce(f.name, r.cui)) firms,
           count(distinct r.cui) n_firms
    from reference.company_reps r
    left join reference.onrc_firm f on f.cui = r.cui
    where r.person_key = ${canonicalPersonKey(refId)}
    group by r.person_key
  `) as unknown as { nm: string; firms: string[] | null; n_firms: string }[];
  const r = rows[0];
  if (!r) return null;
  return {
    name: r.nm,
    nFirms: Number(r.n_firms),
    firms: r.firms ?? [],
  };
}

async function snapFlag(
  refId: string,
  flagCode: string,
): Promise<Record<string, unknown> | null> {
  const sql = db();
  const rows = (await sql`
    select entity_name, severity, total_ron, period, evidence
    from marts.flag_instances
    where entity_id = ${Number(refId)} and flag_code = ${flagCode}
    order by severity desc nulls last limit 1
  `) as unknown as {
    entity_name: string | null;
    severity: string | null;
    total_ron: string | null;
    period: string | null;
    evidence: unknown;
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
    case "da":
    case "signal":
    case "monitoring":
    case "radiografie":
      // Server-verified frozen captures are built by the durable capture job.
      // Legacy browser monetary snapshots are never accepted as verified data.
      return null;
    case "note":
    case "document_quote":
      return null;
  }
}

/* ── clips CRUD ──────────────────────────────────────────────────────── */

export async function addClip(userId:string,investigationId:string,input:{
  kind:ClipKind;refId:string|null;spec:unknown;note:string|null;clientSnapshot:Record<string,unknown>|null;
}):Promise<{id:string;capture:CaptureSummary|null;captureId:string|null}|{error:string}>{
  const request=validateCaptureRequest(input.kind,input.refId,input.spec,input.clientSnapshot);
  if("error" in request)return request;
  const added=await withInvestigationAccess(userId,investigationId,"edit",async q=>{
    const snapshot={verification:request.kind==="note"?"editorial":"queued",
      evidenceScope:request.options.scope??{},evidenceOptions:request.options,...(request.connection?{connection:request.connection}:{}),...(request.peer?{peer:request.peer}:{})};
    const [clip]=await q`insert into app.clips(investigation_id,kind,ref_id,spec,snapshot,note,created_by)
      values(${investigationId},${request.kind},${request.refId},${JSON.stringify(request.spec)}::jsonb,
      ${JSON.stringify(snapshot)}::jsonb,${input.note},${userId}) returning id`;
    const capture=request.kind==="note"?null:await queueCapture(q,userId,investigationId,String(clip!.id),request);
    await q`update app.investigations set updated_at=now() where id=${investigationId}`;
    return{id:String(clip!.id),capture,captureId:capture?.id??null};
  },db());
  return added??{error:"Nu ai permisiunea de a adăuga probe în această anchetă."};
}

export async function updateClip(userId:string,investigationId:string,clipId:string,
  patch:{note?:string|null;pinned?:boolean}):Promise<boolean>{
  if(!isWorkspaceId(clipId))return false;
  return !!await withInvestigationAccess(userId,investigationId,"edit",async q=>{
    const rows=await q`update app.clips set
      note=case when ${patch.note!==undefined} then ${patch.note??null} else note end,
      pinned=coalesce(${patch.pinned??null},pinned)
      where id=${clipId} and investigation_id=${investigationId} returning id`;
    if(rows.length)await q`update app.investigations set updated_at=now() where id=${investigationId}`;
    return rows.length>0;
  },db());
}
export async function deleteClip(userId:string,investigationId:string,clipId:string):Promise<boolean>{
  if(!isWorkspaceId(clipId))return false;
  return !!await withInvestigationAccess(userId,investigationId,"edit",async q=>{
    const rows=await q`delete from app.clips where id=${clipId} and investigation_id=${investigationId} returning id`;
    return rows.length>0;
  },db());
}

/* ── dosar read: clips + live drift + cast relations ─────────────────── */

function driftKeys(kind: ClipKind): string[] {
  switch (kind) {
    // An entity's risk is compared by entityRiskDrift.
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

const savedScore = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : null;

/**
 * The entity's risk against the saved one (rf-2026.18): the score and the
 * number of patterns, only when both sides have a score. A clip or capture
 * saved before holds the old index (cri, nFlags): its numbers mean something
 * else, so they are not reported as a change; the dossier says the
 * methodology changed instead.
 */
export function entityRiskDrift(
  snap: Record<string, unknown>,
  live: Record<string, unknown>,
): { drift: string[]; methodologyChanged: boolean } {
  const before = savedScore(snap["score"]), now = savedScore(live["score"]);
  if (before === null) return { drift: [], methodologyChanged: now !== null && ("cri" in snap || "nFlags" in snap) };
  if (now === null) return { drift: [], methodologyChanged: false };
  const drift: string[] = [];
  if (before !== now) drift.push("riscul");
  if (Number(snap["nFlags"] ?? 0) !== Number(live["nFlags"] ?? 0)) drift.push("tiparele");
  return { drift, methodologyChanged: false };
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
    if (Math.abs(a - b) > Math.max(1000, a * 0.005))
      out.push(`total (${role})`);
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
  /** The exact sum of the pair's records (the relation's own text). */
  valueExact?: string;
  count?: number;
}

async function castRelations(clipRows: ClipRow[]): Promise<{
  members: CastMember[];
  relations: CastRelation[];
}> {
  const sql = db();
  const entityIds = [
    ...new Set(
      clipRows
        .filter((c) => c.kind === "entity" && c.refId)
        .map((c) => Number(c.refId)),
    ),
  ];
  const personKeys = [
    ...new Set(
      clipRows
        .filter((c) => c.kind === "person" && c.refId)
        .map((c) => c.refId!),
    ),
  ];
  const members: CastMember[] = [];
  for (const c of clipRows) {
    if (
      c.kind === "entity" &&
      c.refId &&
      !members.some((m) => m.refId === c.refId)
    ) {
      members.push({
        kind: "entity",
        refId: c.refId,
        name: String(c.snapshot?.["name"] ?? "?"),
      });
    }
    if (
      c.kind === "person" &&
      c.refId &&
      !members.some((m) => m.refId === c.refId)
    ) {
      members.push({
        kind: "person",
        refId: c.refId,
        name: String(c.snapshot?.["name"] ?? "?"),
      });
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
        a: String(p.a),
        b: String(p.b),
        type: "pair_da",
        label: "achiziții directe",
        valueRon: Number(p.v),
        valueExact: String(p.v),
        count: Number(p.n),
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
        a: String(p.a),
        b: String(p.b),
        type: "pair_contract",
        label: "contracte",
        valueRon: Number(p.v),
        valueExact: String(p.v),
        count: Number(p.n),
      });
    }
    // shared administrators between entity members (matched via CUI), solid
    // person identity only: see shared-representatives.ts (audit F32)
    const memberReps = (await sql`
      select e.id::text entity_id, r.person_key, r.person_name, r.birth_date::text birth_date,
             r.snapshot_date::text snapshot_date
      from core.entities e
      join reference.company_reps r on r.cui = e.cui_canonical
      where e.id = any(${sql.array(entityIds)}::bigint[])
        and ${onrcIdentityBirthDate(sql, "r")} and r.person_key is not null
        and ${cuiCorroborated(sql, "e")}
    `) as unknown as MemberRepRow[];
    for (const srow of sharedRepresentativePairs(memberReps)) {
      relations.push({
        a: srow.a,
        b: srow.b,
        type: "shared_admin",
        label: `administrator comun: ${srow.name}`,
      });
    }
  }
  if (personKeys.length > 0 && entityIds.length > 0) {
    // person member administers an entity member; a key without an
    // identifying birth date merges namesakes and links nothing (audit F37)
    const adminOf = (await sql`
      select r.person_key pk, e.id eid, max(r.person_name) nm
      from reference.company_reps r
      join core.entities e on e.cui_canonical = r.cui
      where r.person_key = any(${sql.array(personKeys.map(canonicalPersonKey))}::text[])
        and ${onrcIdentityBirthDate(sql, "r")}
        and e.id = any(${sql.array(entityIds)}::bigint[])
        and ${cuiCorroborated(sql, "e")}
      group by 1, 2
    `) as unknown as { pk: string; eid: string; nm: string }[];
    // A clip saved before the name fold (0090) keeps its own key as the member id.
    for (const arow of adminOf) {
      for (const key of personKeys.filter((k) => canonicalPersonKey(k) === arow.pk)) {
        relations.push({
          a: key,
          b: String(arow.eid),
          type: "shared_admin",
          label: "administrator al firmei",
        });
      }
    }
  }
  return { members, relations };
}

/**
 * The dossier's saved records at a glance ("Pe scurt", owner 7 November 2026): every record of the latest complete
 * version of each saved item, a record counted once even when several items hold it (a direct acquisition, or one
 * supplier's share of a contract, keyed by its stream, source id and supplier).
 */
export interface DossierRecords {
  count: number;
  /** The exact sum of the known values; values the source does not publish are counted in `unknownValues`. */
  totalExact: string | null;
  unknownValues: number;
  dateFrom: string | null;
  dateTo: string | null;
  /** Rows of the latest versions, repeats across items included. */
  savedRows: number;
  /** Over DOSSIER_SUMMARY_CAP saved rows the distinct count and total are not recomputed on each view (0 / null). */
  capped: boolean;
}

/** Above this many saved rows a dossier view does not deduplicate them (that is the export's and each sheet's work). */
export const DOSSIER_SUMMARY_CAP = 100_000;

/** A dated event read from a saved record (a contract's date, a direct acquisition's finalization), not written by people. */
export interface SourceEvent {
  clipId: string;
  date: string;
  kind: "contract" | "da";
  /** What happened on that date, in words. */
  label: string;
  title: string;
  valueExact: string | null;
  /** "lei", or the contract's own currency code (moneyUnit in lib/evidence-clip.ts). */
  unit: string;
  href: string;
  sourceUrl: string | null;
}

export interface Dosar {
  investigation: InvestigationRow;
  clips: ClipRow[];
  access: InvestigationAccess;
  cast: { members: CastMember[]; relations: CastRelation[] };
  records: DossierRecords;
  sourceEvents: SourceEvent[];
}

const calendarDay = (value: unknown): string | null => typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;

export async function dossierRecords(q: DbSql, id: string): Promise<DossierRecords> {
  const [size] = await q`select coalesce(sum(row_count), 0)::bigint n from (select distinct on (clip_id) row_count from app.evidence_captures
    where investigation_id = ${id} and status = 'complete' order by clip_id, version desc) l`;
  const savedRows = Number(size?.n ?? 0);
  if (savedRows > DOSSIER_SUMMARY_CAP) return { count: 0, totalExact: null, unknownValues: 0, dateFrom: null, dateTo: null, savedRows, capped: true };
  // One row per direct acquisition (its id alone: a supplier's identity may differ between versions) and per supplier
  // share of a contract (an unidentified winner by name, else that row).
  const [row] = await q`
    with latest as (
      select distinct on (clip_id) id, completed_at from app.evidence_captures
      where investigation_id = ${id} and status = 'complete' order by clip_id, version desc
    ), distinct_rows as (
      select distinct on (k.src, k.ref, k.party)
        left(r.record->>'date', 10) d, r.value_exact v
      from app.evidence_capture_rows r join latest l on l.id = r.capture_id
      cross join lateral (select r.record->>'src' src, coalesce(r.record->>'refId', r.capture_id::text || ':' || r.row_no::text) ref,
        case when r.record->>'src' = 'da' then '' else coalesce(r.record->>'supplierId', 'n:' || (r.record->>'supplier'), r.capture_id::text || ':' || r.row_no::text) end party) k
      order by k.src, k.ref, k.party, l.completed_at desc
    )
    select count(*)::int n, trim_scale(sum(v))::text total, count(*) filter (where v is null)::int unknown,
      min(d) filter (where d ~ '^\\d{4}-\\d{2}-\\d{2}$') date_from, max(d) filter (where d ~ '^\\d{4}-\\d{2}-\\d{2}$') date_to
    from distinct_rows`;
  return { count: Number(row?.n ?? 0), totalExact: row?.total == null ? null : String(row.total), unknownValues: Number(row?.unknown ?? 0),
    dateFrom: row?.date_from ?? null, dateTo: row?.date_to ?? null, savedRows, capped: false };
}

type SavedClip = Pick<ClipRow, "id" | "kind" | "refId" | "snapshot" | "capture">;

/** The saved records of the contract, direct-acquisition and notice items (their latest complete version, at most
 *  200 each): their dates and parties. An entity's or a question's thousands of records stay in their lists. */
export async function readSavedRecords(q: DbSql, id: string, clips: SavedClip[]): Promise<Map<string, Record<string, unknown>[]>> {
  const wanted = clips.filter((clip) => ["contract", "da", "notice"].includes(clip.kind) && clip.capture);
  const out = new Map<string, Record<string, unknown>[]>();
  if (!wanted.length) return out;
  const rows = await q`
    with latest as (
      select distinct on (clip_id) id, clip_id from app.evidence_captures
      where investigation_id = ${id} and status = 'complete' and clip_id = any(${q.array(wanted.map((clip) => clip.id))}::uuid[])
      order by clip_id, version desc
    )
    select l.clip_id::text clip_id, r.record from latest l
    join lateral (select record from app.evidence_capture_rows where capture_id = l.id order by row_no limit 200) r on true`;
  for (const row of rows) out.set(String(row.clip_id), [...(out.get(String(row.clip_id)) ?? []), row.record as Record<string, unknown>]);
  return out;
}

/** Who bought from whom in a saved contract or acquisition, from its records (the ids the summary does not keep). */
export function recordParties(records: readonly Record<string, unknown>[]): ClipParties | null {
  const first = records[0];
  if (!first) return null;
  const text = (value: unknown) => typeof value === "string" && value ? value : null;
  const suppliers = [...new Map(records.map((r) => [String(r.supplierId ?? r.supplier ?? ""), { id: text(r.supplierId), name: text(r.supplier) }])).values()];
  return { authorityId: text(first.authorityId), authority: text(first.authority), suppliers };
}

/** The dates of the saved contract, direct-acquisition and notice items, from their records: a contract's date, an
 *  acquisition's finalization, each contract a notice awarded. Pure. */
export function sourceEventsFrom(clips: SavedClip[], recordsByClip: Map<string, Record<string, unknown>[]>): SourceEvent[] {
  const out: SourceEvent[] = [];
  for (const clip of clips) {
    const records = recordsByClip.get(clip.id);
    if (!records || !["contract", "da", "notice"].includes(clip.kind)) continue;
    const summary = clip.snapshot ?? {};
    if (clip.kind === "contract") {
      const date = calendarDay(summary.date) ?? calendarDay(records[0]?.date);
      if (!date || !clip.refId) continue;
      out.push({ clipId: clip.id, date, kind: "contract", label: "Data contractului", title: String(summary.title ?? records[0]?.daCode ?? `Contract ${clip.refId}`),
        valueExact: typeof summary.contractValueFull === "string" ? summary.contractValueFull : typeof summary.valueExact === "string" ? summary.valueExact : null,
        unit: moneyUnit(summary.currency), href: `/contracte/${clip.refId}`, sourceUrl: typeof records[0]?.sourceUrl === "string" ? records[0].sourceUrl : null });
    } else if (clip.kind === "da") {
      const date = calendarDay(records[0]?.date) ?? calendarDay(summary.date);
      if (!date || !clip.refId) continue;
      out.push({ clipId: clip.id, date, kind: "da", label: "Achiziție directă finalizată", title: String(summary.title ?? records[0]?.daCode ?? `Achiziția ${clip.refId}`),
        valueExact: typeof summary.valueExact === "string" ? summary.valueExact : typeof records[0]?.valueExact === "string" ? records[0].valueExact : null,
        unit: "lei", href: `/achizitii/${clip.refId}`, sourceUrl: typeof records[0]?.sourceUrl === "string" ? records[0].sourceUrl : null });
    } else {
      // A notice: one event per contract it awarded (the supplier shares of one contract share its date).
      const seen = new Set<string>();
      for (const record of records) {
        const ref = typeof record.refId === "string" ? record.refId : null, date = calendarDay(record.date);
        if (!ref || !date || seen.has(ref)) continue;
        seen.add(ref);
        out.push({ clipId: clip.id, date, kind: "contract", label: `Contract din anunțul ${String(summary.noticeNo ?? record.daCode ?? "")}`.trim(),
          title: String(record.daCode ?? `Contract ${ref}`), valueExact: typeof record.contractValueFull === "string" ? record.contractValueFull : null,
          unit: moneyUnit(record.currency), href: `/contracte/${ref}`, sourceUrl: typeof record.sourceUrl === "string" ? record.sourceUrl : null });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export async function sourceEvents(q: DbSql, id: string, clips: SavedClip[]): Promise<SourceEvent[]> {
  return sourceEventsFrom(clips, await readSavedRecords(q, id, clips));
}

export async function getDosar(
  userId: string,
  id: string,
): Promise<Dosar | null> {
  return withInvestigationAccess(userId,id,"read",async(sql,access)=>{
  const [investigation]=await sql`select i.*,(select count(*)::int from app.clips c where c.investigation_id=i.id) n_clips
    from app.investigations i where i.id=${id}`;
  if(!investigation)return null;
  const inv:InvestigationRow={id:String(investigation.id),title:investigation.title,description:investigation.description,
    status:investigation.status,nClips:investigation.n_clips,createdAt:String(investigation.created_at),
    updatedAt:String(investigation.updated_at),access};
  const rows = (await sql`
    select id, kind, ref_id, spec, snapshot, note, pinned, created_at
    from app.clips where investigation_id = ${id}
    order by pinned desc, created_at desc
  `) as unknown as {
    id: string;
    kind: string;
    ref_id: string | null;
    spec: unknown;
    snapshot: Record<string, unknown> | null;
    note: string | null;
    pinned: boolean;
    created_at: string;
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
  const captured=await sql`select * from app.evidence_captures where investigation_id=${id} order by version desc`;
  for(const clip of clips){
    clip.captures=captured.filter(row=>String(row.clip_id)===clip.id).map(captureSummary);
    clip.capture=clip.captures[0]??null;
    const complete=clip.captures.find(capture=>capture.status==="complete");
    if(complete?.summary)clip.snapshot=complete.summary;
    else if(!clip.capture&&clip.kind!=="note"&&clip.kind!=="document_quote")clip.snapshot={...clip.snapshot,verification:"legacy-unverified"};
  }
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
      if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null))
        drift.push(k);
    }
    if (c.kind === "entity") {
      const risk = entityRiskDrift(c.snapshot, live);
      drift.push(...risk.drift, ...entityTotalsDrift(c.snapshot, live));
      if (risk.methodologyChanged) c.methodologyChanged = true;
    }
    if (drift.length) c.drift = drift;
  }
  const cast = await castRelations(clips);
  const records = await dossierRecords(sql, id);
  const saved = await readSavedRecords(sql, id, clips);
  for (const clip of clips) if (clip.kind === "contract" || clip.kind === "da") clip.parties = recordParties(saved.get(clip.id) ?? []);
  const events = sourceEventsFrom(clips, saved);
  return { investigation: inv, clips, cast, access, records, sourceEvents: events };
  },db());
}
