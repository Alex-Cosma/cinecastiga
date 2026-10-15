import {SIGNATURE_VERIFIED,SIGNATURE_UNVERIFIED} from './shared';
import {execFile} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
export const sha256=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
export class DocumentToolError extends Error {
 constructor(file:string,readonly exitCode:number|null){super(`Procesarea cu ${file} nu a reușit. Originalul rămâne disponibil.`);}
}
export function runTool(file:string,args:string[],signal:AbortSignal):Promise<string>{return new Promise((resolve,reject)=>{execFile(process.platform==='linux'?'prlimit':file,process.platform==='linux'?['--as=805306368','--cpu=85','--',file,...args]:args,{signal,timeout:90000,maxBuffer:4*1024*1024,env:{...process.env,OMP_THREAD_LIMIT:'1'}},(e,out)=>e?reject(new DocumentToolError(file,typeof e.code==='number'&&!e.killed?e.code:null)):resolve(out));});}
/** Verification and extraction are separate results. Never infer signature validity
 * from the exit status or stderr of a -nosigs extraction. Cancellation/tool failures
 * cannot enter the fallback; detached or malformed containers must still fail. */
export async function extractSignedContent(source:string,output:string,signal:AbortSignal,tool=runTool){
 const args=['cms','-verify','-binary','-inform','DER','-in',source,'-noverify','-out',output];
 signal.throwIfAborted();
 try{await tool('openssl',args,signal);signal.throwIfAborted();return SIGNATURE_VERIFIED;}
 catch(error){
  signal.throwIfAborted();
  if(!(error instanceof DocumentToolError)||error.exitCode!==4)throw error;
  await rm(output,{force:true});
  await tool('openssl',[...args,'-nosigs'],signal);
  signal.throwIfAborted();return SIGNATURE_UNVERIFIED;
 }
}
/** Reject successful HTTP error pages before labeling bytes as an archived original. */
export async function validateOriginal(bytes:Buffer,signal:AbortSignal){
 if(bytes.subarray(0,5).toString()==='%PDF-')return;
 if(bytes[0]!==0x30)throw Error('SEAP nu a returnat un PDF sau un fișier semnat P7S compatibil.');
 const dir=await mkdtemp(join(tmpdir(),'seap-format-'));
 try{const path=join(dir,'source');await writeFile(path,bytes,{mode:0o600});await runTool('openssl',['cms','-cmsout','-inform','DER','-noout','-in',path],signal);}
 finally{await rm(dir,{recursive:true,force:true});}
}
