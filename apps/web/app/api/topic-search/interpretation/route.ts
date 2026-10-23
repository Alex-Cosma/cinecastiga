import {createDb,type DbSql} from '@seap/db';
import {devlog} from '@/lib/devlog';
import {ground} from '@/lib/ask/ground';
import {interpretQuestion} from '@/lib/intent/server';
import type {IntentResult} from '@/lib/intent/types';
import {applyInterpretation} from '@/lib/topic-search/interpretation';
import {resolvePlace} from '@/lib/topic-search/server';
import {parseTopicScope} from '@/lib/topic-search/shared';
export const dynamic='force-dynamic';

/**
 * How /cauta understood the words (GET with the page's own parameters): the
 * subject, the place and period taken from the words and applied as filters,
 * the other readings to choose from, and the Ask specs of the short subject
 * answer (the page runs them through /api/ask) with the CPV classes they
 * include. Deterministic rules only.
 */
const g=globalThis as unknown as {__seapTopicIntentSql?:DbSql;__seapTopicIntentCache?:Map<string,{at:number;body:IntentResult}>};
const db=()=>g.__seapTopicIntentSql??=createDb(undefined,{max:2}).sql;
const CACHE_MAX=300,CACHE_MS=10*60*1000,TIME_BUDGET_MS=3000;
// Relative periods ("anul trecut") follow the Romanian calendar date.
const bucharestDate=(now:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);

async function interpret(q:string,now:Date):Promise<IntentResult>{
 const key=`${bucharestDate(now)}|${q.toLowerCase()}`,cache=(g.__seapTopicIntentCache??=new Map()),hit=cache.get(key);
 if(hit&&Date.now()-hit.at<CACHE_MS)return hit.body;
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const body=await Promise.race([interpretQuestion(db(),q,{now,signal:controller.signal}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('intent-timeout'));},TIME_BUDGET_MS);})]);
  if(cache.size>=CACHE_MAX)cache.delete(cache.keys().next().value!);
  cache.set(key,{at:Date.now(),body});
  return body;
 }finally{if(timer)clearTimeout(timer);}
}

export async function GET(req:Request){
 let scope;try{scope=parseTopicScope(new URL(req.url).searchParams);}catch(e){return Response.json({error:(e as Error).message},{status:400});}
 if(!scope.q)return Response.json({interpretation:null});
 try{
  const now=new Date(),result=await interpret(scope.q,now);
  const place=scope.place?await resolvePlace(scope.place):null;
  const t=applyInterpretation(scope,result,place,now);
  // The subject as the engine grounds it: every CPV class counted ("Domenii incluse")
  // and the curated notes meant for people (e.g. "iluminat" includes traffic signalling).
  if(t.subject){
   // the answer may count several subjects together ("parcuri + spatii verzi")
   const term=t.answer?.total.spec.filters.cpvTerm??t.subject.term;
   const cpv=(await ground(db(),{cpvTerm:term})).cpv;
   t.subject.notes=cpv?.notes??[];
   if(t.answer&&t.answer.total.spec.filters.cpvTerm===term){t.answer.cpv=cpv?.matchedNames??[];t.answer.cpvExcluded=cpv?.excludedNames??[];}
  }
  return Response.json({interpretation:t},{headers:{'Cache-Control':'no-store'}});
 }catch(e){
  devlog('topic-interpretation',{q:scope.q,error:String(e)});
  return Response.json({error:'Nu am putut interpreta căutarea. Rezultatele folosesc cuvintele exact cum le-ai scris.'},{status:503});
 }
}
