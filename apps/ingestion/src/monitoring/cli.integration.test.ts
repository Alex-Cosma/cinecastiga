import {expect,it} from 'vitest';
import {createDb} from '@seap/db';
import {runMonitoredCli} from './cli.js';
import {getSharedSql,closeSharedDb} from '../db.js';

const connectionString=process.env.TEST_DATABASE_URL;
it.skipIf(!connectionString).each(['monitored','shared'] as const)('closes the %s pool after a reserved connection expires during completed work',async(kind)=>{
 const url=new URL(connectionString!);
 if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/seap_test_cli_shutdown')throw Error('Use a dedicated local shutdown fixture database');
 url.searchParams.set('max_lifetime','1');
 const previousUrl=process.env.DATABASE_URL;
 process.env.DATABASE_URL=url.toString();
 const sql=kind==='shared'?getSharedSql():createDb(url.toString()).sql;
 const {sql:observer}=createDb(connectionString);
 let backendPid:number|undefined;
 try{
  const work=async()=>{
   const reserved=await sql.reserve();
   try{
    const [row]=await reserved`select pg_backend_pid() pid,pg_advisory_lock(729114,99)`;
    backendPid=Number(row!.pid);
    // Expire the driver's lifetime while this connection is exclusively held.
    await observer`select pg_sleep(1.5)`;
    await reserved`select pg_advisory_unlock(729114,99)`;
   }finally{reserved.release();}
   return 'work committed and gate released';
  };
  const result=kind==='monitored'?await runMonitoredCli(sql,'shutdown-regression',work,false):await (async()=>{try{return await work();}finally{await closeSharedDb();}})();
  expect(result).toBe('work committed and gate released');
  const [remaining]=await observer`select count(*)::int n from pg_stat_activity where pid=${backendPid!}`;
  expect(remaining!.n).toBe(0);
 }finally{await observer.end({timeout:1});if(previousUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previousUrl;}
},20_000);
