import {createDb} from '@seap/db';
import {recoverArchivedP7s} from '../../lib/documents/recover-p7s';
if(process.argv.slice(2).some(arg=>arg!=='--apply'))throw Error('Usage: recover-p7s.ts [--apply]. Default: read-only, archived originals only.');
const {sql}=createDb(undefined,{max:2});
try{console.log(JSON.stringify(await recoverArchivedP7s(sql,{apply:process.argv.includes('--apply')})));}finally{await sql.end();}
