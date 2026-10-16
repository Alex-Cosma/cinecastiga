import {isUtf8} from 'node:buffer';
import {Readable} from 'node:stream';
import {createGunzip} from 'node:zlib';

/**
 * TED OJ S daily package (`/packages/daily/{yyyy}{nnnnn}`, a .tar.gz of the day's
 * per-notice XML for every EU country) read in Node without a shell: gunzip as a
 * stream and a minimal, strict ustar reader. Only regular files and directories
 * (plus pax/GNU long-name records for names) are accepted; links, devices, path
 * traversal, oversize members, bad checksums and truncation fail the whole package.
 */
export interface TarLimits {maxMembers:number;maxFileBytes:number;maxTotalBytes:number}
export const TED_PACKAGE_LIMITS:TarLimits={maxMembers:100_000,maxFileBytes:32*1024*1024,maxTotalBytes:1024*1024*1024};
const BLOCK=512,META_MAX=64*1024;

class ByteReader {
 private chunks:Buffer[]=[];private length=0;private done=false;total=0;
 constructor(private source:AsyncIterator<Buffer>,private maxTotal:number){}
 private async fill(n:number){
  while(this.length<n&&!this.done){
   const r=await this.source.next();
   if(r.done){this.done=true;break;}
   const c=Buffer.from(r.value);this.total+=c.length;
   if(this.total>this.maxTotal)throw Error('TED: pachetul depășește dimensiunea maximă după decompresie.');
   if(c.length){this.chunks.push(c);this.length+=c.length;}
  }
  return this.length>=n;
 }
 async read(n:number):Promise<Buffer|null>{
  if(!await this.fill(n))return null;
  const all=this.chunks.length===1?this.chunks[0]!:Buffer.concat(this.chunks);
  this.chunks=all.length>n?[all.subarray(n)]:[];this.length-=n;
  return all.subarray(0,n);
 }
 async skip(n:number){for(let left=n;left>0;){const k=Math.min(left,1<<20);if(!await this.read(k))return false;left-=k;}return true;}
 /** Remaining bytes after the end marker: only zero padding is accepted. */
 async drainZeros(){for(;;){if(!await this.fill(1))return true;const c=await this.read(Math.min(this.length,1<<20));if(c!.some(b=>b!==0))return false;}}
}

const cstr=(h:Buffer,at:number,len:number)=>{const s=h.subarray(at,at+len),end=s.indexOf(0);return s.subarray(0,end<0?len:end).toString('utf8');};
function octal(h:Buffer,at:number,len:number,field:string){
 if(h[at]!&0x80)throw Error(`TED: arhiva folosește un câmp ${field} binar neacceptat.`);
 const s=h.subarray(at,at+len).toString('latin1').replace(/[\0 ]+$/,'').replace(/^ +/,'');
 if(!/^[0-7]*$/.test(s))throw Error(`TED: câmpul ${field} din arhivă nu este valid.`);
 return s?parseInt(s,8):0;
}
/** Relative, normalized member path; refuses absolute paths, '..', backslashes and NUL. */
export function safeTarPath(name:string){
 const n=name.replace(/^(\.\/)+/,'');
 if(!n||n.length>1024||n.includes('\0')||n.includes('\\')||n.startsWith('/')||/^[a-z]:/i.test(n)||n.split('/').some(p=>p==='..'))throw Error('TED: arhiva conține o cale nepermisă.');
 return n;
}
function paxRecords(data:Buffer){
 const out:Record<string,string>={};let at=0;
 while(at<data.length){
  if(data[at]===0)break;
  const space=data.indexOf(0x20,at),len=Number(data.subarray(at,space).toString('latin1'));
  if(space<0||!Number.isSafeInteger(len)||len<=space-at+1||at+len>data.length||data[at+len-1]!==0x0a)throw Error('TED: antet pax nevalid în arhivă.');
  const record=data.subarray(space+1,at+len-1).toString('utf8'),eq=record.indexOf('=');
  if(eq<1)throw Error('TED: antet pax nevalid în arhivă.');
  out[record.slice(0,eq)]=record.slice(eq+1);at+=len;
 }
 return out;
}

/** Streams a .tar.gz; `want` decides which regular files are read (others are skipped),
 * `onFile` receives their bytes. Returns the number of regular files seen. */
