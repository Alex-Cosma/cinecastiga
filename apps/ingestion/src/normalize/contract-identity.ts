import {createHash} from 'node:crypto';
import {canonicalCui} from './cui.js';
import {normalizeContractMoney,decimal} from './contract-money.js';
import {reviewedWinnerIdentity} from './reviewed-winner.js';
import {normCountry,normForeignId} from './foreign.js';
export interface IdentityContract {
 id:string; publicId:string; noticeId:string; noticeNo:string; authority:string; authorityCui:string|null;
 number:string|null; date:string|null; value:string|null; currency:string|null;
 title:string|null; lots:string|null; cpv:string|null; procedure:string|null; acquisition:string|null;
 winners:string[]; winnerCuis:(string|null)[];
 /** Explicit country + registration ID for core winners without a valid RO CUI.
  * Omitted for ordinary Romanian winners to preserve historical snapshots. */
 winnerForeignIds?:{entityId:string;country:string;id:string}[];
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
function foreignKey(country:unknown,id:unknown) {
 const c=normCountry(typeof country==='string'?country:null),n=normForeignId(typeof id==='string'?id:null);
 return c&&/^[A-Z]{2}$/.test(c)&&c!=='RO'&&n&&/\d/.test(n)?`foreign:${c}:${n}`:null;
}
/** Owner decision 2026-10-12: a Spanish CIF with and without its leading
 * entity-type letter (B84840685 / 84840685) is the same registration when the
 * country already matches. Used ONLY for equality; proofs keep the source form,
 * so fingerprints of existing approvals do not change. */
const comparableKey=(k:string|null)=>k?.replace(/^foreign:ES:[ABCDEFGHJNPQRSUVW](\d{8})$/,'foreign:ES:$1')??null;
const comparableKeys=(x:(string|null)[])=>sorted(x.map(comparableKey));
/** Procedure types SEAP publishes without a prior procedure: the list carries
 * no procedureId by design and contracts have no lot caption. The award notice
 * number (with authority, contract number, date and winners) is the anchor. */
const NO_PROCEDURE_ID_TYPES=new Set(['Negociere fara publicare prealabila','Norme proprii (Anexa 2)','Procedura simplificata proprie']);
/** Explicit amendment wording in a later publication title. */
const ADDENDUM_TITLE=/valoare modificata prin AA |act\s*adi[tț]ional|\bact\s*adit\b|\bact\s*ad\.?\s+(?:dimin|major|supl)|\bad\s+(?:diminuare|majorare|suplimentare)\b|\bsuplim(?:entare)?\s+AC\b/i;
function coreWinnerKeys(c:IdentityContract) {
 return c.winners.map((entityId,i)=>{
  const fiscal=cui(c.winnerCuis[i]);if(fiscal)return fiscal;
  const foreign=c.winnerForeignIds?.filter(f=>f.entityId===entityId)??[];
  return foreign.length===1?foreignKey(foreign[0]!.country,foreign[0]!.id):null;
 });
}
function sourceWinnerInput(w:any) {
 const name=w?.address?.officialName??w?.name;
 return {sicapId:Number.isSafeInteger(w?.entityId)?w.entityId:null,
  cuiRaw:typeof w?.fiscalNumber==='string'?w.fiscalNumber:null,nameDisplay:typeof name==='string'?name:'(necunoscut)'};
}
function sourceWinnerKey(w:any,contractId:string) {
 const reviewed=reviewedWinnerIdentity(Number(contractId),sourceWinnerInput(w));
 return cui(reviewed.cuiRaw)??foreignKey(w?.address?.countryItem?.localeKey??w?.address?.countryItem?.text,reviewed.cuiRaw);
}
const romanianDate = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'});
const day=(x:unknown)=>{
 if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(x))return null;
 const d=new Date(x);return Number.isNaN(d.valueOf())?null:romanianDate.format(d);
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
export type VersionChangeKind='value_changed_without_amendment'|'winners_completed'|'addendum_in_title';
/** Owner decisions 2026-10-12 for a later publication of the same version
 * anchor that SEAP does not flag as modified. Only these changes are accepted;
 * the latest verified publication is then counted once, earlier ones stay visible.
 * - value changed, title and winners identical: the latest published value counts;
 * - same value and title, winners only added (earlier set strictly contained);
 * - title names an amendment (act adițional, ad diminuare…), winners identical.
 * A changed title without amendment wording (e.g. renumbered) stays excluded. */
export function versionChangeKind(old:IdentityContract,next:IdentityContract,valueChanged:boolean):VersionChangeKind|null {
 const ow=sorted(old.winners),nw=sorted(next.winners);
 const sameWinners=JSON.stringify(ow)===JSON.stringify(nw);
 const titleChanged=(old.title??'')!==(next.title??'');
 if(!titleChanged&&sameWinners&&valueChanged)return 'value_changed_without_amendment';
 if(!titleChanged&&!valueChanged&&!sameWinners&&ow.length>0&&ow.every(w=>nw.includes(w)))return 'winners_completed';
 if(titleChanged&&sameWinners&&ADDENDUM_TITLE.test(next.title??''))return 'addendum_in_title';
 return null;
}
function assessPublications(members:IdentityContract[],archives:ArchivedAward[],extended:boolean,versions=false,single=false) {
 archives=[...archives].sort((a,b)=>`${a.source}:${a.rawId}:${a.hash}`.localeCompare(`${b.source}:${b.rawId}:${b.hash}`));
 const ordered=[...members].sort((a,b)=>a.id.localeCompare(b.id,'en',{numeric:true}));
 const reasons:string[]=[];
 if((extended?ordered.length<(single?1:2):ordered.length!==2)||new Set(ordered.map(x=>x.noticeId)).size!==ordered.length||new Set(ordered.map(x=>x.publicId)).size!==ordered.length||new Set(ordered.map(x=>x.id)).size!==ordered.length)reasons.push('ambiguous_multiplicity');
 if(new Set(ordered.map(versions?contractVersionAnchor:contractIdentitySignature)).size!==1)reasons.push('different_contract_fields');
 for(const c of ordered) {
  if(!c.number?.trim()||!c.date||!c.title?.trim()||(!c.lots?.trim()&&!NO_PROCEDURE_ID_TYPES.has(c.procedure??''))||!c.cpv||!c.procedure||!c.acquisition||!c.authority||!cui(c.authorityCui)||!c.winners.length||c.winnerCuis.length!==c.winners.length||coreWinnerKeys(c).some(x=>!x)||c.currency!=='RON'||numeric(c.value)===null)reasons.push('incomplete_identity');
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
  const noProcedureId=authorityMatches.length>0&&authorityMatches.every(a=>a.payload.procedureId==null&&NO_PROCEDURE_ID_TYPES.has(a.payload.sysProcedureType?.text)&&a.payload.sysProcedureType?.text===c.procedure);
  const goodNotices=authorityMatches.filter(a=>a.payload.procedureId!=null||noProcedureId);
  if(authorityMatches.length&&!goodNotices.length)reasons.push('missing_procedure');
  if(!goodNotices.length||!matches.length){if(!notices.length||!matches.length)reasons.push('missing_archive');continue;}
  for(const a of goodNotices)if(!String(a.payload.cpvCodeAndName??'').startsWith(c.cpv+' - ')||a.payload.sysProcedureType?.text!==c.procedure||a.payload.sysAcquisitionContractType?.text!==c.acquisition||a.payload.sysNoticeState?.text!=='Publicat')reasons.push('archive_notice_disagrees_with_core');
  const procedureIds=[...new Set(goodNotices.map(a=>a.payload.procedureId!=null?String(a.payload.procedureId):`notice:${c.noticeNo}`))];
  if(procedureIds.length!==1){reasons.push('conflicting_procedure');continue;}
  procedures.push(procedureIds[0]!);
  const distinct=new Map<string,{a:ArchivedAward;item:any}>();
  for(const m of matches) {
   const item=m.item;
   const money=normalizeContractMoney(item);
   const sourceWinners=item.winners?.length?item.winners:item.winner?[item.winner]:[];
   const winnerIds=sorted(sourceWinners.map((w:any)=>sourceWinnerKey(w,c.publicId)));
   const signature=[String(item.caNoticeId),item.noticeNo,item.contractNo,day(item.contractDate),money.originalCurrency,numeric(money.originalValue),numeric(money.valueRon),item.contractTitle,item.lotsCaption,comparableKeys(winnerIds),item.contractType,item.conditions];
   distinct.set(hash(signature),m);
   if(String(item.caNoticeId)!==c.noticeId||item.noticeNo!==c.noticeNo||item.contractNo!==c.number||day(item.contractDate)!==c.date||!['ron','converted'].includes(money.amountStatus)||numeric(money.valueRon)!==numeric(c.value)||item.contractTitle!==c.title||(item.lotsCaption??'')!==(c.lots??'')||JSON.stringify(comparableKeys(winnerIds))!==JSON.stringify(comparableKeys(coreWinnerKeys(c))))reasons.push('archive_disagrees_with_core');
  }
  if(distinct.size!==1){reasons.push('conflicting_archived_versions');continue;}
  const m=[...distinct.values()][0]!;
  const money=normalizeContractMoney(m.item);
  const sourceWinners=m.item.winners?.length?m.item.winners:m.item.winner?[m.item.winner]:[];
  const winnerKeys=sorted(sourceWinners.map((w:any)=>sourceWinnerKey(w,c.publicId)));
  const reviewedWinners=sourceWinners.flatMap((w:any)=>{
   const input=sourceWinnerInput(w);
   const output=reviewedWinnerIdentity(Number(c.publicId),input);
   return output!==input?[{original:input,reviewed:output,rule:'reviewed-winner-20261008'}]:[];
  });
  proofs.push({contract:c.publicId,notice:c.noticeId,procedure:procedureIds[0],source:m.a.source,rawId:m.a.rawId,hash:m.a.hash,
   noticeSource:goodNotices[0]!.source,noticeHash:goodNotices[0]!.hash,
   contractType:m.item.contractType??null,conditions:m.item.conditions??null,
   ...(money.amountStatus==='converted'?{money:{originalCurrency:money.originalCurrency,originalValue:numeric(money.originalValue),valueRon:numeric(money.valueRon),currencyRate:numeric(money.currencyRate)}}:{}),
   ...(winnerKeys.some(k=>k?.startsWith('foreign:'))?{winnerKeys}:{}),
   ...(reviewedWinners.length?{reviewedWinners}:{}),
   ...(versions?{publishedAt:[...new Set(goodNotices.map(a=>a.payload.noticeStateDate))],
    modificationEvidence:matches.map(m=>({count:m.item.modifiedCount,hasVersions:m.item.hasModifiedVersions,hash:m.a.hash}))}:{}),
   url:`https://www.e-licitatie.ro/pub/notices/ca-notices/view-c/${c.noticeId}`});
 }
 if(procedures.length===ordered.length&&new Set(procedures).size!==1)reasons.push('different_procedures');
 if(proofs.length>=2&&new Set(proofs.map(p=>JSON.stringify([p.contractType,p.conditions]))).size!==1)reasons.push('different_source_conditions');
 const moneyIdentity=(p:Record<string,unknown>)=>{
  const m=ordered.find(c=>c.publicId===p.contract)!;
  const monetary=p.money as {originalCurrency:string;originalValue:string}|undefined;
  return [monetary?.originalCurrency??'RON',monetary?.originalValue??numeric(m.value)];
 };
 if(new Set(proofs.map(p=>moneyIdentity(p)[0])).size>1)reasons.push('different_source_currency');
 if(!versions&&new Set(proofs.map(p=>JSON.stringify(moneyIdentity(p)))).size>1)reasons.push('different_source_money');
 let latestPublicId:string|null=null;
 const versionChanges:{from:string;to:string;kind:VersionChangeKind}[]=[];
 if(versions&&proofs.length===ordered.length){
  const versionsByTime=ordered.map(c=>{const p=proofs.find(p=>p.contract===c.publicId)!;
   const dates=p.publishedAt as unknown[];
   if(dates.length!==1||typeof dates[0]!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(dates[0])||!Number.isFinite(Date.parse(dates[0])))reasons.push('unverified_publication_order');
   return {c,p,time:Date.parse(String(dates[0]))};
  }).sort((a,b)=>a.time-b.time||(BigInt(a.c.publicId)<BigInt(b.c.publicId)?-1:1));
  for(let i=1;i<versionsByTime.length;i++){
   const old=versionsByTime[i-1]!,next=versionsByTime[i]!;
   if(contractIdentitySignature(old.c)===contractIdentitySignature(next.c)&&JSON.stringify(moneyIdentity(old.p))===JSON.stringify(moneyIdentity(next.p)))continue;
   if(next.time<=old.time)reasons.push('ambiguous_version_order');
   const explicitAddendum=/valoare modificata prin AA /i.test(next.c.title??'')&&next.c.title!==old.c.title;
   const flagged=(next.p.modificationEvidence as {count:unknown;hasVersions:unknown}[]).some(e=>e.hasVersions===true&&typeof e.count==='number'&&e.count>0);
   if(flagged||explicitAddendum)continue; // unchanged legacy acceptance, no extra evidence
   const kind=versionChangeKind(old.c,next.c,JSON.stringify(moneyIdentity(old.p))!==JSON.stringify(moneyIdentity(next.p)));
   if(kind)versionChanges.push({from:old.c.publicId,to:next.c.publicId,kind});
   else reasons.push('missing_amendment_evidence');
  }
  latestPublicId=versionsByTime.at(-1)?.c.publicId??null;
 }
 const unique=[...new Set(reasons)].sort();
 const status=unique.length===0?'source_verified':unique.every(r=>['missing_archive','incomplete_identity','archive_authority_unverified','missing_procedure'].includes(r))?'needs_evidence':'conflict';
 const id=hash(ordered.map(x=>x.publicId));
 // Accepted unflagged changes are part of the observed evidence; omitted when
 // empty so fingerprints of earlier observations stay unchanged.
 const changes=versionChanges.length?{versionChanges}:{};
 return {id,fingerprint:hash([versions?3:extended?2:1,ordered,proofs,unique,status,...(versionChanges.length?[changes]:[])]),status,reasons:unique,members:ordered,proofs,...changes,methodology:versions?'contract-identity-3':extended?'contract-identity-2':'contract-identity-1',...(versions?{latestPublicId}:{}),decision:'unreviewed' as const};
}
