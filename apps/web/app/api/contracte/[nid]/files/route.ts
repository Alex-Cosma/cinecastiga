import {NextResponse} from 'next/server';
import {getContractFiles,enqueueDocument} from '@/lib/documents/store';
import {sessionUserId} from '@/lib/session';
import {workspaceBody,workspaceResponse} from '@/lib/workspace-api';
import {WorkspaceError} from '@/lib/investigation-workspace';
export const dynamic='force-dynamic';
export async function GET(_req:Request,ctx:{params:Promise<{nid:string}>}){const {nid}=await ctx.params;return NextResponse.json(await getContractFiles(nid),{headers:{'Cache-Control':'no-store'}});}
export async function POST(req:Request,ctx:{params:Promise<{nid:string}>}){return workspaceResponse(async()=>{const uid=await sessionUserId();if(!uid)throw new WorkspaceError('Autentifică-te pentru a pregăti documente.',401);const body=await workspaceBody(req);if(body.documentId!==null&&typeof body.documentId!=='string')throw new WorkspaceError('Fișier invalid.');return enqueueDocument((await ctx.params).nid,uid,body.documentId as string|null);});}
