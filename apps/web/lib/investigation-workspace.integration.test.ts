import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "@seap/db";
import { getInvestigationAccess, withInvestigationAccess } from "./investigation-access";
import { acceptWorkspaceInvite, changeWorkspaceMember, createWorkspaceInvite, getInvestigationWorkspace, getWorkspaceMembers, mutateWorkspace, readInvestigationWorkspace, readWorkspaceInvite, revokeWorkspaceInvite } from "./investigation-workspace";

const testUrl = process.env["TEST_DATABASE_URL"];
if (testUrl && !/^seap_test_[a-z0-9_]+$/.test(new URL(testUrl).pathname.slice(1))) throw new Error("Workspace fixtures require a dedicated seap_test_* database");
const connection = testUrl ? createDb(testUrl) : null;
afterAll(async () => { await connection?.sql.end(); });
let serial = 0;
async function fixture(run: (f: { owner: string; editor: string; viewer: string; outsider: string; unverified: string; id: string; otherId: string; clipId: string; otherClipId: string }) => Promise<void>) {
  const sql = connection!.sql;
  const seed = `workspace_test_${process.pid}_${Date.now()}_${++serial}`;
  const users = ["owner", "editor", "viewer", "outsider", "unverified"].map(role => `${seed}_${role}`);
  const [owner, editor, viewer, outsider, unverified] = users as [string,string,string,string,string];
  await sql`insert into auth.users ${sql(users.map(id => ({ id, name: "Workspace fixture", email: `${id}@example.test`, email_verified: id !== unverified })))}`;
  try {
    const [inv] = await sql`insert into app.investigations (owner_user_id,title) values (${owner},'Synthetic private dossier') returning id`;
    const [other] = await sql`insert into app.investigations (owner_user_id,title) values (${outsider},'Other private dossier') returning id`;
    const id = String(inv!.id), otherId = String(other!.id);
    const [clip] = await sql`insert into app.clips (investigation_id,kind,created_by,note) values (${id},'note',${owner},'Synthetic evidence') returning id`;
    const [otherClip] = await sql`insert into app.clips (investigation_id,kind,created_by,note) values (${otherId},'note',${outsider},'Other evidence') returning id`;
    await run({ owner, editor, viewer, outsider, unverified, id, otherId, clipId: String(clip!.id), otherClipId: String(otherClip!.id) });
  } finally { await sql`delete from auth.users where id in ${sql(users)}`; }
}
const entry = (title = "What explains the repeated awards?") => ({ kind: "question", title, body: "Check the contracts", alternative: "A specialist market", status: "open", occurredOn: null });

