import { sessionUserId } from "@/lib/session";
import { getInvestigationWorkspace, mutateWorkspace, WorkspaceError } from "@/lib/investigation-workspace";
import { workspaceBody, workspaceResponse } from "@/lib/workspace-api";
type Context = { params: Promise<{ id: string }> };
export async function GET(_req: Request, context: Context) {
  return workspaceResponse(async () => {
    const user = await sessionUserId(); if (!user) throw new WorkspaceError("Autentifică-te pentru a deschide dosarul.", 401);
    const { id } = await context.params; const result = await getInvestigationWorkspace(user, id);
    if (!result) throw new WorkspaceError("Dosarul nu este disponibil.", 404); return result;
  });
}
export async function POST(req: Request, context: Context) {
  return workspaceResponse(async () => {
    const user = await sessionUserId(); if (!user) throw new WorkspaceError("Autentifică-te pentru a edita dosarul.", 401);
    const body = await workspaceBody(req); const { id } = await context.params;
    return mutateWorkspace(user, id, body);
  });
}
