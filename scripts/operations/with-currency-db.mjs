/** Execute a command against an explicitly isolated LOCAL currency database. */
import {spawnSync} from 'node:child_process';
const [database,command,...args]=process.argv.slice(2);
if(!database?.startsWith('seap_test_currency_')||!command)throw Error('Usage: with-currency-db.mjs seap_test_currency_NAME command [args]');
const u=new URL(process.env.DATABASE_URL??'postgres://invalid/');
if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname))throw Error('Only an explicit localhost DATABASE_URL is accepted');
u.pathname='/'+database;
const env={...process.env,DATABASE_URL:u.toString(),PGHOST:u.hostname,PGPORT:u.port||'5432',PGDATABASE:database,PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGOPTIONS:'-c work_mem=8MB -c max_parallel_workers_per_gather=0 -c jit=off'};
const result=spawnSync(command,args,{env,stdio:'inherit',shell:false});
if(result.error)throw result.error;
process.exit(result.status??1);
