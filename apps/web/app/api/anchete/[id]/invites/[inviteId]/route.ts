import { sessionUserId } from "@/lib/session";
import { revokeWorkspaceInvite, WorkspaceError } from "@/lib/investigation-workspace";
import { workspaceOrigin, workspaceResponse } from "@/lib/workspace-api";
export async function DELETE(req: Request, context: { params: Promise<{ id: string; inviteId: string }> }) {
  return workspaceResponse(async () => {
    workspaceOrigin(req); const user = await sessionUserId(); if (!user) throw new WorkspaceError("Autentificare necesară.", 401);
    const { id, inviteId } = await context.params; await revokeWorkspaceInvite(user, id, inviteId); return { ok: true };
  });
}
