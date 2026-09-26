import {createDb} from '@seap/db';
import {setTimeout as pause} from 'node:timers/promises';
import {runWorkerOnce} from '../../lib/documents/worker';
if(process.env.DOCUMENTS_ENABLED!=='true')throw Error('Set DOCUMENTS_ENABLED=true to run the document queue.');
const {sql}=createDb();const stop=new AbortController();
process.once('SIGTERM',()=>stop.abort());process.once('SIGINT',()=>stop.abort());
try{do{try{const worked=await runWorkerOnce(sql,stop.signal);if(process.argv.includes('--once'))break;if(!worked)await pause(3000,undefined,{signal:stop.signal});}catch(error){if(stop.signal.aborted)break;console.error('Document worker:',error instanceof Error?error.message:'failed');if(process.argv.includes('--once')){process.exitCode=1;break;}await pause(5000,undefined,{signal:stop.signal});}}while(!stop.signal.aborted);}finally{await sql.end({timeout:5});}
