import {open,mkdtemp,mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,extname} from 'node:path';
import {runTool,extractSignedContent} from './process';
import {DocumentFormatError} from './errors';
import {SIGNATURE_UNVERIFIED,SIGNATURE_VERIFIED} from './shared';
export type ContentPart={name:string;firstPage?:number;pages?:number;rendition?:string;error?:string;signature?:string};
const converter=fileURLToPath(new URL('../../scripts/documents/convert.py',import.meta.url));
export const PROCESSOR='documents-v3';
export async function fileKind(path:string,name:string){
 const f=await open(path,'r');const b=Buffer.alloc(8);try{await f.read(b,0,8,0);}finally{await f.close();}
 if(b.subarray(0,5).toString()==='%PDF-')return 'pdf';
 if(b[0]===0x30)return 'p7s';
 if(b.subarray(0,2).toString()==='PK'){
  // Inspect the ZIP directory through Python, not its extension; no content extracted.
  const result=await runTool('python3',['-c','import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); n=set(z.namelist()); print("docx" if "word/document.xml" in n else "xlsx" if "xl/workbook.xml" in n else "archive")',path],AbortSignal.timeout(90000));return result.trim();
 }
 if(b.subarray(0,4).equals(Buffer.from([0xd0,0xcf,0x11,0xe0])))return extname(name).toLowerCase()==='.xls'?'xls':'doc';
 if(b.subarray(0,4).toString()==='Rar!'||b.subarray(0,6).equals(Buffer.from([0x37,0x7a,0xbc,0xaf,0x27,0x1c])))return 'archive';
 return 'unsupported';
}
export async function prepareDocument(source:string,filename:string,dir:string,signal:AbortSignal){
 const parts:ContentPart[]=[],pdfs:string[]=[],signatures:string[]=[];let pages=0,entries=0,expanded=0;
 async function visit(path:string,name:string,depth:number){
  signal.throwIfAborted();if(++entries>1000||depth>8)throw new DocumentFormatError('Procesarea arhivei necesită un lot separat: prea multe fișiere sau niveluri. Originalul rămâne disponibil.');
  const kind=await fileKind(path,name);
  if(kind==='p7s'){
   const dest=join(dir,`signed-${entries}`),signature=await extractSignedContent(path,dest,signal);signatures.push(signature);
   const start=parts.length;await visit(dest,name.replace(/\.p7s$/i,''),depth+1);for(const p of parts.slice(start))if(p.signature!==SIGNATURE_UNVERIFIED)p.signature=signature;return;
  }
  if(kind==='archive'){
   const target=await mkdtemp(join(dir,'archive-'));
   let rows:{name:string;path?:string;error?:string;size?:number}[];
   try{rows=JSON.parse(await runTool('python3',[converter,path,target,'archive',String(2*1024**3-expanded)],signal));}catch{signal.throwIfAborted();throw new DocumentFormatError('Formatul arhivei nu poate fi citit integral: deteriorare, protecție sau compresie neacceptată. Originalul rămâne disponibil.');}
   expanded+=rows.reduce((sum,r)=>sum+(r.size??0),0);
   for(const row of rows){if(row.error)parts.push({name:`${name} / ${row.name}`,error:row.error});else if(row.path){try{await visit(row.path,`${name} / ${row.name}`,depth+1);}catch{signal.throwIfAborted();parts.push({name:`${name} / ${row.name}`,error:'Acest fișier nu a putut fi procesat. Consultă originalul.'});}}}return;
  }
  if(kind==='unsupported'){parts.push({name,error:'Formatul nu are încă un convertor. Este păstrat în original.'});return;}
  const pdf=join(dir,`part-${entries}.pdf`);
  try{
   if(kind==='pdf')await copyFile(path,pdf);
   else await runTool('python3',[converter,path,pdf,kind],signal);
   let info=await runTool('pdfinfo',[pdf],signal);
   // Some public PDFs open without a password but retain encryption flags that
   // pdfunite rejects. Normalize only the derivative, never the signed original.
   if(/^Encrypted:\s+yes/im.test(info)){
    const unlocked=join(dir,`readable-${entries}.pdf`);
    await runTool('qpdf',['--password=','--decrypt',pdf,unlocked],signal);
    await copyFile(unlocked,pdf);info=await runTool('pdfinfo',[pdf],signal);
   }
   const count=Number(/^Pages:\s+(\d+)/m.exec(info)?.[1]);
   if(!Number.isSafeInteger(count)||count<1)throw new DocumentFormatError('Procesarea nu a putut identifica paginile PDF.');
   parts.push({name,firstPage:pages+1,pages:count,rendition:kind==='pdf'?'pdf':'text'});pages+=count;pdfs.push(pdf);
  }catch(error){signal.throwIfAborted();if(depth===0)throw error;parts.push({name,error:'Conversia acestui fișier nu a reușit. Consultă originalul.'});}
 }
 await mkdir(dir,{recursive:true});await visit(source,filename,0);
 if(!pdfs.length)throw new DocumentFormatError('Formatul nu conține fișiere care pot fi pregătite pentru lectură. Originalul rămâne disponibil.');
 const pdf=join(dir,'prepared.pdf');if(pdfs.length===1)await copyFile(pdfs[0]!,pdf);else await runTool('pdfunite',[...pdfs,pdf],signal);
 const signature=signatures.includes(SIGNATURE_UNVERIFIED)?SIGNATURE_UNVERIFIED:signatures.length?SIGNATURE_VERIFIED:null;
 return {pdf,pages,signature,contents:parts,processor:PROCESSOR};
}
