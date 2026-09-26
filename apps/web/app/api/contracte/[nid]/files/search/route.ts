import {NextResponse} from 'next/server';
import {contractNotice,documentDb} from '@/lib/documents/store';
import {isWorkspaceId} from '@/lib/investigation-access';
export const dynamic='force-dynamic';
export async function GET(req:Request,ctx:{params:Promise<{nid:string}>}){
 const u=new URL(req.url),query=(u.searchParams.get('q')??'').trim(),id=u.searchParams.get('documentId');
 if(query.length<2||query.length>150||(id&&!isWorkspaceId(id)))return NextResponse.json({error:'Scrie între 2 și 150 de caractere.'},{status:400});
 const n=await contractNotice((await ctx.params).nid);if(!n)return NextResponse.json({error:'Sursa documentelor nu este identificată.'},{status:404});
 const q=documentDb();
 const rows=await q`select d.id,d.filename,p.page,substring(p.text from greatest(1,strpos(lower(unaccent(p.text)),lower(unaccent(${query})))-120) for 600) text,p.method from app.procurement_documents d join app.document_pages p on p.document_id=d.id where d.notice_key=${n.key} and d.processed_at is not null and (${id}::uuid is null or d.id=${id}::uuid) and strpos(lower(unaccent(p.text)),lower(unaccent(${query})))>0 order by d.filename,p.page limit 101`;
 return NextResponse.json({hits:rows.slice(0,100),truncated:rows.length>100},{headers:{'Cache-Control':'no-store'}});
}
