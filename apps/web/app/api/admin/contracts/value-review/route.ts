import {NextResponse} from 'next/server';
import {auth} from '@/lib/auth';
import {validCollectionOrigin} from '@/lib/admin/collection-origin';
import {contractValueReviewList,decideContractValue,VALUE_REASON_MAX} from '@/lib/contract-value-admin';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
async function admin(req:Request){const s=await auth.api.getSession({headers:req.headers});return s&&(s.user as {role?:string}).role==='admin'?s.user:null;}
/** The contracts the last processing run reviewed (above 1 mld. lei, or taken out by an administrator), with the administrators' decisions (migrations 0113, 0116). */
export async function GET(req:Request){
 if(!await admin(req))return NextResponse.json({error:'Acces rezervat administratorilor.'},{status:403,headers});
 try{return NextResponse.json(await contractValueReviewList(),{headers});}
 catch{return NextResponse.json({error:'Lista contractelor nu poate fi citită acum.'},{status:503,headers});}
}
/** { natId, decision: "include" | "exclude" | "clear", reason }: count the contract, keep it out, or return it to the automatic rule. */
export async function POST(req:Request){
 const user=await admin(req);if(!user)return NextResponse.json({error:'Acces rezervat administratorilor.'},{status:403,headers});
 if(!validCollectionOrigin(req,process.env.NODE_ENV==='production'?process.env.BETTER_AUTH_URL:undefined))return NextResponse.json({error:'Origine neacceptată.'},{status:403,headers});
 if(!req.headers.get('content-type')?.startsWith('application/json'))return NextResponse.json({error:'Format neacceptat.'},{status:415,headers});
 const text=await req.text();if(text.length>2048)return NextResponse.json({error:'Cerere prea mare.'},{status:413,headers});
 let body:Record<string,unknown>;try{body=JSON.parse(text);if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{return NextResponse.json({error:'Cerere invalidă.'},{status:400,headers});}
 const {natId,decision,reason}=body;
 if(typeof natId!=='string'||!/^\d{1,18}$/.test(natId)||(decision!=='include'&&decision!=='exclude'&&decision!=='clear'))return NextResponse.json({error:'Cerere invalidă.'},{status:400,headers});
 const why=typeof reason==='string'?reason.trim():'';
 if(decision!=='clear'&&(!why||why.length>VALUE_REASON_MAX))return NextResponse.json({error:`Scrie motivul, în cel mult ${VALUE_REASON_MAX} de caractere.`},{status:400,headers});
 try{
  if(!await decideContractValue(natId,decision,why,user.name||user.email))return NextResponse.json({error:decision==='exclude'?'Nu există un contract cu acest număr.':'Contractul nu mai este în listă. Actualizează.'},{status:409,headers});
  return NextResponse.json({ok:true},{headers});
 }catch{return NextResponse.json({error:'Decizia nu a fost salvată. Reîncearcă.'},{status:503,headers});}
}
