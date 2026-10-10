import {statfs} from 'node:fs/promises';
import type {DbSql} from '@seap/db';

export function diskCapacity(s:{blocks:number;bfree:number;bavail:number;bsize:number}){
 const total=s.blocks*s.bsize,used=(s.blocks-s.bfree)*s.bsize,available=s.bavail*s.bsize;
 if(!Number.isFinite(total)||total<=0||used<0||available<0||used>total||available>total)return null;
 return {total,used,available,percent:Math.round(used/total*100)};
}
export async function readDocumentStorage(q:DbSql){
 const [disk,archive]=await Promise.allSettled([
  statfs(process.env.DOCUMENT_STORAGE_MOUNT??'/').then(diskCapacity),
  q.begin('read only',async tx=>{
   await tx`set local statement_timeout='3000ms'`;
   const [row]=await tx`select coalesce(sum(octet_length(bytes)),0)::text bytes,count(*)::int blobs from app.document_blobs`;
   return {bytes:Number(row!.bytes),blobs:Number(row!.blobs)};
  }),
 ]);
 return {measuredAt:new Date().toISOString(),disk:disk.status==='fulfilled'?disk.value:null,archive:archive.status==='fulfilled'?archive.value:null};
}
// One in-flight sample per process, shared by all admin polling clients.
let sample:Promise<Awaited<ReturnType<typeof readDocumentStorage>>>|undefined,expires=0;
export function documentStorage(q:DbSql){
 if(!sample||Date.now()>=expires){expires=Date.now()+60000;sample=readDocumentStorage(q);}
 return sample;
}
