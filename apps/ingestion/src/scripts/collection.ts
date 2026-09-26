import {setTimeout as sleep} from 'node:timers/promises';
import type {DbSql} from '@seap/db';
import {getSharedSql,closeSharedDb} from '../db.js';
import {getElicitatieClient} from '../scrape/elicitatie/client.js';
import {fetchTask,recoverInterrupted,recoveryStep,RECOVERY_LOCK,seedRecovery} from '../collection/runner.js';
const args=process.argv.slice(2),q=getSharedSql();
let stopping=false;
process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
try{
 if(args[0]==='seed'){console.log(JSON.stringify({batch:await seedRecovery(q,args[1]),networkRequests:0}));}
 else if(args[0]==='run'){
  const boundArg=args.find(a=>a.startsWith('--max-tasks='));const bound=boundArg?Number(boundArg.split('=')[1]):Infinity;
  if(!(bound>0)||bound!==Infinity&&!Number.isSafeInteger(bound))throw Error('Invalid task bound');
  const lock=await q.reserve();
  try{
   const [l]=await lock`select pg_try_advisory_lock(${RECOVERY_LOCK[0]},${RECOVERY_LOCK[1]}) acquired,pg_backend_pid() pid`;
   if(!l?.acquired)throw Error('Recovery worker already running');
   await recoverInterrupted(q);let attempts=0;
   const client=getElicitatieClient();
   while(!stopping&&attempts<bound){
    const [session]=await lock`select pg_backend_pid() pid`;if(session?.pid!==l.pid)throw Error('Recovery lock session lost');
    if(await recoveryStep(q,t=>fetchTask(client,t)))attempts++;
    else{if(bound!==Infinity)break;await sleep(5000);}
    if(bound!==Infinity){const [c]=await q`select blocked_reason from app.collection_control where id=1`;if(c?.blocked_reason)break;}
   }
   console.log(JSON.stringify({event:'recovery-worker-exit',tasks:attempts,bounded:bound!==Infinity}));
  }finally{await lock`select pg_advisory_unlock(${RECOVERY_LOCK[0]},${RECOVERY_LOCK[1]})`.catch(()=>{});lock.release();}
 }else throw Error('Usage: collection seed [closed-end-day] | run [--max-tasks=N]');
}finally{await closeSharedDb();}
