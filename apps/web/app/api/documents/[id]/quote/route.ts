import {sessionUserId} from '@/lib/session';
import {workspaceBody,workspaceResponse} from '@/lib/workspace-api';
import {WorkspaceError} from '@/lib/investigation-workspace';
import {saveDocumentQuote} from '@/lib/documents/store';
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){return workspaceResponse(async()=>{const uid=await sessionUserId();if(!uid)throw new WorkspaceError('Autentifică-te pentru a salva un pasaj.',401);return saveDocumentQuote(uid,(await ctx.params).id,await workspaceBody(req));});}
