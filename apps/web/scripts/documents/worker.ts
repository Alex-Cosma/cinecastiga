import {createDb} from '@seap/db';
import {setTimeout as pause} from 'node:timers/promises';
import {runWorkerOnce} from '../../lib/documents/worker';
const stop=new AbortController();
process.once('SIGTERM',()=>stop.abort());process.once('SIGINT',()=>stop.abort());
if(process.env.DOCUMENTS_ENABLED!=='true'){
 console.log('Document queue disabled; no database or SEAP requests will be made.');
 if(!process.argv.includes('--once'))while(!stop.signal.aborted){try{await pause(60_000,undefined,{signal:stop.signal});}catch{break;}}
 process.exit(0);
}
const {sql}=createDb();
try{do{try{const worked=await runWorkerOnce(sql,stop.signal);if(process.argv.includes('--once'))break;if(!worked)await pause(3000,undefined,{signal:stop.signal});}catch(error){if(stop.signal.aborted)break;console.error('Document worker:',error instanceof Error?error.message:'failed');if(process.argv.includes('--once')){process.exitCode=1;break;}await pause(5000,undefined,{signal:stop.signal});}}while(!stop.signal.aborted);}finally{await sql.end({timeout:5});}
