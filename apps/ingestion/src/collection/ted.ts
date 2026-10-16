import {TED_OJS,type DbSql} from '@seap/db';
import {extractTedNotice} from '../normalize/ted.js';
import {tedArchiveDocument} from '../scrape/ted/notices.js';
import type {TedPackageCandidate} from '../scrape/ted/package.js';
import {task,type PageResult,type Task,type TaskPlan} from './plan.js';

/**
 * TED as a collection stream: Romanian contract award notices (eForms
 * `can-standard`) published in the EU Official Journal (OJ S). Same gate, proxies,
 * quiet window, ledger and retries as SEAP; failures pause only `ted`.
 *
 * Source: the OJ S DAILY PACKAGE (`ted.europa.eu/packages/daily/{yyyy}{nnnnn}`,
 * one .tar.gz per issue with every notice of the day). The per-notice XML route is
 * WAF-challenged from the proxies and is no longer used.
 *
 * - `ted-package` {ojs}: download one issue, archive its Romanian award notices
 *   exactly like the manual import (source 'ted', `ted-eforms:v1`), then queue the
 *   next issue (ojs+1) and a verification search of the issue's publication day.
 *   404 = issue not published yet: the attempt completes without documents and the
 *   hourly TED tick (advance.ts) tries again, at most once per hour.
 * - `ted-list` {ojs, day}: the TED search API for that publication day; the last
 *   page compares the exact set of publication numbers with the package. A
 *   difference is a visible, isolated gap (failed task), never a silent success.
 */
export const TED_PAGE_SIZE=100;
/** A failed day verification is searched again once a day for this many days (late TED indexing). */
export const TED_OVERLAP_DAYS=3;
export const TED_NOTICE_TYPE='can-standard';
const ISO=/^\d{4}-\d{2}-\d{2}$/,ATTEMPT=/^\d{4}-\d{2}-\d{2}(?:T\d{2})?$/,PUBLICATION=/^\d{1,8}-\d{4}$/;
export const LEGACY_TED_TASK='TED: sarcină veche (XML pe notificare sau căutare fără pachet), înlocuită de pachetul zilnic OJ S. Rulează ted-enable pentru migrare; nu s-a făcut nicio cerere.';
export class TedVerificationError extends Error {constructor(message:string){super(message);this.name='TedVerificationError';}}

export function validateTedScope(t:Pick<Task,'kind'|'stream'|'params'>){
 const p=t.params,ted=t.stream==='ted';
 if(!ted&&(p.publicationNumber!==undefined||p.publicationDate!==undefined||p.tedScan!==undefined||p.ojs!==undefined||t.kind.startsWith('ted-')))throw Error('TED: parametri în afara fluxului TED.');
 if(!ted)return;
 if(t.kind==='ted-xml')throw Error(LEGACY_TED_TASK);
 if(!p.tedScan||!(t.kind==='ted-package'?ATTEMPT:ISO).test(p.tedScan))throw Error('TED: lipsește scanarea zilei.');
 if(!p.ojs||!validOjs(p.ojs))throw Error('TED: număr OJ S nevalid.');
 if(t.kind==='ted-list'&&(!p.from||p.from!==p.to||!ISO.test(p.from)||!Number.isSafeInteger(p.page)||p.page<0||p.page>50))throw Error('TED: căutarea trebuie să acopere o singură zi.');
 else if(t.kind==='ted-package'&&(p.page!==0||p.from!==undefined||p.to!==undefined))throw Error('TED: pachetul are un singur număr OJ S.');
 else if(t.kind!=='ted-list'&&t.kind!=='ted-package')throw Error('TED: tip de sarcină necunoscut.');
}

export const validOjs=(ojs:string)=>TED_OJS.test(ojs)&&Number(ojs.slice(4))>=1;
/** '202600200' → '200/2026', the OJ S issue as printed in eForms `efbc:GazetteID`. */
export const ojsLabel=(ojs:string)=>`${Number(ojs.slice(4))}/${ojs.slice(0,4)}`;
export const ojsOf=(year:number,issue:number)=>`${year}${String(issue).padStart(5,'0')}`;
/** eForms `efbc:GazetteID` ('200/2026') → '202600200'; null when absent or malformed. */
export const gazetteOjs=(g:string|null|undefined)=>{const m=/^\s*(\d{1,5})\/(\d{4})\s*$/.exec(g??'');return m&&Number(m[1])>=1?ojsOf(Number(m[2]),Number(m[1])):null;};
export const nextOjs=(ojs:string)=>Number(ojs.slice(4))>=99999?null:ojsOf(Number(ojs.slice(0,4)),Number(ojs.slice(4))+1);
export const tedPackageTask=(batch:string,ojs:string,attempt:string,priority=10)=>task(batch,'ted','ted-package',{ojs,tedScan:attempt,page:0},priority);
export const tedVerifyTask=(batch:string,ojs:string,day:string,scan:string,priority=10)=>task(batch,'ted','ted-list',{from:day,to:day,ojs,tedScan:scan,page:0},priority);

