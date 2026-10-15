import {afterAll,describe,it,expect} from 'vitest';
import {createDb,type DbSql} from '@seap/db';
import {mkdtemp,writeFile,readFile,rm,open} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {storeFile,blobInfo,materializeBlob,readBlobRange,BLOB_CHUNK,fileHash} from './blob-store';
const url=process.env.TEST_DATABASE_URL;
if(url&&!new URL(url).pathname.startsWith('/seap_test_'))throw Error('Isolated database required');
const db=url?createDb(url):null;afterAll(async()=>{await db?.sql.end();});
describe.skipIf(!db)('chunked public source storage',()=>{
 it('roundtrips more than 50 MiB, ranges and deduplicates without giant database values',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'blob-test-'));let hash:string|undefined;
  try{const source=join(dir,'source'),file=await open(source,'wx');const block=Buffer.alloc(BLOB_CHUNK,97);for(let i=0;i<53;i++)await file.write(block);await file.write(Buffer.from('last'));await file.close();
   hash=await db!.sql.begin(async tx=>storeFile(tx as unknown as DbSql,source,'application/pdf')) as string;
   expect(await blobInfo(db!.sql,hash)).toMatchObject({size:53*BLOB_CHUNK+4,chunked:true});
   expect((await db!.sql`select max(octet_length(bytes)) size,count(*)::int n from app.document_blob_chunks where hash=${hash}`)[0]).toMatchObject({size:BLOB_CHUNK,n:54});
   expect((await readBlobRange(db!.sql,hash,53*BLOB_CHUNK,53*BLOB_CHUNK+3,true)).toString()).toBe('last');
   expect(await db!.sql.begin(async tx=>storeFile(tx as unknown as DbSql,source,'application/pdf'))).toBe(hash);
   await materializeBlob(db!.sql,hash,join(dir,'copy'));expect(await fileHash(join(dir,'copy'))).toBe(hash);
  }finally{if(hash)await db!.sql`delete from app.document_blobs where hash=${hash}`;await rm(dir,{recursive:true,force:true});}
 },60000);
 it('continues to serve legacy blobs and rolls back a partial chunk transaction',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'blob-test-'));const path=join(dir,'source');await writeFile(path,'legacy-public-source');const hash=await fileHash(path);
  try{await db!.sql`insert into app.document_blobs(hash,bytes,mime) values(${hash},${await readFile(path)},'application/pdf')`;
   expect((await blobInfo(db!.sql,hash))?.chunked).toBe(false);expect((await readBlobRange(db!.sql,hash,0,5,false)).toString()).toBe('legacy');
   await db!.sql`delete from app.document_blobs where hash=${hash}`;
   await expect(db!.sql.begin(async tx=>{await storeFile(tx as unknown as DbSql,path,'application/pdf');throw Error('interrupt');})).rejects.toThrow('interrupt');
   expect(await blobInfo(db!.sql,hash)).toBeNull();expect(await db!.sql`select part from app.document_blob_chunks where hash=${hash}`).toHaveLength(0);
  }finally{await db!.sql`delete from app.document_blobs where hash=${hash}`;await rm(dir,{recursive:true,force:true});}
 });
});
