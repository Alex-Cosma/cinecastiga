import { sessionUserId } from "@/lib/session";
import { createWorkspaceInvite, getWorkspaceMembers, WorkspaceError } from "@/lib/investigation-workspace";
import { workspaceBody, workspaceResponse } from "@/lib/workspace-api";
type Context = { params: Promise<{ id: string }> };
export async function GET(_req: Request, context: Context) {
  return workspaceResponse(async () => {
    const user = await sessionUserId(); if (!user) throw new WorkspaceError("Autentificare necesară.", 401);
    const { id } = await context.params; const result = await getWorkspaceMembers(user, id);
    if (!result) throw new WorkspaceError("Doar proprietarul poate administra accesul.", 403); return result;
  });
}
export async function POST(req: Request, context: Context) {
  return workspaceResponse(async () => {
    const user = await sessionUserId(); if (!user) throw new WorkspaceError("Autentificare necesară.", 401);
    const body = await workspaceBody(req); const { id } = await context.params;
    const invite = await createWorkspaceInvite(user, id, body.email, body.role);
    return { id: invite.id, path: `/anchete/invitatie/${invite.token}`, expiresAt: invite.expiresAt };
  });
}
