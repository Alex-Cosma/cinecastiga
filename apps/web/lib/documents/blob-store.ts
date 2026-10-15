import type {DbSql} from '@seap/db';
import {open,statfs} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
export const BLOB_CHUNK=1024*1024;
export async function requireDisk(path:string){const s=await statfs(path);if(s.bavail*s.bsize<2*1024**3)throw Error('Procesarea așteaptă spațiu liber pe disc (minimum 2 GiB). Originalele arhivate sunt păstrate.');}
export async function fileHash(path:string){const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');}
// Caller owns the transaction: metadata and all chunks become visible together.
export async function storeFile(q:DbSql,path:string,mime:string){
 const hash=await fileHash(path);await q`select pg_advisory_xact_lock(hashtext(${hash}))`;
 if((await q`select hash from app.document_blobs where hash=${hash}`).length)return hash;
 const file=await open(path,'r');try{
  const size=(await file.stat()).size;if(!size)throw Error('Originalul este gol.');
  await q`insert into app.document_blobs(hash,bytes,mime,size) values(${hash},${Buffer.alloc(0)},${mime},${size})`;
  let offset=0,part=0;const buffer=Buffer.alloc(BLOB_CHUNK);
  while(offset<size){let bytesRead=0;const wanted=Math.min(BLOB_CHUNK,size-offset);while(bytesRead<wanted){const r=await file.read(buffer,bytesRead,wanted-bytesRead,offset+bytesRead);if(!r.bytesRead)throw Error('Originalul nu poate fi citit integral.');bytesRead+=r.bytesRead;}await q`insert into app.document_blob_chunks(hash,part,bytes) values(${hash},${part++},${buffer.subarray(0,bytesRead)})`;offset+=bytesRead;}
 }finally{await file.close();}return hash;
}
export async function blobInfo(q:DbSql,hash:string){const [r]=await q`select coalesce(size,octet_length(bytes))::text size,size is not null chunked,mime from app.document_blobs where hash=${hash}`;return r?{size:Number(r.size),chunked:r.chunked as boolean,mime:r.mime as string}:null;}
export async function readBlobRange(q:DbSql,hash:string,start:number,end:number,chunked:boolean){
 if(!chunked){const [r]=await q`select substring(bytes from ${start+1} for ${end-start+1}) bytes from app.document_blobs where hash=${hash}`;if(!r)throw Error('Originalul arhivat lipsește.');return r.bytes as Buffer;}
 const part=Math.floor(start/BLOB_CHUNK),offset=start%BLOB_CHUNK;
 const [r]=await q`select substring(bytes from ${offset+1} for ${Math.min(end-start+1,BLOB_CHUNK-offset)}) bytes from app.document_blob_chunks where hash=${hash} and part=${part}`;
 if(!r?.bytes?.length)throw Error('Originalul arhivat este incomplet.');return r.bytes as Buffer;
}
export async function materializeBlob(q:DbSql,hash:string,path:string){
 const info=await blobInfo(q,hash);if(!info)throw Error('Originalul arhivat lipsește.');const file=await open(path,'wx',0o600);
 try{for(let offset=0;offset<info.size;){await requireDisk(path);const bytes=await readBlobRange(q,hash,offset,Math.min(offset+BLOB_CHUNK,info.size)-1,info.chunked);if(!bytes.length)throw Error('Originalul arhivat este incomplet.');await file.writeFile(bytes);offset+=bytes.length;}}finally{await file.close();}
 if(await fileHash(path)!==hash)throw Error('Originalul arhivat nu corespunde amprentei sale.');
}