export async function readTarGz(gz:Uint8Array,want:(name:string,size:number)=>boolean,onFile:(name:string,data:Buffer)=>void,limits:TarLimits=TED_PACKAGE_LIMITS){
 const gunzip=createGunzip();Readable.from([Buffer.from(gz)]).pipe(gunzip);
 const source=gunzip[Symbol.asyncIterator]() as AsyncIterator<Buffer>;
 const r=new ByteReader(source,limits.maxTotalBytes);
 let files=0,members=0,longName:string|null=null,pax:Record<string,string>={};
 try{
  for(;;){
   const h=await r.read(BLOCK);
   if(!h)throw Error('TED: arhiva este trunchiată (lipsește marcajul de final).');
   if(h.every(b=>b===0)){
    const second=await r.read(BLOCK);
    if(!second||second.some(b=>b!==0))throw Error('TED: arhiva este trunchiată (lipsește marcajul de final).');
    if(!await r.drainZeros())throw Error('TED: arhiva conține date după marcajul de final.');
    break;
   }
   if(++members>limits.maxMembers)throw Error('TED: arhiva are prea multe intrări.');
   const stored=octal(h,148,8,'checksum');let sum=0;
   for(let i=0;i<BLOCK;i++)sum+=i>=148&&i<156?0x20:h[i]!;
   if(sum!==stored)throw Error('TED: antet de arhivă corupt (checksum).');
   const magic=h.subarray(257,263).toString('latin1');
   if(!magic.startsWith('ustar'))throw Error('TED: arhiva nu este în format ustar.');
   const type=h[156]===0?'0':String.fromCharCode(h[156]!);
   const headerSize=octal(h,124,12,'size');
   if(type==='x'||type==='g'||type==='L'){
    if(headerSize>META_MAX)throw Error('TED: antet de arhivă prea mare.');
    const data=await r.read(Math.ceil(headerSize/BLOCK)*BLOCK);if(!data)throw Error('TED: arhiva este trunchiată.');
    if(type==='L')longName=cstr(data,0,headerSize);else if(type==='x')pax={...pax,...paxRecords(data.subarray(0,headerSize))};
    continue;
   }
   const size=pax.size!==undefined?(/^\d{1,15}$/.test(pax.size)?Number(pax.size):-1):headerSize;
   if(!Number.isSafeInteger(size)||size<0)throw Error('TED: dimensiune nevalidă în arhivă.');
   const padded=Math.ceil(size/BLOCK)*BLOCK;
   const prefix=magic==='ustar\0'?cstr(h,345,155):'';
   const raw=pax.path??longName??(prefix?`${prefix}/${cstr(h,0,100)}`:cstr(h,0,100));
   longName=null;pax={};
   const name=safeTarPath(raw);
   if(type==='5'){if(size!==0)throw Error('TED: director cu conținut în arhivă.');continue;}
   if(type!=='0')throw Error(`TED: arhiva conține o intrare nepermisă (tip ${JSON.stringify(type)}).`);
   if(size>limits.maxFileBytes)throw Error(`TED: fișierul ${name} depășește dimensiunea maximă.`);
   files++;
   if(want(name,size)){
    const data=await r.read(padded);if(!data)throw Error('TED: arhiva este trunchiată.');
    onFile(name,Buffer.from(data.subarray(0,size)));
   }else if(!await r.skip(padded))throw Error('TED: arhiva este trunchiată.');
  }
 }catch(error){
  gunzip.destroy();
  if(error instanceof Error&&error.message.startsWith('TED:'))throw error;
  throw Error('TED: pachetul nu poate fi decomprimat (gzip corupt sau trunchiat).',{cause:error});
 }
 return files;
}

export interface TedPackageCandidate {name:string;xml:string}
/** An XML that mentions ROU but fails the text pre-filter: names and markup only, never content. */
export interface TedPackageMiss {name:string;countryMarker:boolean;typeMarker:boolean;rouTags:string[]}
/** Same cheap pre-filter as the manual bulk import (eForms, Romanian address, award
 * notice type); the planner then parses each candidate and decides structurally. */
const COUNTRY=Buffer.from('eforms-country">ROU'),TYPE=Buffer.from('>can-standard<'),ROU=Buffer.from('ROU');
export async function readTedDailyPackage(gz:Uint8Array,limits:TarLimits=TED_PACKAGE_LIMITS){
 if(gz.length<2||gz[0]!==0x1f||gz[1]!==0x8b)throw Error('TED: pachetul primit nu este o arhivă gzip.');
 const candidates:TedPackageCandidate[]=[],misses:TedPackageMiss[]=[];let xmlFiles=0;const names=new Set<string>();
 const files=await readTarGz(gz,name=>/\.xml$/i.test(name),(name,data)=>{
  if(names.has(name))throw Error(`TED: fișierul ${name} apare de două ori în pachet.`);names.add(name);xmlFiles++;
  const countryMarker=data.includes(COUNTRY),typeMarker=data.includes(TYPE);
  if(!countryMarker||!typeMarker){
   // Diagnostics for the day verification: which element carries ROU when the pre-filter misses it.
   if(typeMarker&&data.includes(ROU)&&misses.length<200){
    const text=data.toString('utf8'),tags=new Set<string>();
    for(const m of text.matchAll(/<([A-Za-z][\w:.-]{0,60})((?:\s+[\w:.-]+="[^"<>]{0,80}")*)\s*>\s*ROU\s*</g)){tags.add(`${m[1]}${m[2]}`.slice(0,160));if(tags.size>=5)break;}
    misses.push({name,countryMarker,typeMarker,rouTags:[...tags]});
   }
   return;
  }
  if(!isUtf8(data))throw Error(`TED: fișierul ${name} nu este UTF-8 valid.`);
  candidates.push({name,xml:data.toString('utf8')});
 },limits);
 return {files,xmlFiles,candidates,misses};
}
