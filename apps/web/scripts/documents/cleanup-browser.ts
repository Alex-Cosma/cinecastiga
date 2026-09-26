import {readFile,unlink} from 'node:fs/promises';
import {createDb} from '@seap/db';
if(process.env.DATABASE_URL&&!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))throw Error('Local database required');
const path='/tmp/seap-documents-browser.json',fixture=JSON.parse(await readFile(path,'utf8'));
if(!/^documents-preview-[a-f0-9-]{36}$/.test(fixture.user))throw Error('Unexpected fixture identity');
const {sql}=createDb();
try{
 const removed=await sql`delete from auth.users where id=${fixture.user} and email=${fixture.user+'@example.test'} returning id`;
 await unlink(path);console.log('Temporary browser accounts removed:',removed.length);
}finally{await sql.end();}
