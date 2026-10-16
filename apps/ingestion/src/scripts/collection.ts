import {activateNationalDa} from '../collection/da-activation.js';
import {advanceRecovery} from '../collection/advance.js';
import {enqueueAwardDetailBackfill,setBackgroundLanes} from '../collection/award-backfill.js';
import {enableTedCollection} from '../collection/ted-activation.js';
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
 else if(args[0]==='follow-latest'){console.log(JSON.stringify({scope:await advanceRecovery(q,{enable:true}),networkRequests:0}));}
 else if(args[0]==='ted-enable'){console.log(JSON.stringify({activation:await enableTedCollection(q),networkRequests:0}));}
 else if(args[0]==='national-da'){console.log(JSON.stringify({activation:await activateNationalDa(q),networkRequests:0}));}
 else if(args[0]==='backfill-award-details'){
  const limitArg=args.find(a=>a.startsWith('--limit='));if(!limitArg)throw Error('--limit=N is required');
  if(args.slice(1).some(a=>!a.startsWith('--limit=')&&a!=='--pilot'))throw Error('Usage: collection backfill-award-details --limit=N [--pilot]');
  const {queued,byTypeVersion,...rest}=await enqueueAwardDetailBackfill(q,{limit:Number(limitArg.split('=')[1]),pilot:args.includes('--pilot')});
  console.log(JSON.stringify({queued,byTypeVersion,...rest,networkRequests:0}));
 }
 else if(args[0]==='background-lanes'){
  if(args.length!==2||!/^(10|[0-9])$/.test(args[1]!))throw Error('Usage: collection background-lanes <0..10>');
  console.log(JSON.stringify({...await setBackgroundLanes(q,Number(args[1])),networkRequests:0}));
 }
 else if(args[0]==='run'){
  const boundArg=args.find(a=>a.startsWith('--max-tasks='));const bound=boundArg?Number(boundArg.split('=')[1]):Infinity;
  if(!(bound>0)||bound!==Infinity&&!Number.isSafeInteger(bound))throw Error('Invalid task bound');
  const lock=await q.reserve();
  try{
   const [l]=await lock`select pg_try_advisory_lock(${RECOVERY_LOCK[0]},${RECOVERY_LOCK[1]}) acquired,pg_backend_pid() pid`;
   if(!l?.acquired)throw Error('Recovery worker already running');
   await recoverInterrupted(q);let attempts=0;
   const client=getElicitatieClient();
   let nextAdvance=0;
   const lane=async(index:number)=>{
    while(!stopping&&attempts<bound){
     const [session]=await lock`select pg_backend_pid() pid`;if(session?.pid!==l.pid){stopping=true;throw Error('Recovery lock session lost');}
     if(index===0&&bound===Infinity&&Date.now()>=nextAdvance){await advanceRecovery(q);nextAdvance=Date.now()+60000;}
     // Start work only in lanes enabled by the current operator setting.
     if(index>0){const [p]=await q`select enabled,max_in_flight from app.collection_proxy_control where id=1`;if(!p?.enabled||Number(p.max_in_flight)<=index){await sleep(1000);continue;}}
     if(await recoveryStep(q,t=>fetchTask(client,t),`${index}`))attempts++;
     else{if(bound!==Infinity)break;await sleep(1000);}
     if(bound!==Infinity){const [c]=await q`select blocked_reason from app.collection_control where id=1`;if(c?.blocked_reason)break;}
    }
   };
   // Keep the lifetime lock until ALL lanes drain, including if one lane fails.
   const results=await Promise.allSettled(Array.from({length:bound===Infinity?10:1},(_,i)=>lane(i).catch(error=>{stopping=true;throw error;})));
   const failed=results.find(r=>r.status==='rejected');if(failed?.status==='rejected')throw failed.reason;
   console.log(JSON.stringify({event:'recovery-worker-exit',tasks:attempts,bounded:bound!==Infinity}));
  }finally{await lock`select pg_advisory_unlock(${RECOVERY_LOCK[0]},${RECOVERY_LOCK[1]})`.catch(()=>{});lock.release();}
 }else throw Error('Usage: collection seed [closed-end-day] | follow-latest | national-da | ted-enable | backfill-award-details --limit=N [--pilot] | background-lanes <0..10> | run [--max-tasks=N]');
}finally{await closeSharedDb();}
