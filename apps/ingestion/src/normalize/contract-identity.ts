import {createHash} from 'node:crypto';
import {canonicalCui} from './cui.js';
import {normalizeContractMoney,decimal} from './contract-money.js';
export interface IdentityContract {
 id:string; publicId:string; noticeId:string; noticeNo:string; authority:string; authorityCui:string|null;
 number:string|null; date:string|null; value:string|null; currency:string|null;
 title:string|null; lots:string|null; cpv:string|null; procedure:string|null; acquisition:string|null;
 winners:string[]; winnerCuis:(string|null)[];
}
export interface ArchivedAward {source:string; hash:string; rawId:string; endpoint:string; payload:Record<string,any>}
// JSONB reorders object keys; fingerprints must survive a database round trip.
const stable=(x:unknown):unknown=>Array.isArray(x)?x.map(stable):x!==null&&typeof x==='object'
 ?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>[k,stable(v)])):x;
const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(stable(x))).digest('hex');
const numeric=(x:unknown)=>{const n=decimal(x as string);return n===null?null:n.replace(/^(-?)0+(?=\d)/,'$1').replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');};
const cui=(x:unknown)=>{const c=canonicalCui(typeof x==='string'?x:null);return c.valid?c.cui:null;};
// Some source labels append a trade-register number after the fiscal token.
const authorityCui=(label:unknown)=>cui(/^((?:RO?\s*)?\d{2,10})(?:\s*\/\s*J\d+\/\d+\/\d{4})?\s+-\s+/i.exec(String(label??''))?.[1]);
const sorted=(x:(string|null)[])=>[...new Set(x)].sort();
const day=(x:unknown)=>{
 if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(x))return null;
 const d=new Date(x);return Number.isNaN(d.valueOf())?null:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
};
export function contractIdentitySignature(c:IdentityContract) {
 return hash([c.noticeNo,c.authority,c.number,c.date,numeric(c.value),c.currency,c.title,c.lots,c.cpv,c.procedure,c.acquisition,sorted(c.winners)]);
}
/** Equality is a candidate, not an approval. Archive verification never changes totals. */
export function assessContractIdentity(members:IdentityContract[],archives:ArchivedAward[]) {
 return assessPublications(members,archives,false);
}
/** Additional publications require the same complete source proof for EVERY
 * member. This does not authorize grouping a previously unapproved contract. */
