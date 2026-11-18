import {NextResponse} from 'next/server';
import {auth} from '@/lib/auth';
import {validCollectionOrigin} from '@/lib/admin/collection-origin';
import {isWorkspaceId} from '@/lib/investigation-access';
import {decideWithheld,withheldDocuments} from '@/lib/documents/privacy-hold-admin';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
async function admin(req:Request){const s=await auth.api.getSession({headers:req.headers});return s&&(s.user as {role?:string}).role==='admin'?s.user:null;}
/** The documents the personal-data check keeps from readers (migration 0112): those waiting for a decision, then those kept hidden. */
export async function GET(req:Request){
 if(!await admin(req))return NextResponse.json({error:'Acces rezervat administratorilor.'},{status:403,headers});
 try{return NextResponse.json(await withheldDocuments(),{headers});}
 catch{return NextResponse.json({error:'Documentele oprite nu pot fi citite acum.'},{status:503,headers});}
}
/** { id, decision: "release" | "keep" }: publish the document (a false alarm) or keep it hidden. */
export async function POST(req:Request){
 const user=await admin(req);if(!user)return NextResponse.json({error:'Acces rezervat administratorilor.'},{status:403,headers});
 if(!validCollectionOrigin(req,process.env.NODE_ENV==='production'?process.env.BETTER_AUTH_URL:undefined))return NextResponse.json({error:'Origine neacceptată.'},{status:403,headers});
 if(!req.headers.get('content-type')?.startsWith('application/json'))return NextResponse.json({error:'Format neacceptat.'},{status:415,headers});
 const text=await req.text();if(text.length>1024)return NextResponse.json({error:'Cerere prea mare.'},{status:413,headers});
 let body:Record<string,unknown>;try{body=JSON.parse(text);if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{return NextResponse.json({error:'Cerere invalidă.'},{status:400,headers});}
 const {id,decision}=body;
 if(!isWorkspaceId(id)||(decision!=='release'&&decision!=='keep'))return NextResponse.json({error:'Cerere invalidă.'},{status:400,headers});
 try{
  if(!await decideWithheld(id,decision,user.name||user.email))return NextResponse.json({error:'Documentul nu mai este în listă. Actualizează.'},{status:409,headers});
  return NextResponse.json({ok:true},{headers});
 }catch{return NextResponse.json({error:'Decizia nu a fost salvată. Reîncearcă.'},{status:503,headers});}
}
