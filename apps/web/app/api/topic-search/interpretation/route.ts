import {createDb,type DbSql} from '@seap/db';
import {devlog} from '@/lib/devlog';
import {ground} from '@/lib/ask/ground';
import {intentCacheKey,intentPeriods,interpretQuestion} from '@/lib/intent/server';
import type {IntentResult} from '@/lib/intent/types';
import {applyInterpretation,narrowToPart,withLocalityInstitutions} from '@/lib/topic-search/interpretation';
import {partNotes,partOf,relatedSubjects,type SubjectPart,type TermRow} from '@/lib/topic-search/subject-parts';
import {cachedSpelling} from '@/lib/intent/vocabulary-sql';
import {spell} from '@/lib/intent/spelling';
import {CPV_TERM_SEPARATOR} from '@/lib/ask/cpv-terms';
import {localityInstitutions} from '@/lib/locality-institutions';
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
const g=globalThis as unknown as {__seapTopicIntentSql?:DbSql;__seapTopicIntentCache?:Map<string,{at:number;body:IntentResult}>;__seapTopicTerms?:{at:number;rows:Promise<TermRow[]>}};
const db=()=>g.__seapTopicIntentSql??=createDb(undefined,{max:2}).sql;
const CACHE_MAX=300,CACHE_MS=10*60*1000,TIME_BUDGET_MS=3000;
// Relative periods ("anul trecut") follow the Romanian calendar date.
const bucharestDate=(now:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);

/** The curated subjects and their CPV rows (reference.cpv_synonym, under a thousand rows), kept ten minutes. */
function termRows():Promise<TermRow[]>{
 const hit=g.__seapTopicTerms;
 if(hit&&Date.now()-hit.at<CACHE_MS)return hit.rows;
 const rows=(db()`select lower(unaccent(term)) term, cpv_prefix prefix, coalesce(exclude,false) exclude, note from reference.cpv_synonym` as unknown as Promise<TermRow[]>).then(r=>[...r]);
 const entry={at:Date.now(),rows};g.__seapTopicTerms=entry;
 rows.catch(()=>{if(g.__seapTopicTerms===entry)delete g.__seapTopicTerms;});
 return rows;
}

async function interpret(q:string,now:Date):Promise<IntentResult>{
 // The archive's checkpoint and complete days are in the key, as in /api/intent (a trend's years follow them).
 const periods=await intentPeriods(db());
 const key=intentCacheKey(q,bucharestDate(now),periods),cache=(g.__seapTopicIntentCache??=new Map()),hit=cache.get(key);
 if(hit&&Date.now()-hit.at<CACHE_MS)return hit.body;
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const body=await Promise.race([interpretQuestion(db(),q,{now,signal:controller.signal,periods}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('intent-timeout'));},TIME_BUDGET_MS);})]);
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
  let t=applyInterpretation(scope,result,place,now);
  // a locality means all of its institutions unless „Doar primăria” is chosen (owner, 13 November 2026)
  if(t.answer&&t.applied.place.startsWith('uat:')&&!scope.hall){
   const siruta=Number(t.applied.place.slice(4)),l=await localityInstitutions(db(),siruta);
   t=withLocalityInstitutions(t,siruta,l.ids);
  }
  // The subject as the engine grounds it: every CPV class counted ("Domenii incluse")
  // and the curated notes meant for people (e.g. "iluminat" includes traffic signalling).
  if(t.subject){
   // the answer may count several subjects together ("parcuri + spatii verzi")
   const term=t.answer?.total.spec.filters.cpvTerm??t.subject.term;
   const cpv=(await ground(db(),{cpvTerm:term})).cpv;
   t.subject.notes=cpv?.notes??[];
   if(t.answer&&t.answer.total.spec.filters.cpvTerm===term){t.answer.cpv=cpv?.matchedNames??[];t.answer.cpvExcluded=cpv?.excludedNames??[];}
   // One curated subject: the domains it counts and the curated subjects around it, for the word's menu; one of the
   // domains may be kept alone (`domeniu`), when „Pe scurt” counts exactly this subject (owner, 16 November 2026).
   if(cpv?.method==='synonym'&&!term.includes(CPV_TERM_SEPARATOR)){
    const parts=cpv.matchedNames.map(l=>partOf(l,cpv.excludePrefixes??[])).filter((x):x is SubjectPart=>x!==null);
    const counted=t.answer?.total.spec.filters.cpvTerm===term;
    const [rows,spelling]=await Promise.all([termRows(),cachedSpelling(db())]);
    t.subject.parts=parts.map(x=>({...x,pick:x.pick&&counted&&parts.length>1}));
    t.subject.related=relatedSubjects(term,rows).map(r=>({...r,label:spell(r.term,spelling)}));
    const chosen=scope.domain?t.subject.parts.find(x=>x.code===scope.domain&&x.pick):undefined;
    if(chosen&&t.answer){
     const notes=partNotes(term,chosen,rows),all=cpv.matchedNames,label=all.find(l=>l.endsWith(`(${chosen.code})`));
     t=narrowToPart(t,chosen);
     t.subject!.notes=notes;t.answer!.cpv=label?[label]:[];t.answer!.cpvExcluded=[];
    }
   }
  }
  return Response.json({interpretation:t},{headers:{'Cache-Control':'no-store'}});
 }catch(e){
  devlog('topic-interpretation',{q:scope.q,error:String(e)});
  return Response.json({error:'Nu am putut interpreta căutarea. Rezultatele folosesc cuvintele exact cum le-ai scris.'},{status:503});
 }
}
