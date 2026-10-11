import {writeFile,mkdtemp,rm} from 'node:fs/promises';
import {basename,join} from 'node:path';import {tmpdir} from 'node:os';
import {prepareDocument} from '../../lib/documents/prepare';import {readPdfPage} from '../../lib/documents/process-pages';import {fileHash} from '../../lib/documents/blob-store';
const file=process.argv[2];if(!file)throw Error('Pass local source file. No network is used.');
const dir=await mkdtemp(join(tmpdir(),'local-document-'));
try{const signal=AbortSignal.timeout(60*60*1000),result=await prepareDocument(file,basename(file),dir,signal),pages=[];
 for(let page=1;page<=result.pages;page++){pages.push(await readPdfPage(result.pdf,page,dir,signal));console.log(JSON.stringify({stage:pages.at(-1)!.method,done:page,total:result.pages}));}
 const report={sourceSha256:await fileHash(file),pdfSha256:await fileHash(result.pdf),pages:pages.length,searchablePages:pages.filter(p=>p.text.length).length,signature:result.signature,processor:result.processor,contents:result.contents};
 if(process.argv[3])await writeFile(process.argv[3],JSON.stringify({...report,text:pages},null,2));console.log(JSON.stringify(report));
}finally{await rm(dir,{recursive:true,force:true});}