export function planTedTask(t:Task,value:unknown,previous:PageResult[]):TaskPlan{
 validateTedScope(t);
 return t.kind==='ted-list'?planTedList(t,value,previous):planTedPackage(t,value);
}

/** Exact day population: same total on every page, no repeats, no foreign days. */
function planTedList(t:Task,value:unknown,previous:PageResult[]):TaskPlan{
 const day=t.params.from!,page=t.params.page;
 const e=value as {notices?:unknown;totalNoticeCount?:unknown};
 if(!e||!Array.isArray(e.notices)||!Number.isSafeInteger(e.totalNoticeCount)||Number(e.totalNoticeCount)<0)throw Error('TED: structura căutării nu este validă.');
 const total=Number(e.totalNoticeCount);
 if(total>TED_PAGE_SIZE*50)throw Error('TED: o singură zi depășește plafonul de paginare.');
 if(previous.length!==page)throw Error('TED: lipsește o pagină anterioară din jurnal.');
 if(previous.some(p=>p.total!==total))throw Error('TED: totalul s-a modificat în timpul paginării.');
 const notices=e.notices as Record<string,unknown>[];
 const numbers=notices.map(n=>n?.['publication-number']);
 if(numbers.some(n=>typeof n!=='string'||!PUBLICATION.test(n)))throw Error('TED: rezultat fără număr de publicare valid.');
 const identities=numbers as string[],before=previous.flatMap(p=>p.identities??[]);
 if(new Set([...before,...identities]).size!==before.length+identities.length)throw Error('TED: paginare instabilă (anunț repetat între pagini).');
 for(const n of notices){
  const date=n['publication-date'],type=n['notice-type'];
  if(typeof date==='string'&&date.slice(0,10)!==day)throw Error('TED: anunț din afara zilei solicitate.');
  if(type!==undefined&&type!==TED_NOTICE_TYPE)throw Error('TED: tip de anunț în afara fluxului.');
 }
 const expected=Math.min(TED_PAGE_SIZE,Math.max(0,total-page*TED_PAGE_SIZE));
 if(identities.length!==expected)throw Error('TED: numărul de anunțuri nu corespunde totalului.');
 const children=(page+1)*TED_PAGE_SIZE<total?[task(t.batch_id,'ted','ted-list',{...t.params,page:page+1},0)]:[];
 return {status:'complete',result:{total,ids:[],identities},docs:[],children};
}

/** `{yyyymmdd}_{yyyy}{n}.tar.gz` must name the requested issue; returns its publication day. */
export function tedPackageDay(filename:string|null,ojs:string){
 const m=filename?/^(\d{4})(\d{2})(\d{2})_(\d{4})(\d{1,5})\.tar\.gz$/.exec(filename):null;
 if(!m)throw Error(`TED: pachetul OJ S ${ojsLabel(ojs)} nu are numele de fișier așteptat (${filename??'lipsă'}).`);
 const [,y,mo,d,year,issue]=m,day=`${y}-${mo}-${d}`;
 if(`${year}`!==ojs.slice(0,4)||Number(issue)!==Number(ojs.slice(4)))throw Error(`TED: am cerut OJ S ${ojsLabel(ojs)}, dar pachetul primit este ${Number(issue)}/${year}.`);
 const parsed=new Date(`${day}T00:00:00Z`);
 if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==day||y!==year)throw Error(`TED: data pachetului OJ S ${ojsLabel(ojs)} nu este validă (${day}).`);
 return day;
}

export interface TedPackageFetch {status:number;filename:string|null;files?:number;xmlFiles?:number;candidates?:TedPackageCandidate[]}
/** Archive only notices the nightly parser reads back: an eForms `can-standard` of this
 * issue/day with a Romanian contracting party (the TED search's buyer-country="ROU"). */
