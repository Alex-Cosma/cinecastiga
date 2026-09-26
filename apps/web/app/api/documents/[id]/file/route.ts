import {NextResponse} from 'next/server';
import {documentDb,documentRecord} from '@/lib/documents/store';
export const runtime='nodejs';
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){
 const doc=await documentRecord((await ctx.params).id),original=new URL(req.url).searchParams.get('kind')!=='pdf';
 const hash=original?doc?.original_hash:doc?.pdf_hash;if(!hash)return NextResponse.json({error:'Fișierul nu este încă disponibil.'},{status:404});
 const [b]=await documentDb()`select bytes,mime from app.document_blobs where hash=${hash}`;if(!b)return new Response(null,{status:404});
 const bytes=b.bytes as Buffer,range=req.headers.get('range');let start=0,end=bytes.length-1,status=200;
 if(range){const m=/^bytes=(\d+)-(\d*)$/.exec(range);if(!m)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${bytes.length}`}});start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),end):end;if(start>end)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${bytes.length}`}});status=206;}
 const filename=original?doc!.filename:doc!.filename.replace(/\.p7s$/i,'');
 return new Response(new Uint8Array(bytes.subarray(start,end+1)),{status,headers:{'Content-Type':original?'application/octet-stream':'application/pdf','Content-Disposition':`${original?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(filename)}`,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes',...(status===206?{'Content-Range':`bytes ${start}-${end}/${bytes.length}`} : {}),'ETag':`"${hash}"`,'Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff','Content-Security-Policy':"frame-ancestors 'self'"}});
}
