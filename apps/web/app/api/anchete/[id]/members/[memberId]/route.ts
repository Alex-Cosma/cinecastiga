import { sessionUserId } from "@/lib/session";
import { changeWorkspaceMember, WorkspaceError } from "@/lib/investigation-workspace";
import { workspaceBody, workspaceOrigin, workspaceResponse } from "@/lib/workspace-api";
type Context = { params: Promise<{ id: string; memberId: string }> };
export async function PATCH(req: Request, context: Context) {
  return workspaceResponse(async () => {
    const user = await sessionUserId(); if (!user) throw new WorkspaceError("Autentificare necesară.", 401);
    const body = await workspaceBody(req); if (body.role !== "editor" && body.role !== "viewer") throw new WorkspaceError("Rol invalid.");
    const { id, memberId } = await context.params; await changeWorkspaceMember(user, id, memberId, body.role); return { ok: true };
  });
}
export async function DELETE(req: Request, context: Context) {
  return workspaceResponse(async () => {
    workspaceOrigin(req); const user = await sessionUserId(); if (!user) throw new WorkspaceError("Autentificare necesară.", 401);
    const { id, memberId } = await context.params; await changeWorkspaceMember(user, id, memberId, null); return { ok: true };
  });
}
