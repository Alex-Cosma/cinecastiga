import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { changeCollection,collectionDb,collectionStatus,CollectionConflict } from '@/lib/admin/collection';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
async function admin(req:Request){const s=await auth.api.getSession({headers:req.headers});return s&&(s.user as {role?:string}).role==='admin'?s.user:null;}
export async function GET(req:Request){
 if(!await admin(req))return NextResponse.json({error:'Acces rezervat administratorilor.'},{status:403,headers});
 try{
  if(new URL(req.url).searchParams.get('export')==='1'){
   const rows=await collectionDb()`select id::text,stream,method,endpoint,parameters,status,outcome,error,records,bytes::text,started_at,finished_at from app.collection_requests order by id desc limit 5000`;
   return NextResponse.json({scope:'Ultimele maximum 5.000 de încercări SEAP',exportedAt:new Date().toISOString(),requests:rows},{headers:{...headers,'Content-Disposition':'attachment; filename="jurnal-colectare.json"'}});
  }
  return NextResponse.json(await collectionStatus(),{headers});
 }catch{return NextResponse.json({error:'Statusul colectării nu poate fi citit acum. Valorile anterioare pot fi neactualizate.'},{status:503,headers});}
}
export async function POST(req:Request){
 const user=await admin(req);if(!user)return NextResponse.json({error:'Acces rezervat administratorilor.'},{status:403,headers});
 const origin=req.headers.get('origin');
 if(!origin||origin!==new URL(req.url).origin||req.headers.get('sec-fetch-site')==='cross-site')return NextResponse.json({error:'Origine neacceptată.'},{status:403,headers});
 if(!req.headers.get('content-type')?.startsWith('application/json'))return NextResponse.json({error:'Format neacceptat.'},{status:415,headers});
 const text=await req.text();if(text.length>4096)return NextResponse.json({error:'Cerere prea mare.'},{status:413,headers});
 let body:Record<string,unknown>;try{body=JSON.parse(text);if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{return NextResponse.json({error:'Cerere invalidă.'},{status:400,headers});}
 try{const control=await changeCollection({id:user.id,name:user.name||user.email},body);return NextResponse.json({ok:true,revision:control!.revision},{headers});}
 catch(e){if(e instanceof CollectionConflict)return NextResponse.json({error:e.message},{status:409,headers});
 const message=e instanceof Error&&/^(Intervalul|Versiunea|Limita|Ora|Stare|Flux|Confirmă|Acțiune)/.test(e.message)?e.message:'Modificarea nu a fost salvată. Reîncearcă după actualizarea statusului.';
 return NextResponse.json({error:message},{status:400,headers});}
}