function planTedPackage(t:Task,value:unknown):TaskPlan{
 const ojs=t.params.ojs!,v=value as TedPackageFetch;
 if(!v||!Number.isSafeInteger(v.status))throw Error('TED: răspunsul pachetului nu este valid.');
 if(v.status===404)return {status:'complete',result:{total:0,ids:[],ojs,published:false} as PageResult,docs:[],children:[]};
 if(v.status!==200||!Array.isArray(v.candidates))throw Error(`TED: pachetul OJ S ${ojsLabel(ojs)} a răspuns HTTP ${v.status}.`);
 const day=tedPackageDay(v.filename,ojs);
 if(!v.xmlFiles)throw Error(`TED: pachetul OJ S ${ojsLabel(ojs)} nu conține fișiere XML.`);
 const docs=[],identities:string[]=[];let otherCountry=0,otherType=0;
 for(const c of v.candidates){
  let n:ReturnType<typeof extractTedNotice>;
  try{n=extractTedNotice(c.xml);}catch{throw Error(`TED: fișierul ${c.name} din OJ S ${ojsLabel(ojs)} nu poate fi citit.`);}
  if(!n.noticeType)throw Error(`TED: fișierul ${c.name} din OJ S ${ojsLabel(ojs)} nu poate fi citit (fără tip de anunț).`);
  if(n.noticeType!==TED_NOTICE_TYPE){otherType++;continue;}
  const publication=n.publicationNumber;
  if(!publication||!PUBLICATION.test(publication))throw Error(`TED: fișierul ${c.name} nu are număr de publicare valid.`);
  const file=/(?:^|\/)0*(\d+)_(\d{4})\.xml$/i.exec(c.name);
  if(file&&`${file[1]}-${file[2]}`!==publication)throw Error(`TED: fișierul ${c.name} poartă alt număr de publicare (${publication}).`);
  if(gazetteOjs(n.gazetteId)!==ojs)throw Error(`TED: anunțul ${publication} aparține altui număr OJ S (${n.gazetteId??'lipsă'}), nu ${ojsLabel(ojs)}.`);
  if(n.publicationDate?.toISOString().slice(0,10)!==day)throw Error(`TED: anunțul ${publication} are altă dată de publicare decât pachetul (${day}).`);
  if(!n.buyerOrgIds.some(id=>n.orgs.get(id)?.country==='ROU')){otherCountry++;continue;}
  docs.push(tedArchiveDocument({'publication-date':day},publication,TED_NOTICE_TYPE,c.xml));identities.push(publication);
 }
 if(new Set(identities).size!==identities.length)throw Error(`TED: OJ S ${ojsLabel(ojs)} conține același anunț de mai multe ori.`);
 identities.sort();
 const next=nextOjs(ojs),children=[tedVerifyTask(t.batch_id,ojs,day,day),...(next?[tedPackageTask(t.batch_id,next,t.params.tedScan!)]:[])];
 return {status:'complete',result:{total:identities.length,ids:[],identities,ojs,published:true,publicationDate:day,files:v.files,xmlFiles:v.xmlFiles,candidates:v.candidates.length,otherCountry,otherType} as PageResult,docs,children};
}

/** On the last page of a day verification: the search's exact population must equal the
 * package's archived Romanian notices. Deterministic (sets of publication numbers). */
export async function verifyTedDay(tx:DbSql,t:Task,plan:TaskPlan){
 if(t.kind!=='ted-list'||plan.children.some(c=>c.kind==='ted-list'))return null;
 const ojs=t.params.ojs!,day=t.params.from!,result=plan.result as PageResult;
 const pages=await tx`select result from app.collection_tasks where batch_id=${t.batch_id} and partition=${t.partition} and status='complete' and id<>${t.id!} order by (params->>'page')::int`;
 const search=[...pages.flatMap(p=>(p.result as PageResult).identities??[]),...result.identities??[]];
 const [pkg]=await tx`select id,result from app.collection_tasks where batch_id=${t.batch_id} and stream='ted' and kind='ted-package' and params->>'ojs'=${ojs} and status='complete' and result->>'published'='true' order by finished_at desc,id desc limit 1`;
 if(!pkg)throw new TedVerificationError(`TED: verificare imposibilă pentru ${day}: pachetul OJ S ${ojsLabel(ojs)} nu este arhivat.`);
 const archived=((pkg.result as PageResult).identities??[]) as string[];
 if((pkg.result as {publicationDate?:string}).publicationDate!==day)throw new TedVerificationError(`TED: verificare imposibilă: pachetul OJ S ${ojsLabel(ojs)} nu este din ${day}.`);
 const inPackage=new Set(archived),inSearch=new Set(search);
 const missing=search.filter(p=>!inPackage.has(p)).sort(),extra=archived.filter(p=>!inSearch.has(p)).sort();
 const list=(xs:string[])=>xs.slice(0,5).join(', ')+(xs.length>5?` și încă ${xs.length-5}`:'');
 if(missing.length||extra.length)throw new TedVerificationError(`TED: verificare eșuată pentru OJ S ${ojsLabel(ojs)} (${day}): pachetul are ${archived.length} anunțuri românești, căutarea TED ${search.length}.${missing.length?` Lipsesc din pachet: ${list(missing)}.`:''}${extra.length?` Doar în pachet: ${list(extra)}.`:''}`);
 return {ojs,day,packageTask:Number(pkg.id),package:archived.length,search:search.length,match:true};
}

