import {readFile,writeFile} from 'node:fs/promises';
import {processPdf,sha256} from '../../lib/documents/process';
const file=process.argv[2];if(!file)throw Error('Pass local source file. No network is used.');
const original=await readFile(file);const result=await processPdf(original,AbortSignal.timeout(15*60*1000),async(stage,done,total)=>{console.log(JSON.stringify({stage,done,total}));});
const report={sourceSha256:sha256(original),pdfSha256:sha256(result.pdf),pages:result.pages.length,searchablePages:result.pages.filter(p=>p.text.length).length,signature:result.signature,processor:result.processor};
if(process.argv[3])await writeFile(process.argv[3],JSON.stringify({...report,text:result.pages},null,2));console.log(JSON.stringify(report));
