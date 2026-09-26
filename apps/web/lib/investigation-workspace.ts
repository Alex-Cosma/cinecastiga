import { createHash, randomBytes } from "node:crypto";
import type { DbSql } from "@seap/db";
import { isWorkspaceId, withInvestigationAccess, workspaceDatabase, type InvestigationAccess } from "./investigation-access";

export type EntryKind = "question" | "note" | "task" | "event";
export type EntryStatus = "open" | "checking" | "done";
export type EvidenceStance = "supports" | "contradicts" | "check";
export interface WorkspaceEntry { id: string; kind: EntryKind; title: string; body: string; alternative: string; status: EntryStatus; occurredOn: string | null; revision: number; createdAt: string; updatedAt: string; author: string | null }
export interface WorkspaceLink { questionId: string; clipId: string; stance: EvidenceStance; note: string }
export interface WorkspaceRevision { entryId: string; revision: number; content: Record<string, unknown>; createdAt: string; author: string | null }
export interface InvestigationWorkspace { access: InvestigationAccess; entries: WorkspaceEntry[]; links: WorkspaceLink[]; revisions: WorkspaceRevision[] }
export class WorkspaceError extends Error { constructor(message: string, public status = 400) { super(message); } }
const kinds: EntryKind[] = ["question", "note", "task", "event"];
const statuses: EntryStatus[] = ["open", "checking", "done"];
const stances: EvidenceStance[] = ["supports", "contradicts", "check"];
export function workspaceText(value: unknown, limit: number, required = false): string {
  if (typeof value !== "string" || value.length > limit || (required && !value.trim())) throw new WorkspaceError(`Completează textul${required ? " obligatoriu" : ""} (maximum ${limit} de caractere).`);
  return value.trim();
}
export function parseEntry(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WorkspaceError("Datele trimise nu sunt valide.");
  const body = value as Record<string, unknown>;
  if (!kinds.includes(body.kind as EntryKind) || !statuses.includes(body.status as EntryStatus)) throw new WorkspaceError("Tipul sau starea nu este validă.");
  const date = body.occurredOn === null || body.occurredOn === "" || body.occurredOn === undefined ? null : body.occurredOn;
  if (date !== null && (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new WorkspaceError("Alege o dată validă.");
  if (body.kind === "event" && !date) throw new WorkspaceError("Evenimentul are nevoie de o dată.");
  return { kind: body.kind as EntryKind, title: workspaceText(body.title, 300, true), body: workspaceText(body.body ?? "", 12000),
    alternative: workspaceText(body.alternative ?? "", 12000), status: body.status as EntryStatus, occurredOn: date as string | null };
}
async function touch(q: DbSql, id: string) { await q`update app.investigations set updated_at=now() where id=${id}`; }
async function saveRevision(q: DbSql, entryId: string, userId: string) {
  await q`insert into app.workspace_revisions (entry_id,revision,content,actor_id)
    select id,revision,jsonb_build_object('kind',kind,'title',title,'body',body,'alternative',alternative,'status',status,'occurredOn',occurred_on,'deleted',deleted_at is not null),${userId}
    from app.workspace_entries where id=${entryId}`;
}

export async function getInvestigationWorkspace(userId: string, id: string, database?: DbSql): Promise<InvestigationWorkspace | null> {
  return withInvestigationAccess(userId, id, "read", (q, access) => readInvestigationWorkspace(q, id, access), database);
}

/** For bundle exports already inside an authorized transaction. */
export async function readInvestigationWorkspace(q: DbSql, id: string, access: InvestigationAccess, options?: { allRevisions?: boolean }): Promise<InvestigationWorkspace> {
    const entries = await q`select e.id,e.kind,e.title,e.body,e.alternative,e.status,e.occurred_on "occurredOn",e.revision,
      e.created_at::text "createdAt",e.updated_at::text "updatedAt",u.name author
      from app.workspace_entries e left join auth.users u on u.id=e.updated_by
      where e.investigation_id=${id} and e.deleted_at is null order by e.created_at,e.id`;
    const links = await q`select question_id "questionId",clip_id "clipId",stance,note from app.question_evidence
      where investigation_id=${id} order by created_at,clip_id`;
    const revisions = await q`select r.entry_id "entryId",r.revision,r.content,r.created_at::text "createdAt",u.name author
      from app.workspace_revisions r join app.workspace_entries e on e.id=r.entry_id
      left join auth.users u on u.id=r.actor_id where e.investigation_id=${id}
      order by r.created_at desc,r.id desc limit ${options?.allRevisions ? null : 200}`;
    return { access, entries: entries as unknown as WorkspaceEntry[], links: links as unknown as WorkspaceLink[], revisions: revisions as unknown as WorkspaceRevision[] };
}

export async function mutateWorkspace(userId: string, id: string, input: unknown, database?: DbSql) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new WorkspaceError("Datele trimise nu sunt valide.");
  const b = input as Record<string, unknown>;
  const result = await withInvestigationAccess(userId, id, "edit", async q => {
    if (b.action === "create" || b.action === "update") {
      const entry = parseEntry(b.entry);
      let entryId: string;
      if (b.action === "create") {
        const [row] = await q`insert into app.workspace_entries (investigation_id,kind,title,body,alternative,status,occurred_on,created_by,updated_by)
          values (${id},${entry.kind},${entry.title},${entry.body},${entry.alternative},${entry.status},${entry.occurredOn},${userId},${userId}) returning id`;
        entryId = String(row!.id);
      } else {
        if (!isWorkspaceId(b.entryId) || !Number.isSafeInteger(b.revision) || Number(b.revision) < 1) throw new WorkspaceError("Identificator sau revizie invalidă.");
        const [row] = await q`update app.workspace_entries set title=${entry.title},body=${entry.body},alternative=${entry.alternative},
          status=${entry.status},occurred_on=${entry.occurredOn},revision=revision+1,updated_by=${userId},updated_at=now()
          where id=${b.entryId} and investigation_id=${id} and kind=${entry.kind} and revision=${Number(b.revision)} and deleted_at is null returning id`;
        if (!row) throw new WorkspaceError("Această notă a fost modificată între timp. Păstrează textul și reîncarcă dosarul înainte de a salva.", 409);
        entryId = String(row.id);
      }
      await saveRevision(q, entryId, userId); await touch(q, id); return { id: entryId };
    }
    if (b.action === "archive") {
      if (!isWorkspaceId(b.entryId) || !Number.isSafeInteger(b.revision)) throw new WorkspaceError("Identificator sau revizie invalidă.");
      const [row] = await q`update app.workspace_entries set deleted_at=now(),updated_at=now(),updated_by=${userId},revision=revision+1
        where id=${b.entryId} and investigation_id=${id} and revision=${Number(b.revision)} and deleted_at is null returning id`;
      if (!row) throw new WorkspaceError("Înregistrarea a fost modificată. Reîncarcă dosarul.", 409);
      await saveRevision(q, String(row.id), userId); await touch(q, id); return { id: String(row.id) };
    }
    if (b.action === "link" || b.action === "unlink") {
      if (!isWorkspaceId(b.questionId) || !isWorkspaceId(b.clipId)) throw new WorkspaceError("Alege o întrebare și o dovadă din acest dosar.");
      const [valid] = await q`select e.id from app.workspace_entries e join app.clips c on c.investigation_id=e.investigation_id
        where e.id=${b.questionId} and c.id=${b.clipId} and e.investigation_id=${id} and e.kind='question' and e.deleted_at is null`;
      if (!valid) throw new WorkspaceError("Întrebarea și dovada trebuie să aparțină acestui dosar.");
      if (b.action === "unlink") await q`delete from app.question_evidence where investigation_id=${id} and question_id=${b.questionId} and clip_id=${b.clipId}`;
      else {
        if (!stances.includes(b.stance as EvidenceStance)) throw new WorkspaceError("Alege ce rol are dovada.");
        const note = workspaceText(b.note ?? "", 4000);
        await q`insert into app.question_evidence (investigation_id,question_id,clip_id,stance,note)
          values (${id},${b.questionId},${b.clipId},${String(b.stance)},${note}) on conflict (question_id,clip_id) do update set stance=excluded.stance,note=excluded.note`;
      }
      await touch(q, id); return { id: b.questionId };
    }
    throw new WorkspaceError("Acțiune necunoscută.");
  }, database);
  if (!result) throw new WorkspaceError("Dosarul nu este disponibil pentru editare.", 403);
  return result;
}

export function normalizeInviteEmail(value: unknown): string {
  const email = workspaceText(value, 254, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new WorkspaceError("Introdu o adresă de e-mail validă.");
  return email;
}
export const inviteTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const validToken = (token: string) => /^[a-f0-9]{64}$/.test(token);
export interface WorkspaceMembers { members: { id: string; name: string; email: string; role: "editor" | "viewer" }[]; invites: { id: string; email: string; role: "editor" | "viewer"; expiresAt: string }[] }
export async function getWorkspaceMembers(userId: string, id: string, database?: DbSql): Promise<WorkspaceMembers | null> {
  return withInvestigationAccess(userId, id, "manage", async q => {
    const members = await q`select m.id,u.name,u.email,m.role from app.investigation_members m join auth.users u on u.id=m.user_id
      where m.investigation_id=${id} order by u.name,m.id`;
    const invites = await q`select id,email,role,expires_at::text "expiresAt" from app.investigation_invites
      where investigation_id=${id} and accepted_at is null and revoked_at is null and expires_at>now() order by created_at desc`;
    return { members, invites } as unknown as WorkspaceMembers;
  }, database);
}
export async function createWorkspaceInvite(userId: string, id: string, emailInput: unknown, role: unknown, database?: DbSql) {
  const email = normalizeInviteEmail(emailInput);
  if (role !== "editor" && role !== "viewer") throw new WorkspaceError("Alege un nivel de acces valid.");
  const result = await withInvestigationAccess(userId, id, "manage", async q => {
    const [owner] = await q`select lower(email) email from auth.users where id=${userId}`;
    if (owner?.email === email) throw new WorkspaceError("Ai deja acces de proprietar.");
    const token = randomBytes(32).toString("hex");
    await q`update app.investigation_invites set revoked_at=now() where investigation_id=${id} and email=${email} and accepted_at is null and revoked_at is null`;
    const [invite] = await q`insert into app.investigation_invites (investigation_id,email,role,token_hash,created_by,expires_at)
      values (${id},${email},${role},${inviteTokenHash(token)},${userId},now()+interval '7 days') returning id,expires_at::text "expiresAt"`;
    await touch(q, id); return { id: String(invite!.id), token, expiresAt: String(invite!.expiresAt) };
  }, database);
  if (!result) throw new WorkspaceError("Doar proprietarul poate invita colaboratori.", 403);
  return result;
}
export async function changeWorkspaceMember(userId: string, id: string, memberId: string, role: "editor" | "viewer" | null, database?: DbSql) {
  if (!isWorkspaceId(memberId) || role !== null && role !== "editor" && role !== "viewer") throw new WorkspaceError("Membru sau rol invalid.");
  const result = await withInvestigationAccess(userId, id, "manage", async q => {
    const [member] = await q`select m.user_id,u.email from app.investigation_members m join auth.users u on u.id=m.user_id where m.id=${memberId} and m.investigation_id=${id}`;
    if (!member) throw new WorkspaceError("Membrul nu mai are acces.", 404);
    if (role) await q`update app.investigation_members set role=${role} where id=${memberId} and investigation_id=${id}`;
    else await q`delete from app.investigation_members where id=${memberId} and investigation_id=${id}`;
    // Outstanding invitations must not restore revoked or downgraded access.
    await q`update app.investigation_invites set revoked_at=now() where investigation_id=${id} and email=lower(${String(member.email)}) and accepted_at is null and revoked_at is null`;
    await touch(q, id); return true;
  }, database);
  if (!result) throw new WorkspaceError("Doar proprietarul poate modifica accesul.", 403);
}
export async function revokeWorkspaceInvite(userId: string, id: string, inviteId: string, database?: DbSql) {
  if (!isWorkspaceId(inviteId)) throw new WorkspaceError("Invitație invalidă.");
  const result = await withInvestigationAccess(userId, id, "manage", async q => {
    await q`update app.investigation_invites set revoked_at=now() where id=${inviteId} and investigation_id=${id}`;
    await touch(q, id); return true;
  }, database);
  if (!result) throw new WorkspaceError("Doar proprietarul poate revoca invitația.", 403);
}

export async function readWorkspaceInvite(userId: string, token: string, sql: DbSql = workspaceDatabase()) {
  if (!validToken(token)) return null;
  const [invite] = await sql`select v.id,v.investigation_id "investigationId",i.title,v.role,v.expires_at::text "expiresAt"
    from app.investigation_invites v join app.investigations i on i.id=v.investigation_id
    join auth.users u on lower(u.email)=v.email and u.id=${userId} and u.email_verified=true
    where v.token_hash=${inviteTokenHash(token)} and v.revoked_at is null and v.accepted_at is null and v.expires_at>now()`;
  return invite ? { id: String(invite.id), investigationId: String(invite.investigationId), title: String(invite.title), role: String(invite.role), expiresAt: String(invite.expiresAt) } : null;
}
export async function acceptWorkspaceInvite(userId: string, token: string, sql: DbSql = workspaceDatabase()) {
  if (!validToken(token)) throw new WorkspaceError("Invitația nu este disponibilă pentru acest cont.", 404);
  return sql.begin("isolation level repeatable read", async transaction => {
    const q = transaction as unknown as DbSql;
    const info = await readWorkspaceInvite(userId, token, q);
    if (!info) throw new WorkspaceError("Invitația a expirat, a fost revocată sau aparține altui cont.", 404);
    const [parent] = await q`select owner_user_id from app.investigations where id=${info.investigationId} for update`;
    if (!parent || parent.owner_user_id === userId) throw new WorkspaceError("Ai deja acces de proprietar.");
    const current = await readWorkspaceInvite(userId, token, q);
    if (!current) throw new WorkspaceError("Invitația nu mai este disponibilă.", 404);
    await q`insert into app.investigation_members (investigation_id,user_id,role) values (${info.investigationId},${userId},${info.role})
      on conflict (investigation_id,user_id) do nothing`;
    await q`update app.investigation_invites set accepted_at=now() where id=${info.id}`;
    await touch(q, info.investigationId); return { id: info.investigationId };
  });
}
