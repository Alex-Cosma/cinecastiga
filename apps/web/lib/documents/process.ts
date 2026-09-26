import {execFile} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
export const sha256=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
export function runTool(file:string,args:string[],signal:AbortSignal):Promise<string>{return new Promise((resolve,reject)=>{execFile(file,args,{signal,timeout:90000,maxBuffer:4*1024*1024,env:{...process.env,OMP_THREAD_LIMIT:'1'}},(e,out)=>e?reject(Error(`Procesarea cu ${file} nu a reușit. Originalul rămâne disponibil.`)):resolve(out));});}
/** Reject successful HTTP error pages before labeling bytes as an archived original. */
export async function validateOriginal(bytes:Buffer,signal:AbortSignal){
 if(bytes.subarray(0,5).toString()==='%PDF-')return;
 if(bytes[0]!==0x30)throw Error('SEAP nu a returnat un PDF sau un fișier semnat P7S compatibil.');
 const dir=await mkdtemp(join(tmpdir(),'seap-format-'));
 try{const path=join(dir,'source');await writeFile(path,bytes,{mode:0o600});await runTool('openssl',['cms','-cmsout','-inform','DER','-noout','-in',path],signal);}
 finally{await rm(dir,{recursive:true,force:true});}
}
export async function processPdf(original:Buffer,signal:AbortSignal,progress:(stage:string,done:number,total:number|null)=>Promise<void>){
 const dir=await mkdtemp(join(tmpdir(),'seap-doc-'));
 try{
  const source=join(dir,'original'),pdf=join(dir,'document.pdf');await writeFile(source,original,{mode:0o600});
  await progress('extract',0,null);let signature:string|null=null;
  if(original.subarray(0,5).toString()==='%PDF-')await writeFile(pdf,original,{mode:0o600});
  else{
   await runTool('openssl',['cms','-verify','-binary','-inform','DER','-in',source,'-noverify','-out',pdf],signal);
   signature='Integritatea semnăturii verificată; încrederea și revocarea certificatului nu au fost verificate.';
  }
  const bytes=await readFile(pdf);if(bytes.length>50*1024*1024||bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Formatul nu conține un PDF compatibil. Originalul rămâne disponibil.');
  const info=await runTool('pdfinfo',[pdf],signal),count=Number(/^Pages:\s+(\d+)/m.exec(info)?.[1]);
  if(!count||count>150)throw Error('Procesarea acceptă cel mult 150 de pagini. Originalul rămâne disponibil.');
  const pages:{page:number;text:string;method:string}[]=[];
  for(let page=1;page<=count;page++){
   signal.throwIfAborted();await progress('text',page-1,count);
   let text=await runTool('pdftotext',['-f',String(page),'-l',String(page),'-layout','-enc','UTF-8',pdf,'-'],signal),method='native';
   if(text.trim().length<30){
    await progress('ocr',page-1,count);const out=join(dir,'page');
    await runTool('pdftoppm',['-f',String(page),'-l',String(page),'-singlefile','-scale-to','2400','-png',pdf,out],signal);
    text=await runTool('tesseract',[out+'.png','stdout','-l','ron+eng'],signal);method='ocr';await rm(out+'.png',{force:true});
   }
   if(text.length>100000)throw Error('Pagina depășește limita de text procesabil. Originalul rămâne disponibil.');
   pages.push({page,text:text.replace(/\u0000/g,'').trim(),method});await progress(method==='ocr'?'ocr':'text',page,count);
  }
  return {pdf:bytes,pages,signature,processor:'poppler+tesseract-ron-eng-v1'};
 }finally{await rm(dir,{recursive:true,force:true});}
}
