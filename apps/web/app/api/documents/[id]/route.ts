import {NextResponse} from 'next/server';
import {documentDb,documentRecord} from '@/lib/documents/store';
import {isWithheld,WITHHELD_NOTE} from '@/lib/documents/privacy-hold';
import {mayReadWithheld} from '@/lib/documents/privacy-hold-server';
export const dynamic='force-dynamic';
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){
 const {id}=await ctx.params;const doc=await documentRecord(id);if(!doc?.processed_at)return NextResponse.json({error:'Document inexistent.'},{status:404});
 if(isWithheld(doc.privacy_hold)&&!await mayReadWithheld(req))return NextResponse.json({error:WITHHELD_NOTE,sourceUrl:doc.url},{status:403,headers:{'Cache-Control':'no-store'}});
 const page=Number(new URL(req.url).searchParams.get('page')??1);if(!Number.isInteger(page)||page<1||page>(doc.page_count??0))return NextResponse.json({error:'Pagină invalidă.'},{status:400});
 const [p]=await documentDb()`select page,text,method from app.document_pages where document_id=${id} and page=${page}`;
 return NextResponse.json({document:{id,filename:doc.filename,originalHash:doc.original_hash,pdfHash:doc.pdf_hash,pageCount:doc.page_count,processedAt:doc.processed_at,signature:doc.signature,sourceUrl:doc.url},page:p??null},{headers:{'Cache-Control':'no-store'}});
}