export function assessContractPublicationGroup(members:IdentityContract[],archives:ArchivedAward[]) {
 return assessPublications(members,archives,true);
}
export function contractVersionAnchor(c:IdentityContract) {
 return hash([c.noticeNo,c.authority,c.number,c.date,c.currency,c.lots,c.cpv,c.procedure,c.acquisition]);
}
export function assessContractVersions(members:IdentityContract[],archives:ArchivedAward[]) {
 return assessPublications(members,archives,true,true);
}
export function assessContractSource(member:IdentityContract,archives:ArchivedAward[]) {
 return assessPublications([member],archives,true,false,true);
}
function assessPublications(members:IdentityContract[],archives:ArchivedAward[],extended:boolean,versions=false,single=false) {
 archives=[...archives].sort((a,b)=>`${a.source}:${a.rawId}:${a.hash}`.localeCompare(`${b.source}:${b.rawId}:${b.hash}`));
 const ordered=[...members].sort((a,b)=>a.id.localeCompare(b.id,'en',{numeric:true}));
 const reasons:string[]=[];
 if((extended?ordered.length<(single?1:2):ordered.length!==2)||new Set(ordered.map(x=>x.noticeId)).size!==ordered.length||new Set(ordered.map(x=>x.publicId)).size!==ordered.length||new Set(ordered.map(x=>x.id)).size!==ordered.length)reasons.push('ambiguous_multiplicity');
 if(new Set(ordered.map(versions?contractVersionAnchor:contractIdentitySignature)).size!==1)reasons.push('different_contract_fields');
 for(const c of ordered) {
  if(!c.number?.trim()||!c.date||!c.title?.trim()||!c.lots?.trim()||!c.cpv||!c.procedure||!c.acquisition||!c.authority||!cui(c.authorityCui)||!c.winners.length||c.winnerCuis.some(x=>!cui(x))||c.currency!=='RON'||numeric(c.value)===null)reasons.push('incomplete_identity');
 }
 const proofs:Record<string,unknown>[]=[];
 const procedures:string[]=[];
 for(const c of ordered) {
  const notices=archives.filter(a=>a.endpoint==='award-list:v1'&&String(a.payload.caNoticeId)===c.noticeId&&a.payload.noticeNo===c.noticeNo);
  const matches=archives.flatMap(a=>a.endpoint==='award-contracts:v1'&&String(a.payload.caNoticeId)===c.noticeId&&Array.isArray(a.payload.items)
   ?a.payload.items.filter((i:any)=>String(i.caNoticeContractId)===c.publicId).map((item:any)=>({a,item})):[]);
  // Repeated identical archives are harmless; conflicting revisions need review.
  const authorityMatches=notices.filter(a=>cui(c.authorityCui)&&authorityCui(a.payload.contractingAuthorityNameAndFN)===cui(c.authorityCui));
  if(notices.some(a=>!authorityCui(a.payload.contractingAuthorityNameAndFN)))reasons.push('archive_authority_unverified');
  if(notices.some(a=>authorityCui(a.payload.contractingAuthorityNameAndFN)&&cui(c.authorityCui)&&authorityCui(a.payload.contractingAuthorityNameAndFN)!==cui(c.authorityCui)))reasons.push('archive_authority_disagrees');
  const goodNotices=authorityMatches.filter(a=>a.payload.procedureId!=null);
  if(authorityMatches.length&&!goodNotices.length)reasons.push('missing_procedure');
  if(!goodNotices.length||!matches.length){if(!notices.length||!matches.length)reasons.push('missing_archive');continue;}
  for(const a of goodNotices)if(!String(a.payload.cpvCodeAndName??'').startsWith(c.cpv+' - ')||a.payload.sysProcedureType?.text!==c.procedure||a.payload.sysAcquisitionContractType?.text!==c.acquisition||a.payload.sysNoticeState?.text!=='Publicat')reasons.push('archive_notice_disagrees_with_core');
  const procedureIds=[...new Set(goodNotices.map(a=>String(a.payload.procedureId)))];
  if(procedureIds.length!==1){reasons.push('conflicting_procedure');continue;}
  procedures.push(procedureIds[0]!);
  const distinct=new Map<string,{a:ArchivedAward;item:any}>();
  for(const m of matches) {
   const item=m.item;
   const money=normalizeContractMoney(item);
   const sourceWinners=item.winners?.length?item.winners:item.winner?[item.winner]:[];
   const winnerIds=sorted(sourceWinners.map((w:any)=>cui(w.fiscalNumber)));
   const signature=[String(item.caNoticeId),item.noticeNo,item.contractNo,day(item.contractDate),money.originalCurrency,numeric(money.originalValue),numeric(money.valueRon),item.contractTitle,item.lotsCaption,winnerIds,item.contractType,item.conditions];
   distinct.set(hash(signature),m);
   if(String(item.caNoticeId)!==c.noticeId||item.noticeNo!==c.noticeNo||item.contractNo!==c.number||day(item.contractDate)!==c.date||money.amountStatus!=='ron'||numeric(money.valueRon)!==numeric(c.value)||item.contractTitle!==c.title||item.lotsCaption!==c.lots||JSON.stringify(winnerIds)!==JSON.stringify(sorted(c.winnerCuis.map(cui))))reasons.push('archive_disagrees_with_core');
  }
  if(distinct.size!==1){reasons.push('conflicting_archived_versions');continue;}
  const m=[...distinct.values()][0]!;
  proofs.push({contract:c.publicId,notice:c.noticeId,procedure:procedureIds[0],source:m.a.source,rawId:m.a.rawId,hash:m.a.hash,
   noticeSource:goodNotices[0]!.source,noticeHash:goodNotices[0]!.hash,
   contractType:m.item.contractType??null,conditions:m.item.conditions??null,
   ...(versions?{publishedAt:[...new Set(goodNotices.map(a=>a.payload.noticeStateDate))],
    modificationEvidence:matches.map(m=>({count:m.item.modifiedCount,hasVersions:m.item.hasModifiedVersions,hash:m.a.hash}))}:{}),
   url:`https://www.e-licitatie.ro/pub/notices/ca-notices/view-c/${c.noticeId}`});
 }
 if(procedures.length===ordered.length&&new Set(procedures).size!==1)reasons.push('different_procedures');
 if(proofs.length>=2&&new Set(proofs.map(p=>JSON.stringify([p.contractType,p.conditions]))).size!==1)reasons.push('different_source_conditions');
 let latestPublicId:string|null=null;
 if(versions&&proofs.length===ordered.length){
  const versionsByTime=ordered.map(c=>{const p=proofs.find(p=>p.contract===c.publicId)!;
   const dates=p.publishedAt as unknown[];
   if(dates.length!==1||typeof dates[0]!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(dates[0])||!Number.isFinite(Date.parse(dates[0])))reasons.push('unverified_publication_order');
   return {c,p,time:Date.parse(String(dates[0]))};
  }).sort((a,b)=>a.time-b.time||(BigInt(a.c.publicId)<BigInt(b.c.publicId)?-1:1));
  for(let i=1;i<versionsByTime.length;i++){
   const old=versionsByTime[i-1]!,next=versionsByTime[i]!;
   if(contractIdentitySignature(old.c)===contractIdentitySignature(next.c))continue;
   if(next.time<=old.time)reasons.push('ambiguous_version_order');
   const explicitAddendum=/valoare modificata prin AA /i.test(next.c.title??'')&&next.c.title!==old.c.title;
   if(!(next.p.modificationEvidence as {count:unknown;hasVersions:unknown}[]).some(e=>e.hasVersions===true&&typeof e.count==='number'&&e.count>0)&&!explicitAddendum)reasons.push('missing_amendment_evidence');
  }
  latestPublicId=versionsByTime.at(-1)?.c.publicId??null;
 }
 const unique=[...new Set(reasons)].sort();
 const status=unique.length===0?'source_verified':unique.every(r=>['missing_archive','incomplete_identity','archive_authority_unverified','missing_procedure'].includes(r))?'needs_evidence':'conflict';
 const id=hash(ordered.map(x=>x.publicId));
 return {id,fingerprint:hash([versions?3:extended?2:1,ordered,proofs,unique,status]),status,reasons:unique,members:ordered,proofs,methodology:versions?'contract-identity-3':extended?'contract-identity-2':'contract-identity-1',...(versions?{latestPublicId}:{}),decision:'unreviewed' as const};
}
