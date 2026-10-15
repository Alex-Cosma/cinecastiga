import {NextResponse} from 'next/server';
import {auth} from '@/lib/auth';
import {validCollectionOrigin} from '@/lib/admin/collection-origin';
import {CollectionConflict} from '@/lib/admin/collection';
import {documentCollectionStatus,changeDocumentCollection} from '@/lib/admin/document-collection';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
async function admin(req:Request){const s=await auth.api.getSession({headers:req.headers});return s&&(s.user as {role?:string}).role==='admin'?s.user:null;}
export async function GET(req:Request){
 if(!await admin(req))return NextResponse.json({error:'Acces rezervat administratorilor.'},{status:403,headers});
 try{return NextResponse.json(await documentCollectionStatus(),{headers});}
 catch{return NextResponse.json({error:'Statusul fișierelor nu poate fi citit acum.'},{status:503,headers});}
}
export async function POST(req:Request){
 const user=await admin(req);if(!user)return NextResponse.json({error:'Acces rezervat administratorilor.'},{status:403,headers});
 if(!validCollectionOrigin(req,process.env.NODE_ENV==='production'?process.env.BETTER_AUTH_URL:undefined))return NextResponse.json({error:'Origine neacceptată.'},{status:403,headers});
 if(!req.headers.get('content-type')?.startsWith('application/json'))return NextResponse.json({error:'Format neacceptat.'},{status:415,headers});
 const text=await req.text();if(text.length>4096)return NextResponse.json({error:'Cerere prea mare.'},{status:413,headers});
 let body:Record<string,unknown>;try{body=JSON.parse(text);if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{return NextResponse.json({error:'Cerere invalidă.'},{status:400,headers});}
 try{return NextResponse.json({revision:(await changeDocumentCollection({id:user.id,name:user.name||user.email},body)).revision},{headers});}
 catch(e){const known=e instanceof Error&&/^(Statusul|Activează|Acțiune)/.test(e.message);return NextResponse.json({error:known?e.message:'Comanda nu a fost salvată. Actualizează și reîncearcă.'},{status:e instanceof CollectionConflict?409:400,headers});}
}
