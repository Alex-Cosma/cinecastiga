import {documentQueueStatus,DOCUMENT_QUEUE_FILTERS,type DocumentQueueFilter} from '@/lib/admin/document-queue';
import {validCollectionOrigin} from '@/lib/admin/collection-origin';
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
  const params=new URL(req.url).searchParams;
  if(params.get('documentQueue')==='1'){
   const filter=params.get('filter')??'download',pageText=params.get('page')??'1';
   if(!DOCUMENT_QUEUE_FILTERS.includes(filter as DocumentQueueFilter)||!/^([1-9]\d{0,4}|100000)$/.test(pageText))return NextResponse.json({error:'Filtru de coadă nevalid.'},{status:400,headers});
   return NextResponse.json(await documentQueueStatus(filter as DocumentQueueFilter,Number(pageText)),{headers});
  }
  const requestId=new URL(req.url).searchParams.get('request');
  if(requestId!==null){
   if(!/^[1-9]\d{0,17}$/.test(requestId))return NextResponse.json({error:'Identificator nevalid.'},{status:400,headers});
   const [request]=await collectionDb()`select id::text,stream,worker,method,endpoint,parameters,status,outcome,error,records,bytes::text,started_at,finished_at,diagnostics from app.collection_requests where id=${requestId}::bigint`;
   if(!request)return NextResponse.json({error:'Cererea nu a fost găsită.'},{status:404,headers});
   return NextResponse.json({request,diagnosticsAvailable:request.diagnostics!==null},{headers:{...headers,'Content-Disposition':`attachment; filename="cerere-seap-${requestId}.json"`}});
  }
  if(new URL(req.url).searchParams.get('export')==='1'){
   const rows=await collectionDb()`select id::text,stream,method,endpoint,parameters,status,outcome,error,records,bytes::text,started_at,finished_at from app.collection_requests order by app.collection_requests.id desc limit 5000`;
   return NextResponse.json({scope:'Ultimele maximum 5.000 de încercări SEAP',exportedAt:new Date().toISOString(),requests:rows},{headers:{...headers,'Content-Disposition':'attachment; filename="jurnal-colectare.json"'}});
  }
  return NextResponse.json(await collectionStatus(),{headers});
 }catch{return NextResponse.json({error:'Statusul colectării nu poate fi citit acum. Valorile anterioare pot fi neactualizate.'},{status:503,headers});}
}
export async function POST(req:Request){
 const user=await admin(req);if(!user)return NextResponse.json({error:'Acces rezervat administratorilor.'},{status:403,headers});
 if(!validCollectionOrigin(req,process.env.NODE_ENV==='production'?process.env.BETTER_AUTH_URL:undefined))return NextResponse.json({error:'Origine neacceptată.'},{status:403,headers});
 if(!req.headers.get('content-type')?.startsWith('application/json'))return NextResponse.json({error:'Format neacceptat.'},{status:415,headers});
 const text=await req.text();if(text.length>4096)return NextResponse.json({error:'Cerere prea mare.'},{status:413,headers});
 let body:Record<string,unknown>;try{body=JSON.parse(text);if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{return NextResponse.json({error:'Cerere invalidă.'},{status:400,headers});}
 try{const control=await changeCollection({id:user.id,name:user.name||user.email},body);return NextResponse.json({ok:true,revision:control!.revision},{headers});}
 catch(e){if(e instanceof CollectionConflict)return NextResponse.json({error:e.message},{status:409,headers});
 const message=e instanceof Error&&/^(Intervalul|Versiunea|Limita|Ora|Stare|Flux|Confirmă|Acțiune)/.test(e.message)?e.message:'Modificarea nu a fost salvată. Reîncearcă după actualizarea statusului.';
 return NextResponse.json({error:message},{status:400,headers});}
}
