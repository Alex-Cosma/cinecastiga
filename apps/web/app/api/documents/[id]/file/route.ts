import {NextResponse} from 'next/server';
import {blobInfo,readBlobRange,BLOB_CHUNK} from '@/lib/documents/blob-store';
import {documentDb,documentRecord} from '@/lib/documents/store';
export const runtime='nodejs';
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){
 const doc=await documentRecord((await ctx.params).id),original=new URL(req.url).searchParams.get('kind')!=='pdf';
 const hash=original?doc?.original_hash:doc?.processed_at?doc.pdf_hash:null;if(!hash)return NextResponse.json({error:'Fișierul nu este încă disponibil.'},{status:404});
 const q=documentDb(),info=await blobInfo(q,hash);if(!info)return new Response(null,{status:404});
 const range=req.headers.get('range');let start=0,end=info.size-1,status=200;
 if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||!m[1]&&!m[2])return new Response(null,{status:416,headers:{'Content-Range':`bytes */${info.size}`}});
  if(!m[1])start=Math.max(0,info.size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Math.min(Number(m[2]),end);}
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start<0)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${info.size}`}});status=206;
 }
 let offset=start;const stream=new ReadableStream<Uint8Array>({async pull(controller){try{if(req.signal.aborted){controller.close();return;}if(offset>end){controller.close();return;}const bytes=await readBlobRange(q,hash,offset,Math.min(offset+BLOB_CHUNK-1,end),info.chunked);if(!bytes.length)throw Error('Incomplete blob');offset+=bytes.length;controller.enqueue(new Uint8Array(bytes));}catch(error){controller.error(error);}}});
 const filename=original?doc!.filename:doc!.filename.replace(/(?:\.[^.]+)+$/, '')+'.pdf';
 return new Response(stream,{status,headers:{'Content-Type':original?'application/octet-stream':'application/pdf','Content-Disposition':`${original?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(filename)}`,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes',...(status===206?{'Content-Range':`bytes ${start}-${end}/${info.size}`} : {}),'ETag':`"${hash}"`,'Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff','Content-Security-Policy':"frame-ancestors 'self'"}});
}
