import {NextResponse} from 'next/server';
import {getContractFiles,enqueueDocument} from '@/lib/documents/store';
import {sessionUserId} from '@/lib/session';
import {workspaceBody,workspaceResponse} from '@/lib/workspace-api';
import {WorkspaceError} from '@/lib/investigation-workspace';
export const dynamic='force-dynamic';
export async function GET(_req:Request,ctx:{params:Promise<{nid:string}>}){const {nid}=await ctx.params;return NextResponse.json(await getContractFiles(nid),{headers:{'Cache-Control':'no-store'}});}
// Only an account may queue a list or a file (owner, 12 November 2026; launch audit M1): anonymous requests could fill
// the queue and spend the shared SEAP budget, the proxies and the disk. Reading prepared files stays public (GET).
export async function POST(req:Request,ctx:{params:Promise<{nid:string}>}){return workspaceResponse(async()=>{
 const actor=await sessionUserId();
 if(!actor)throw new WorkspaceError('Intră în cont ca să ceri documentele.',401);
 const body=await workspaceBody(req);
 if(body.documentId!==null&&typeof body.documentId!=='string')throw new WorkspaceError('Fișier invalid.');
 if(body.source!==undefined&&body.source!=='notice'&&body.source!=='award')throw new WorkspaceError('Sursă invalidă.');
 return enqueueDocument((await ctx.params).nid,actor,body.documentId as string|null,undefined,body.source==='award'?'award':'notice');
});}
