import { sessionUserId } from "@/lib/session";
import { acceptWorkspaceInvite, readWorkspaceInvite, WorkspaceError } from "@/lib/investigation-workspace";
import { workspaceBody, workspaceResponse } from "@/lib/workspace-api";
type Context = { params: Promise<{ token: string }> };
export async function GET(_req: Request, context: Context) {
  return workspaceResponse(async () => {
    const user = await sessionUserId(); if (!user) throw new WorkspaceError("Autentificare necesară.", 401);
    const { token } = await context.params; const invite = await readWorkspaceInvite(user, token);
    if (!invite) throw new WorkspaceError("Invitația nu este disponibilă pentru acest cont.", 404); return invite;
  });
}
export async function POST(req: Request, context: Context) {
  return workspaceResponse(async () => {
    const user = await sessionUserId(); if (!user) throw new WorkspaceError("Autentificare necesară.", 401);
    await workspaceBody(req); const { token } = await context.params; return acceptWorkspaceInvite(user, token);
  });
}
