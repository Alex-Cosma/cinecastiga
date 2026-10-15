import type {ElicitatieClient} from './client.js';
export type NoticeDetailPart='root'|'sad'|'eform'|'general'|'section1'|'section21'|'section3'|'section4'|'section6'|'lots'|'lot';
export interface NoticeDetailParams {
 noticeId:number; internalNoticeId?:number; noticeType:number; noticeVersion?:number; noticeNo?:string;
 part?:NoticeDetailPart; page:number; dfNoticeId?:number; lotId?:number;
}
const AWARDS:Record<number,string>={3:'C',8:'DC',13:'RFQ',16:'PC',18:'RFQ',20:'RFQ'};
const TENDERS:Record<number,[string,string,string]>={
 2:['PUBLICCNotice','getPubCNoticeView','cNoticeId'],6:['PUBLICDCNotice','getDCNoticeView','dcNoticeId'],
 7:['PublicPcNotice','getPCNoticeView','pcNoticeId'],12:['PublicRFQInvitation','getRfqInvitationView','rfqInvitationId'],
 17:['PublicRFQInvitation','getRfqInvitationView','rfqInvitationId'],19:['PublicRFQInvitation','getRfqInvitationView','rfqInvitationId'],
};
export function noticeDetailRequest(p:NoticeDetailParams):{path:string;body?:Record<string,unknown>} {
 if(!Number.isSafeInteger(p.noticeId)||p.noticeId<=0||!Number.isSafeInteger(p.page)||p.page<0||(!AWARDS[p.noticeType]&&!TENDERS[p.noticeType]))throw Error('Detaliu SEAP: metadate de rutare nevalide.');
 const part=p.part??'root';
 if(part==='root'){
  const award=AWARDS[p.noticeType];
  if(award)return {path:`/api-pub/${award}_PUBLIC_CANotice/${p.noticeVersion===1?'get_v1':'get'}/${p.noticeId}`};
  const [api,method,key]=TENDERS[p.noticeType]!;
  return {path:`/api-pub/${api}/${method}/?${key}=${p.noticeId}`};
 }
 if(part==='sad'){
  if(!Number.isSafeInteger(p.internalNoticeId)||p.internalNoticeId!<=0)throw Error('Detaliu SAD: identificatorul intern lipsește.');
  return {path:`/api-pub/NoticeCommon/GetRfqInvitationSadView/?noticeId=${p.internalNoticeId}`};
 }
 if(part==='eform'){
  if(!Number.isSafeInteger(p.internalNoticeId)||p.internalNoticeId!<=0)throw Error('Detaliu eForms: identificatorul intern lipsește.');
  return {path:'/api-pub/ENotice/GetNoticeChangeView/',body:{noticeId:p.internalNoticeId,isNoticeChange:false}};
 }
 if(part==='general')return {path:`/api-pub/comboPub/getNoticeGeneralInfo/?sysNoticeTypeId=${p.noticeType}&noticeId=${p.noticeId}`};
 if(part==='lots')return AWARDS[p.noticeType]
  ?{path:'/api-pub/PC_PUBLIC_CANotice/GetCANoticeLots_v2/',body:{caNoticeId:p.noticeId,pageIndex:p.page,pageSize:100}}
  :{path:'/api-pub/NoticeCommon/GetSection22LotList/',body:{initNoticeId:p.noticeId,sysNoticeTypeId:p.noticeType,sortProperty:'no',descending:false,pageIndex:p.page,pageSize:100}};
 const section={section1:'1',section21:'21',section3:'3',section4:'4',section6:'6',lot:'22Lot'}[part];
 if(!section)throw Error('Detaliu SEAP: secțiune necunoscută.');
 let query=`initNoticeId=${p.noticeId}&sysNoticeTypeId=${p.noticeType}`;
 if(part==='section21'||part==='lot'){
  if(!Number.isSafeInteger(p.dfNoticeId)||p.dfNoticeId!<=0)throw Error('Detaliu SEAP: identificatorul documentației lipsește.');
  query+=`&dfNoticeId=${p.dfNoticeId}`;
 }
 if(part==='lot'){
  if(!Number.isSafeInteger(p.lotId)||p.lotId!<=0)throw Error('Detaliu SEAP: identificatorul lotului lipsește.');
  query+=`&noticeLotId=${p.lotId}`;
 }
 return {path:`/api-pub/NoticeCommon/GetSection${section}View/?${query}`};
}
export async function getNoticeDetailPart(client:ElicitatieClient,p:NoticeDetailParams){
 const {path,body}=noticeDetailRequest(p);
 return body?client.http.postJson<unknown>(path,body):client.http.getJson<unknown>(path);
}
