import {type NoticeDetailParams,type NoticeDetailPart} from '@seap/scraper-clients';
import {task,type Task,type TaskPlan,type PageResult} from './plan.js';
/** A rejected public detail is a visible gap for this notice, never a completed archive. */
export class NoticeDetailValidationError extends Error {}
const fail=(message:string):never=>{throw new NoticeDetailValidationError(`Detaliu SEAP: ${message}`);};
const positive=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>0;
export function planNoticeDetail(t:Task,value:unknown,previous:PageResult[]):TaskPlan{
 const p=t.params as NoticeDetailParams,part=p.part??'root',award=t.stream==='awards';
 if(!value||typeof value!=='object'||Array.isArray(value)||!Object.keys(value).length)fail('răspuns fără conținut.');
 const v=value as Record<string,any>;
 if(v.hasError===true||v.hasErrors===true||v.canViewPublic===false||Array.isArray(v.errorList)&&v.errorList.length)fail('sursa nu confirmă un formular disponibil.');
 const children:Task[]=[];
 const child=(part:NoticeDetailPart,extra:Partial<NoticeDetailParams>={})=>children.push(task(t.batch_id,t.stream,'detail',{...p,part,page:0,...extra},1));
 const identity=(actual:unknown,expected:unknown,label:string)=>{if(actual!==expected)fail(`identitatea ${label} nu corespunde.`);};
 let result:TaskPlan['result']={detail:true};
 if(part==='root'){
  const publicId=award?v.caNoticeID??v.caNoticeId:v.cNoticeId??v.rfqInvitationId??v.pcNoticeId??v.entityID;
  identity(publicId,p.noticeId,'publică');
  const internal=v.noticeID??v.noticeId;
  if(!positive(internal))fail('identificatorul intern lipsește.');
  if(p.internalNoticeId)identity(internal,p.internalNoticeId,'internă');
  if(p.noticeNo&&(v.noticeNumber??v.noticeNo))identity(v.noticeNumber??v.noticeNo,p.noticeNo,'anunțului');
  if(v.sysNoticeType?.id)identity(v.sysNoticeType.id,p.noticeType,'tipului');
  const hasEform=award?v.conditions?.hasEformsDocument:v.hasEformsDocuments;
  if(typeof hasEform!=='boolean')fail('formatul formularului nu este confirmat.');
  if(p.noticeType===19)child('sad',{internalNoticeId:internal});
  else if(hasEform)child('eform',{internalNoticeId:internal});
  else if(award){
   if(!v.caNoticeEdit_New&&!v.caNoticeEdit_New_U)fail('secțiunile atribuirii lipsesc.');
   child('lots');
  }else child('general',{internalNoticeId:internal});
 }else if(part==='sad'){
  identity(v.noticeId,p.internalNoticeId,'SAD');
  identity(v.sysNoticeTypeId,p.noticeType,'tipului SAD');
  identity(v.initNoticeId,p.noticeId,'publică SAD');
  if(!v.noticeInformation||!v.noticeAddress)fail('formularul SAD este incomplet.');
 }else if(part==='eform'){
  identity(v.headerModel?.noticeId,p.internalNoticeId,'eForms');
  identity(v.headerModel?.sysNoticeType?.id,p.noticeType,'tipului eForms');
  if(p.noticeNo)identity(v.headerModel?.noticeNumber,p.noticeNo,'numărului eForms');
  if(typeof v.changeNoticeHtml!=='string'||v.changeNoticeHtml.trim().length<100)fail('formularul eForms este gol.');
 }else if(part==='general'){
  identity(v.noticeId,p.internalNoticeId,'documentației');
  if(!positive(v.dfNoticeId))fail('documentația de atribuire lipsește.');
  for(const section of ['section1','section21','section3','section4','section6','lots'] as const)child(section,{dfNoticeId:v.dfNoticeId});
 }else if(part==='lots'){
  if(!Array.isArray(v.items)||!Number.isSafeInteger(v.total)||v.total<0||v.searchTooLong)fail('inventarul loturilor este nevalid.');
  const ids=v.items.map((i:any)=>i.noticeLotID??i.noticeLotId);
  if(ids.some((id:unknown)=>!positive(id))||new Set(ids).size!==ids.length)fail('identificatori de lot lipsă sau repetați.');
  const before=previous.flatMap(r=>r.ids);
  if(previous.some(r=>r.total!==v.total)||before.length!==p.page*100||v.items.length!==Math.min(100,Math.max(0,v.total-before.length))||new Set([...before,...ids]).size!==before.length+ids.length)fail('paginarea loturilor nu se reconciliază.');
  if(!award)for(const lotId of ids)child('lot',{lotId});
  if(before.length+ids.length<v.total)child('lots',{page:p.page+1});
  result={total:v.total,ids};
 }else{
  // Common sections have no public ID echo: their parent was identity-verified.
  // Require the documented shape, not merely an arbitrary nonempty JSON object.
  const signature:Record<string,string>={section1:'noticeEntityAddress',section21:'mainCpvCode',section3:'hasError',section4:'hasError',section6:'hasError',lot:'mainCpvCode'};
  if(!(signature[part]! in v))fail('structura secțiunii nu este recunoscută.');
  if(part==='section21'&&p.noticeNo&&v.noticeNo)identity(v.noticeNo,p.noticeNo,'secțiunii');
  if(part==='lot'&&v.sysNoticeTypeId)identity(v.sysNoticeTypeId,p.noticeType,'lotului');
 }
 const prefix=award?'award':'tender';
 return {status:'complete',result,children,docs:[{source:'elicitatie',externalId:`${prefix}:${p.noticeId}${part==='root'?'':`:${part}${p.lotId?`:${p.lotId}`:''}${part==='lots'?`:${p.page}`:''}`}`,endpointVersion:`${prefix}-detail-${part}:v2`,payload:{noticeId:p.noticeId,internalNoticeId:p.internalNoticeId,noticeType:p.noticeType,noticeNo:p.noticeNo,part,page:p.page,...(p.lotId?{lotId:p.lotId}:{}),data:value}}]};
}
