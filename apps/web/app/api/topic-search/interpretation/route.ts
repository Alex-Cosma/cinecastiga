import {createDb,type DbSql} from '@seap/db';
import {devlog} from '@/lib/devlog';
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
 * answer (the page runs them through /api/ask). Deterministic rules only.
 */
const g=globalThis as unknown as {__seapTopicIntentSql?:DbSql;__seapTopicIntentCache?:Map<string,{at:number;body:IntentResult}>};
const db=()=>g.__seapTopicIntentSql??=createDb(undefined,{max:2}).sql;
const CACHE_MAX=300,CACHE_MS=10*60*1000,TIME_BUDGET_MS=3000;

export async function GET(req:Request){
 let scope;try{scope=parseTopicScope(new URL(req.url).searchParams);}catch(e){return Response.json({error:(e as Error).message},{status:400});}
 if(!scope.q)return Response.json({interpretation:null});
 const now=new Date(),key=`${now.getFullYear()}|${scope.q.toLowerCase()}`,cache=(g.__seapTopicIntentCache??=new Map());
 try{
  const hit=cache.get(key);
  let result=hit&&Date.now()-hit.at<CACHE_MS?hit.body:null;
  if(!result){
   result=await Promise.race([interpretQuestion(db(),scope.q,{now}),new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('intent-timeout')),TIME_BUDGET_MS))]);
   if(cache.size>=CACHE_MAX)cache.delete(cache.keys().next().value!);
   cache.set(key,{at:Date.now(),body:result});
  }
  const place=scope.place?await resolvePlace(scope.place):null;
  return Response.json({interpretation:applyInterpretation(scope,result,place)},{headers:{'Cache-Control':'no-store'}});
 }catch(e){
  devlog('topic-interpretation',{q:scope.q,error:String(e)});
  return Response.json({error:'Nu am putut interpreta căutarea. Rezultatele folosesc cuvintele exact cum le-ai scris.'},{status:503});
 }
}
