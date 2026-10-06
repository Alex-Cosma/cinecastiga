import {createDb,loadSeapProxies,registerSeapProxies} from '../../packages/db/dist/index.js';
if(!process.env.DATABASE_URL||!process.env.SEAP_PROXY_FILE)throw Error('DATABASE_URL and SEAP_PROXY_FILE are required.');
const pool=await loadSeapProxies();
const {sql}=createDb();
try{await registerSeapProxies(sql,pool);console.log(`${pool.length} proxy-uri înregistrate. Activarea se face separat, din /admin. Zero cereri SEAP.`);}finally{await sql.end();}
