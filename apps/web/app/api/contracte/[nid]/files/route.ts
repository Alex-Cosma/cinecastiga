import {NextResponse} from 'next/server';
import {getContractFiles,enqueueDocument} from '@/lib/documents/store';
import {documentVisitorKey} from '@/lib/documents/visitor';
import {sessionUserId} from '@/lib/session';
import {workspaceBody,workspaceResponse} from '@/lib/workspace-api';
import {WorkspaceError} from '@/lib/investigation-workspace';
export const dynamic='force-dynamic';
export async function GET(_req:Request,ctx:{params:Promise<{nid:string}>}){const {nid}=await ctx.params;return NextResponse.json(await getContractFiles(nid),{headers:{'Cache-Control':'no-store'}});}
// Anyone may queue a list or a file; a visitor without an account is counted by a hashed hourly key.
export async function POST(req:Request,ctx:{params:Promise<{nid:string}>}){return workspaceResponse(async()=>{
 const body=await workspaceBody(req);
 if(body.documentId!==null&&typeof body.documentId!=='string')throw new WorkspaceError('Fișier invalid.');
 if(body.source!==undefined&&body.source!=='notice'&&body.source!=='award')throw new WorkspaceError('Sursă invalidă.');
 const secret=process.env.BETTER_AUTH_SECRET;
 const actor=await sessionUserId()??(secret?documentVisitorKey(req,secret,process.env.NODE_ENV==='production'):null);
 if(!actor)throw new WorkspaceError('Preluarea fișierelor nu este disponibilă acum.',503);
 return enqueueDocument((await ctx.params).nid,actor,body.documentId as string|null,undefined,body.source==='award'?'award':'notice');
});}
