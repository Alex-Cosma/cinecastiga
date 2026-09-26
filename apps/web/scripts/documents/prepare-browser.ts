import {readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {createHmac,randomUUID,randomBytes} from 'node:crypto';
import {createDb} from '@seap/db';
const env=parseEnv(await readFile('.env.local','utf8'));const secret=process.env.BETTER_AUTH_SECRET??env.BETTER_AUTH_SECRET;
if(!secret)throw Error('Local auth configuration missing');
if(process.env.DATABASE_URL&&!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))throw Error('Local database required');
const {sql:q}=createDb();const user='documents-preview-'+randomUUID(),token=randomBytes(32).toString('hex');
try{
 await q`insert into auth.users(id,name,email,email_verified) values(${user},'Verificare locală documente',${user+'@example.test'},true)`;
 await q`insert into auth.sessions(id,token,user_id,expires_at) values(${randomUUID()},${token},${user},now()+interval '2 hours')`;
 const signed=token+'.'+createHmac('sha256',secret).update(token).digest('base64');
 const [doc]=await q`select id from app.procurement_documents where notice_key='17:100231768' and source_id='110778324' and original_hash is not null`;
 await writeFile('/tmp/seap-documents-browser.json',JSON.stringify({user,documentId:doc!.id,cookie:{name:'better-auth.session_token',value:encodeURIComponent(signed)}}),{mode:0o600});
 console.log('Temporary local browser fixture prepared; no email or external requests.');
}finally{await q.end();}