/** Latest OJ S issue already archived as an eForms award notice, from the data
 * (efbc:GazetteID of the most recent publication numbers) with its publication day. */
export async function latestArchivedTedIssue(q:DbSql):Promise<{ojs:string;day:string|null}|null>{
 const rows=await q`select substring(payload->>'xml' from '<efbc:GazetteID[^>]*>\\s*([0-9]{1,5}/[0-9]{4})\\s*<') gazette,
   coalesce(left(payload->>'publication-date',10),substring(payload->>'xml' from '<efbc:PublicationDate>([0-9]{4}-[0-9]{2}-[0-9]{2})')) as day
  from (select payload from raw.raw_documents
   where source='ted' and endpoint_version='ted-eforms:v1' and external_id ~ '^can-standard:[0-9]+-[0-9]{4}$'
   order by split_part(split_part(external_id,':',2),'-',2)::int desc,split_part(split_part(external_id,':',2),'-',1)::int desc
   limit 50) latest`;
 let best:{ojs:string;day:string|null}|null=null;
 for(const r of rows){
  const ojs=gazetteOjs(r.gazette==null?null:String(r.gazette)),day=r.day&&ISO.test(String(r.day))?String(r.day):null;
  if(!ojs)continue;
  if(!best||ojs>best.ojs)best={ojs,day};
 }
 return best;
}

export interface TedAttempt {ojs:string;status:string;published:boolean|null;finishedMs:number|null}
/** Which OJ S issues to try now. Never guessed from dates: the next number after the
 * latest archived issue; after a 404 in a later (Romanian) year, also the new year's first
 * issue. One attempt in flight; a finished attempt is repeated at most once per hour. */
export function tedPackageCandidates({attempts,nowMs,year}:{attempts:TedAttempt[];nowMs:number;year:number}):string[]{
 if(!attempts.length||attempts.some(a=>a.status==='pending'||a.status==='running'))return [];
 const published=attempts.filter(a=>a.status==='complete'&&a.published).map(a=>a.ojs).sort(),frontier=published.at(-1);
 const candidates:string[]=[];
 if(frontier){
  const next=nextOjs(frontier),frontierYear=Number(frontier.slice(0,4));
  if(next)candidates.push(next);
  if(year>frontierYear&&(!next||attempts.some(a=>a.ojs===next&&a.status==='complete'&&a.published===false)))candidates.push(ojsOf(frontierYear+1,1));
 }else candidates.push([...attempts].sort((a,b)=>a.ojs.localeCompare(b.ojs))[0]!.ojs);
 return candidates.filter(ojs=>{
  const last=attempts.filter(a=>a.ojs===ojs).map(a=>a.finishedMs??0).sort((a,b)=>b-a)[0];
  return last===undefined||nowMs-last>=3600_000;
 });
}

export interface TedVerification {ojs:string;day:string;scan:string;status:string;error:string|null}
/** A day whose latest verification failed is searched again on each of the next
 * TED_OVERLAP_DAYS days (TED may index late); returns the new scans to queue. */
export function tedReverifications(rows:TedVerification[],today:string):{ojs:string;day:string}[]{
 const latest=new Map<string,TedVerification[]>();
 for(const r of rows){const k=r.ojs,cur=latest.get(k);if(!cur||r.scan>cur[0]!.scan)latest.set(k,[r]);else if(r.scan===cur[0]!.scan)cur.push(r);}
 const out:{ojs:string;day:string}[]=[];
 for(const [ojs,scan] of latest){
  const {day,scan:label}=scan[0]!;
  if(label>=today||scan.some(r=>r.status==='pending'||r.status==='running'))continue;
  if(!scan.some(r=>r.status==='failed'&&r.error?.startsWith('TED: verificare')))continue;
  const last=new Date(`${day}T00:00:00Z`);last.setUTCDate(last.getUTCDate()+TED_OVERLAP_DAYS);
  if(today<=last.toISOString().slice(0,10))out.push({ojs,day});
 }
 return out;
}