describe.runIf(Boolean(connection))("private investigation workspace", () => {
  it("binds one-use invitations to a verified intended email and authentic membership", async () => fixture(async f => {
    const sql = connection!.sql;
    const invite = await createWorkspaceInvite(f.owner,f.id,`${f.editor.toUpperCase()}@EXAMPLE.TEST`,"editor",sql);
    expect(await getInvestigationWorkspace(f.editor,f.id,sql)).toBeNull();
    expect(await readWorkspaceInvite(f.outsider,invite.token,sql)).toBeNull();
    await expect(acceptWorkspaceInvite(f.outsider,invite.token,sql)).rejects.toMatchObject({ status: 404 });
    expect(await getInvestigationAccess(f.outsider,f.id,sql)).toBeNull();
    expect(await acceptWorkspaceInvite(f.editor,invite.token,sql)).toEqual({ id: f.id });
    expect(await getInvestigationAccess(f.editor,f.id,sql)).toEqual({ role: "editor", canEdit: true, canManage: false });
    await expect(acceptWorkspaceInvite(f.editor,invite.token,sql)).rejects.toMatchObject({ status: 404 });
    const unverified = await createWorkspaceInvite(f.owner,f.id,`${f.unverified}@example.test`,"viewer",sql);
    expect(await readWorkspaceInvite(f.unverified,unverified.token,sql)).toBeNull();
    await expect(acceptWorkspaceInvite(f.unverified,unverified.token,sql)).rejects.toMatchObject({ status: 404 });
    expect(await getInvestigationAccess(f.unverified,f.id,sql)).toBeNull();
  }));

  it("rejects expired, revoked and superseded invitations without granting access", async () => fixture(async f => {
    const sql = connection!.sql;
    const expired = await createWorkspaceInvite(f.owner,f.id,`${f.editor}@example.test`,"editor",sql);
    await sql`update app.investigation_invites set expires_at=now()-interval '1 second' where id=${expired.id}`;
    await expect(acceptWorkspaceInvite(f.editor,expired.token,sql)).rejects.toMatchObject({ status: 404 });
    const revoked = await createWorkspaceInvite(f.owner,f.id,`${f.editor}@example.test`,"editor",sql);
    await revokeWorkspaceInvite(f.owner,f.id,revoked.id,sql);
    await expect(acceptWorkspaceInvite(f.editor,revoked.token,sql)).rejects.toMatchObject({ status: 404 });
    const old = await createWorkspaceInvite(f.owner,f.id,`${f.editor}@example.test`,"editor",sql);
    const current = await createWorkspaceInvite(f.owner,f.id,`${f.editor}@example.test`,"viewer",sql);
    await expect(acceptWorkspaceInvite(f.editor,old.token,sql)).rejects.toMatchObject({ status: 404 });
    await acceptWorkspaceInvite(f.editor,current.token,sql);
    expect((await getInvestigationAccess(f.editor,f.id,sql))?.role).toBe("viewer");
  }));

  it("enforces read-only reviewers, owner-only sharing, and revocation including pending invitations", async () => fixture(async f => {
    const sql = connection!.sql;
    for (const [user,role] of [[f.editor,"editor"],[f.viewer,"viewer"]] as const) {
      const invite = await createWorkspaceInvite(f.owner,f.id,`${user}@example.test`,role,sql); await acceptWorkspaceInvite(user,invite.token,sql);
    }
    expect((await getInvestigationWorkspace(f.viewer,f.id,sql))?.access.canEdit).toBe(false);
    await expect(mutateWorkspace(f.viewer,f.id,{ action:"create",entry:entry() },sql)).rejects.toMatchObject({ status:403 });
    await expect(createWorkspaceInvite(f.editor,f.id,`${f.outsider}@example.test`,"editor",sql)).rejects.toMatchObject({ status:403 });
    expect(await getWorkspaceMembers(f.editor,f.id,sql)).toBeNull();
    const members = await getWorkspaceMembers(f.owner,f.id,sql), member = members!.members.find(m => m.email === `${f.editor}@example.test`)!;
    const pending = await createWorkspaceInvite(f.owner,f.id,`${f.editor}@example.test`,"editor",sql);
    await changeWorkspaceMember(f.owner,f.id,member.id,null,sql);
    expect(await getInvestigationWorkspace(f.editor,f.id,sql)).toBeNull();
    await expect(mutateWorkspace(f.editor,f.id,{ action:"create",entry:entry() },sql)).rejects.toMatchObject({ status:403 });
    await expect(acceptWorkspaceInvite(f.editor,pending.token,sql)).rejects.toMatchObject({ status:404 });
    expect(await getInvestigationAccess(f.owner,f.id,sql)).toMatchObject({ role:"owner" });
  }));

  it("keeps cross-case evidence and edits out, preserving revisions and optimistic conflicts", async () => fixture(async f => {
    const sql = connection!.sql;
    const created = await mutateWorkspace(f.owner,f.id,{ action:"create",entry:entry() },sql);
    await expect(mutateWorkspace(f.owner,f.id,{ action:"link",questionId:created.id,clipId:f.otherClipId,stance:"supports" },sql)).rejects.toThrow("acestui dosar");
    await expect(mutateWorkspace(f.outsider,f.otherId,{ action:"link",questionId:created.id,clipId:f.otherClipId,stance:"supports" },sql)).rejects.toThrow("acestui dosar");
    await mutateWorkspace(f.owner,f.id,{ action:"link",questionId:created.id,clipId:f.clipId,stance:"contradicts",note:"An alternative explanation" },sql);
    await mutateWorkspace(f.owner,f.id,{ action:"update",entryId:created.id,revision:1,entry:entry("Revised question") },sql);
    await expect(mutateWorkspace(f.owner,f.id,{ action:"update",entryId:created.id,revision:1,entry:entry("Stale overwrite") },sql)).rejects.toMatchObject({ status:409 });
    const current = await getInvestigationWorkspace(f.owner,f.id,sql);
    expect(current!.entries[0]).toMatchObject({ title:"Revised question",revision:2,alternative:"A specialist market" });
    expect(current!.links).toEqual([{ questionId:created.id,clipId:f.clipId,stance:"contradicts",note:"An alternative explanation" }]);
    expect(current!.revisions.map(r => r.revision)).toEqual([2,1]);
    await mutateWorkspace(f.owner,f.id,{ action:"archive",entryId:created.id,revision:2 },sql);
    const archived = await getInvestigationWorkspace(f.owner,f.id,sql);
    expect(archived!.entries).toHaveLength(0);
    expect(archived!.revisions[0]?.content).toMatchObject({ title:"Revised question",deleted:true });
  }));

  it("exports full revision history while the UI limits its disclosed recent-history view", async () => fixture(async f => {
    const sql = connection!.sql;
    const created = await mutateWorkspace(f.owner,f.id,{ action:"create",entry:entry() },sql);
    await sql`insert into app.workspace_revisions (entry_id,revision,content,actor_id) select ${created.id},n,jsonb_build_object('title','Synthetic revision','body','Preserved'),${f.owner} from generate_series(2,205) n`;
    expect((await getInvestigationWorkspace(f.owner,f.id,sql))!.revisions).toHaveLength(200);
    const bundle = await withInvestigationAccess(f.owner,f.id,"read",(q,access) => readInvestigationWorkspace(q,f.id,access,{ allRevisions:true }),sql);
    expect(bundle!.revisions).toHaveLength(205);
    expect(bundle!.revisions.some(r => r.revision === 1)).toBe(true);
  }));
});
