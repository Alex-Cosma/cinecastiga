export const COLLECTION_STREAMS=['da','tenders','awards','documents','catalogue','ted'] as const;
export type CollectionStream=typeof COLLECTION_STREAMS[number];
export interface CollectionSettings {revision:number;minSeconds:number;maxSeconds:number;dailyLimit:number|null;processingTime:string;paused:boolean;pausedStreams:string[]}
export function validateCollectionSettings(value:unknown):Omit<CollectionSettings,'paused'|'pausedStreams'>{
 const v=value as Record<string,unknown>;
 if(!v||typeof v!=='object'||!Number.isSafeInteger(v.revision)||Number(v.revision)<1)throw Error('Versiunea setărilor lipsește. Reîncarcă pagina.');
 if(!Number.isInteger(v.minSeconds)||!Number.isInteger(v.maxSeconds)||Number(v.minSeconds)<1||Number(v.maxSeconds)>3600||Number(v.minSeconds)>Number(v.maxSeconds))throw Error('Intervalul trebuie să fie între 1 și 3.600 secunde, cu minimum ≤ maximum.');
 if(v.dailyLimit!==null&&(!Number.isSafeInteger(v.dailyLimit)||Number(v.dailyLimit)<1||Number(v.dailyLimit)>10_000_000))throw Error('Limita zilnică trebuie să fie între 1 și 10.000.000 de cereri.');
 if(typeof v.processingTime!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.processingTime))throw Error('Ora procesării nu este validă.');
 return {revision:Number(v.revision),minSeconds:Number(v.minSeconds),maxSeconds:Number(v.maxSeconds),dailyLimit:v.dailyLimit as number|null,processingTime:v.processingTime};
}
/** Only search identifiers/filters, never credentials, URLs, free text, headers or payload records. */
export function safeCollectionParameters(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=='object')return {};
 const out:Record<string,unknown>={};
 const allowed=['page','limit','publicationDate','pageIndex','pageSize','skip','take','contractingAuthorityId','caNoticeId','cNoticeId','rfqInvitationId','pcNoticeId','dcNoticeId','noticeId','noticeLotId','dfNoticeId','initNoticeId','sysNoticeTypeId','sysNoticeTypeIds','finalizationDateStart','finalizationDateEnd','startPublicationDate','endPublicationDate'];
 for(const key of allowed){const v=(value as Record<string,unknown>)[key];if(v===null||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&/^\d{4}-\d{2}-\d{2}(?:[T\d:.+Z-]*)$/.test(v)||Array.isArray(v)&&v.length<20&&v.every(x=>Number.isSafeInteger(x)))out[key]=v;}
 const cpv=(value as Record<string,unknown>).cpvCodeText;
 if(typeof cpv==='string'&&/^\d{2,8}$/.test(cpv))out.cpvCodeText=cpv;
 const publication=(value as Record<string,unknown>).publicationNumber;
 if(typeof publication==='string'&&TED_PUBLICATION.test(publication))out.publicationNumber=publication;
 const ojs=(value as Record<string,unknown>).ojs;
 if(typeof ojs==='string'&&TED_OJS.test(ojs))out.ojs=ojs;
 if(typeof (value as Record<string,unknown>).isNoticeChange==='boolean')out.isNoticeChange=(value as Record<string,unknown>).isNoticeChange;
 return out;
}
const TED_PUBLICATION=/^\d{1,8}-\d{4}$/;
/** OJ S issue: year + issue number zero-padded to 5 digits (e.g. 202600200). */
export const TED_OJS=/^(\d{4})(\d{5})$/;
/** TED answers 429 to package downloads about a minute apart (16 October 2026) and again after
 * seven downloads ten minutes apart (17 October): at least 30 minutes between two packages, any issue. */
export const TED_PACKAGE_SPACING_MS=1_800_000;
/** TED (EU Official Journal) goes through the same gate and proxies as SEAP, but
 * only these two exact resources: the search API (day verification) and one OJ S
 * daily package. The per-notice XML route is not admitted: TED's WAF challenges it
 * from the proxies (202/429 with x-amzn-waf-action and an empty body). */
export const TED_SEARCH_URL='https://api.ted.europa.eu/v3/notices/search';
export const tedDailyPackageUrl=(ojs:string)=>{
 if(!TED_OJS.test(ojs)||Number(ojs.slice(4))<1)throw Error('Număr OJ S nevalid.');
 return `https://ted.europa.eu/packages/daily/${ojs}`;
};
export function isTedCollectionUrl(url:string){
 const u=new URL(url);
 return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&(
  u.hostname==='api.ted.europa.eu'&&u.pathname==='/v3/notices/search'||
  u.hostname==='ted.europa.eu'&&/^\/packages\/daily\/\d{9}$/.test(u.pathname));
}
export function safeCollectionEndpoint(url:string){
 const u=new URL(url,'https://www.e-licitatie.ro'),path=u.pathname;
 if(u.hostname.endsWith('ted.europa.eu')){
  if(!isTedCollectionUrl(u.href))throw Error('Endpoint TED neacceptat.');
  return `${u.hostname}${path}`;
 }
 if(!['www.e-licitatie.ro','e-licitatie.ro'].includes(u.hostname))throw Error('Endpoint SEAP neacceptat.');
 if(path.startsWith('/api-pub/files/noticedoc/'))return '/api-pub/files/noticedoc/{fișier}';
 // Public notice UI modules are used for bounded API discovery through the same request budget.
 if(/^\/views\/pub\/(?:notices|sad)\/[\w/-]+(?:\.min)?\.js$/.test(path))return path.slice(0,300);
 if(!/^\/(api-pub|pub)\/[\w/.-]+$/.test(path))throw Error('Endpoint SEAP neacceptat.');
 return path.slice(0,300);
}
export function retryAfterSeconds(value:string|null,now=Date.now()):number|null{
 if(!value)return null;const numeric=Number(value),secs=Number.isFinite(numeric)?numeric:(Date.parse(value)-now)/1000;
 return Number.isFinite(secs)&&secs>=0?Math.min(30*86400,Math.ceil(secs)):null;
}
